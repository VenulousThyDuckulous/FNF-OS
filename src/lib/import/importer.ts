import { analyzeMod, type CompatibilityReport } from '../compat/analyze';
import { findByFingerprint, type ModRecord } from '../db';
import { detectEngine, normalizePath, type DetectionResult } from '../engines/detect';
import { getEngine } from '../engines/registry';
import type { EngineId } from '../engines/types';
import { fingerprintFiles, shortId } from '../hash';
import { formatBytes } from './safety';
import { readZip, ZipError, type EntryMap } from './zip';

/**
 * The import pipeline.
 *
 * 1. Read the archive (or folder) with hard limits - see safety.ts / zip.ts.
 * 2. Split it into candidate mods: every directory carrying a manifest, every
 *    immediate child of a `mods/` folder, and the archive root when it looks
 *    like a complete game build.
 * 3. Read metadata, detect the engine, analyse features, fingerprint.
 * 4. Hand the candidates back for confirmation. Nothing is stored until then.
 */

export interface ModCandidate {
  key: string;
  /** Path prefix inside the archive; '' means the archive root. */
  root: string;
  name: string;
  paths: string[];
  files: EntryMap;
  detection: DetectionResult;
  compat: CompatibilityReport;
  fingerprint: string;
  bytes: number;
  coverPath: string | null;
  kind: 'mod' | 'game';
  /** Where the bytes came from, for the mod record's provenance. */
  sourceKind: 'zip' | 'folder';
  duplicateId: string | null;
  duplicateName: string | null;
}

export interface ImportScan {
  candidates: ModCandidate[];
  issues: string[];
  warnings: string[];
  totals: { entries: number; bytes: number };
  fileName: string;
  sourceKind: 'zip' | 'folder' | 'game';
}

const MANIFESTS = ['pack.json', 'mod.json', '_polymod_meta.json'];
const METADATA_MAX_BYTES = 512 * 1024;
const MAX_CANDIDATES = 250;
const MAX_COVER_BYTES = 2 * 1024 * 1024;

export type ProgressReporter = (stage: string, ratio: number) => void;

export function parseJsonSafe(bytes: Uint8Array | undefined): unknown {
  if (!bytes || bytes.length > METADATA_MAX_BYTES) return undefined;
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return undefined;
  }
}

/** Drop a shared top-level directory when every entry sits inside it. */
export function stripCommonRoot(paths: string[]): { prefix: string; paths: string[] } {
  if (paths.length === 0) return { prefix: '', paths };
  const first = paths[0].split('/')[0];
  const allInside = paths.every((p) => p.split('/')[0] === first && p.includes('/'));
  if (!allInside) return { prefix: '', paths };
  const prefix = `${first}/`;
  return { prefix, paths: paths.map((p) => p.slice(prefix.length)) };
}

function candidateRoots(paths: readonly string[]): string[] {
  const roots = new Set<string>();

  for (const raw of paths) {
    const segments = normalizePath(raw).split('/');
    if (MANIFESTS.includes(segments[segments.length - 1])) {
      roots.add(segments.slice(0, -1).join('/'));
    }
  }

  // Children of a mods/ folder without a manifest are still plausible mods.
  for (const raw of paths) {
    const normalized = normalizePath(raw);
    if (!normalized.startsWith('mods/')) continue;
    const rest = normalized.slice('mods/'.length);
    const child = rest.split('/')[0];
    if (child && rest.includes('/')) roots.add(`mods/${child}`);
  }

  return [...roots].filter((root) => root !== 'mods').sort((a, b) => a.length - b.length);
}

function pickLongestRoot(path: string, roots: string[]): string {
  let match = '';
  for (const root of roots) {
    if (path === root || path.startsWith(`${root}/`)) {
      if (root.length > match.length) match = root;
    }
  }
  return match;
}

function findCover(paths: string[]): string | null {
  const preferred = ['pack.png', 'icon.png', '_polymod_icon.png', 'cover.png', 'banner.png', 'preview.png'];
  for (const name of preferred) {
    const found = paths.find((p) => p.toLowerCase() === name);
    if (found) return found;
  }
  return paths.find((p) => /(^|\/)(icon|cover|banner)[^/]*\.(png|jpg|jpeg|webp)$/i.test(p)) ?? null;
}

function looksLikeGame(paths: string[]): boolean {
  const lower = paths.map(normalizePath);
  const hasExe = lower.some((p) => p.endsWith('.exe'));
  const hasAssets = lower.some((p) => p.startsWith('assets/'));
  const hasProject = lower.includes('project.xml');
  return hasAssets && (hasExe || hasProject || lower.some((p) => p.startsWith('mods/')));
}

function prettyName(root: string, fileName: string): string {
  const raw = root ? root.split('/').filter(Boolean).pop() ?? root : fileName.replace(/\.(zip|fnfos)$/i, '');
  return raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled mod';
}

export async function scanZip(
  data: Uint8Array,
  fileName: string,
  onProgress?: ProgressReporter,
): Promise<ImportScan> {
  onProgress?.('Reading archive', 0.05);
  const archive = await readZip(data, {
    onProgress: (processed, total) => {
      if (total > 0) onProgress?.('Reading archive', 0.05 + (processed / total) * 0.15);
    },
  });

  if (archive.files.size === 0) {
    throw new ZipError('The archive contains no readable files.');
  }

  const notes = [...archive.notes];
  const warnings = archive.issues.filter((i) => i.severity === 'warning').map((i) => i.message);
  const blocking = archive.issues.filter((i) => i.severity === 'error').map((i) => i.message);

  const scan = await buildCandidates(archive.files, fileName, 'zip', onProgress);
  return {
    ...scan,
    issues: [...blocking, ...scan.issues],
    warnings: [...warnings, ...notes, ...scan.warnings],
  };
}

/** Build an entry map from a folder selection (`webkitdirectory` or drag-in). */
export async function readFolderFiles(files: File[], onProgress?: ProgressReporter): Promise<EntryMap> {
  const map: EntryMap = new Map();
  let index = 0;
  for (const file of files) {
    const path = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(
      /\\/g,
      '/',
    );
    const buffer = new Uint8Array(await file.arrayBuffer());
    map.set(path, buffer);
    index += 1;
    if (index % 25 === 0) onProgress?.(`Reading ${file.name}`, index / files.length);
  }
  return map;
}

export async function scanFolder(
  files: File[],
  folderName: string,
  onProgress?: ProgressReporter,
): Promise<ImportScan> {
  if (files.length === 0) throw new ZipError('That folder is empty.');
  onProgress?.('Reading folder', 0.05);
  const map = await readFolderFiles(files, onProgress);
  return buildCandidates(map, folderName, 'folder', onProgress);
}

async function buildCandidates(
  archiveFiles: EntryMap,
  fileName: string,
  containerKind: 'zip' | 'folder',
  onProgress?: ProgressReporter,
): Promise<ImportScan> {
  onProgress?.('Splitting archive', 0.25);

  const stripped = stripCommonRoot([...archiveFiles.keys()]);
  const files: EntryMap = new Map();
  if (stripped.prefix) {
    for (const [path, bytes] of archiveFiles) files.set(path.slice(stripped.prefix.length), bytes);
  } else {
    for (const [path, bytes] of archiveFiles) files.set(path, bytes);
  }

  const roots = candidateRoots([...files.keys()]);
  const isGame = looksLikeGame([...files.keys()]);
  const groups: Array<{ root: string; paths: string[]; kind: 'mod' | 'game' }> = [];
  const warnings: string[] = [];

  if (roots.length === 0) {
    groups.push({ root: '', paths: [...files.keys()], kind: isGame ? 'game' : 'mod' });
  } else {
    const assignment = new Map<string, string[]>();
    for (const path of files.keys()) {
      const root = pickLongestRoot(path, roots);
      const list = assignment.get(root) ?? [];
      list.push(path);
      assignment.set(root, list);
    }
    for (const [root, paths] of assignment) groups.push({ root, paths, kind: 'mod' });
    if (isGame) groups.unshift({ root: '', paths: [...files.keys()], kind: 'game' });
  }

  if (groups.length > MAX_CANDIDATES) {
    warnings.push(`Only the first ${MAX_CANDIDATES} mods in this archive were scanned.`);
  }

  const candidates: ModCandidate[] = [];
  const limited = groups.slice(0, MAX_CANDIDATES);
  let processed = 0;

  for (const group of limited) {
    processed += 1;
    onProgress?.(
      `Analysing ${group.root || fileName}`,
      0.3 + (processed / Math.max(limited.length, 1)) * 0.6,
    );

    const relativePaths = group.paths.map((p) => (group.root ? p.slice(group.root.length + 1) : p));
    const subset: EntryMap = new Map();
    for (let i = 0; i < group.paths.length; i += 1) {
      const bytes = files.get(group.paths[i]);
      if (bytes) subset.set(relativePaths[i], bytes);
    }

    const lookup = new Map(relativePaths.map((p, i) => [normalizePath(p), group.paths[i]]));
    const readMeta = (name: string) => {
      const key = lookup.get(name);
      return parseJsonSafe(key ? files.get(key) : undefined);
    };

    const detection = detectEngine({
      root: group.root.split('/').filter(Boolean).pop() ?? '',
      paths: relativePaths,
      metadata: {
        pack: readMeta('pack.json'),
        mod: readMeta('mod.json'),
        polymod: readMeta('_polymod_meta.json'),
      },
    });

    const compat = analyzeMod({
      engine: detection.engine,
      engineVersion: detection.engineVersion,
      paths: relativePaths,
    });

    const fingerprint = await fingerprintFiles(subset);
    const existing = await findByFingerprint(fingerprint).catch(() => undefined);

    candidates.push({
      key: shortId('c'),
      root: group.root,
      name: prettyName(group.root, fileName),
      paths: relativePaths,
      files: subset,
      detection,
      compat,
      fingerprint,
      bytes: [...subset.values()].reduce((sum, bytes) => sum + bytes.length, 0),
      coverPath: findCover(relativePaths),
      kind: group.kind,
      sourceKind: containerKind,
      duplicateId: existing?.id ?? null,
      duplicateName: existing?.name ?? null,
    });
  }

  onProgress?.('Scan complete', 1);

  return {
    candidates,
    issues: [],
    warnings,
    totals: { entries: files.size, bytes: [...files.values()].reduce((sum, b) => sum + b.length, 0) },
    fileName,
    sourceKind: isGame ? 'game' : 'zip',
  };
}

/** Extract a cover image from a candidate, if one exists and is small enough. */
export function coverFromCandidate(candidate: ModCandidate): Blob | null {
  if (!candidate.coverPath) return null;
  const bytes = candidate.files.get(candidate.coverPath);
  if (!bytes || bytes.length > MAX_COVER_BYTES) return null;
  const extension = candidate.coverPath.split('.').pop()?.toLowerCase();
  const type =
    extension === 'jpg' || extension === 'jpeg'
      ? 'image/jpeg'
      : extension === 'webp'
        ? 'image/webp'
        : 'image/png';
  return new Blob([bytes as unknown as BlobPart], { type });
}

/** Turn a confirmed candidate into the record that gets stored. */
export function toModRecord(
  candidate: ModCandidate,
  options: { engine?: EngineId | null; sourceFileName?: string; sourceKind?: ModRecord['source']['kind'] } = {},
): ModRecord {
  const engine = options.engine === undefined ? candidate.detection.engine : options.engine;
  const overridden = options.engine !== undefined && options.engine !== candidate.detection.engine;
  const compat = analyzeMod({
    engine,
    engineVersion: candidate.detection.engineVersion,
    paths: candidate.paths,
  });

  return {
    id: shortId('mod'),
    name: candidate.name,
    originalName: candidate.name,
    engine,
    engineVersion: candidate.detection.engineVersion,
    detectionConfidence: candidate.detection.confidence,
    detectionScore: candidate.detection.score,
    detectionEvidence: candidate.detection.evidence,
    engineOverridden: overridden,
    fileCount: candidate.files.size,
    bytes: candidate.bytes,
    fingerprint: candidate.fingerprint,
    coverPath: candidate.coverPath,
    importedAt: new Date().toISOString(),
    lastPlayedAt: null,
    favourite: false,
    collectionIds: [],
    tags: [],
    runtimeVersion: null,
    compat,
    source: {
      kind: options.sourceKind ?? (candidate.kind === 'game' ? 'game' : candidate.sourceKind),
      fileName: options.sourceFileName,
    },
    kind: candidate.kind,
  };
}

export function describeCandidate(candidate: ModCandidate): string {
  const label = getEngine(candidate.detection.engine)?.shortName ?? 'Unknown engine';
  return [label, `${candidate.files.size} files`, formatBytes(candidate.bytes)].join(' - ');
}

export function summariseScan(scan: ImportScan): string {
  if (scan.candidates.length === 0) return 'No mods found.';
  if (scan.candidates.length === 1) return '1 mod found.';
  return `${scan.candidates.length} mods found.`;
}
