import type { Confidence, EngineId } from './types';

/**
 * Heuristic engine detection.
 *
 * Detection reads the file *layout* of a candidate mod plus any metadata files
 * it can parse. It never claims certainty it does not have: every result
 * carries a score, human-readable evidence, and the runners-up, and the UI lets
 * the user override the guess.
 */

export interface DetectionMetadata {
  /** Parsed pack.json, if present. */
  pack?: unknown;
  /** Parsed mod.json, if present. */
  mod?: unknown;
  /** Parsed _polymod_meta.json, if present. */
  polymod?: unknown;
  /** Contents of gitVersion.txt / version.txt, if present. */
  versionText?: string;
}

export interface DetectionInput {
  /** Convenience label, usually the mod folder name. */
  root: string;
  /** Paths relative to the candidate root, original case. */
  paths: string[];
  metadata?: DetectionMetadata;
}

export interface DetectionResult {
  engine: EngineId | null;
  engineVersion: string | null;
  confidence: Confidence;
  score: number;
  evidence: string[];
  alternatives: Array<{ engine: EngineId; score: number }>;
}

interface RuleContext {
  root: string;
  files: Set<string>;
  list: string[];
  pack: Record<string, unknown> | null;
  mod: Record<string, unknown> | null;
  polymod: Record<string, unknown> | null;
  versionText: string | null;
}

interface Rule {
  engine: EngineId;
  weight: number;
  label: string;
  test: (ctx: RuleContext) => boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function hasAnyKey(obj: Record<string, unknown> | null, keys: string[]): boolean {
  if (!obj) return false;
  return keys.some((k) => k in obj);
}

export function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function buildContext(input: DetectionInput): RuleContext {
  const list = input.paths.map(normalizePath).filter(Boolean);
  return {
    root: normalizePath(input.root || ''),
    files: new Set(list),
    list,
    pack: asRecord(input.metadata?.pack),
    mod: asRecord(input.metadata?.mod),
    polymod: asRecord(input.metadata?.polymod),
    versionText: input.metadata?.versionText ?? null,
  };
}

function anyMatch(ctx: RuleContext, re: RegExp): boolean {
  return ctx.list.some((p) => re.test(p));
}

function hasFile(ctx: RuleContext, name: string): boolean {
  return ctx.files.has(name) || ctx.list.some((p) => p.endsWith('/' + name));
}

/**
 * Each rule is a piece of evidence, not a proof. Weights were chosen so that a
 * single strong marker (pack.json, _polymod_meta.json, a Codename-specific key)
 * is decisive, while ambiguous shared markers (data/ folders, charts) are not.
 */
const RULES: Rule[] = [
  // ---- Psych Engine -------------------------------------------------------
  {
    engine: 'psych',
    weight: 30,
    label: 'pack.json present',
    test: (c) => hasFile(c, 'pack.json'),
  },
  {
    engine: 'psych',
    weight: 20,
    label: 'pack.json contains Psych mod fields',
    test: (c) => hasAnyKey(c.pack, ['restartSong', 'description', 'color']),
  },
  {
    engine: 'psych',
    weight: 15,
    label: 'Lua scripts under scripts/ or data/',
    test: (c) => anyMatch(c, /(^|\/)(scripts|data)\/.*\.lua$/),
  },
  {
    engine: 'psych',
    weight: 10,
    label: 'song folders under data/',
    test: (c) => anyMatch(c, /(^|\/)data\/[^/]+\/[^/]+\.json$/),
  },
  {
    engine: 'psych',
    weight: 8,
    label: 'no mod.json (Psych uses pack.json)',
    test: (c) => !hasFile(c, 'mod.json') && hasFile(c, 'pack.json'),
  },
  {
    engine: 'psych',
    weight: 25,
    label: 'folder or metadata names Psych',
    test: (c) =>
      c.root.includes('psych') ||
      (str(c.pack?.['engine']) ?? '').toLowerCase().includes('psych'),
  },

  // ---- V-Slice -----------------------------------------------------------
  {
    engine: 'vslice',
    weight: 50,
    label: '_polymod_meta.json present',
    test: (c) => hasFile(c, '_polymod_meta.json'),
  },
  {
    engine: 'vslice',
    weight: 40,
    label: 'mod.json declares api_version',
    test: (c) => hasAnyKey(c.mod, ['api_version']),
  },
  {
    engine: 'vslice',
    weight: 30,
    label: 'pack.json uses V-Slice fields',
    test: (c) => hasAnyKey(c.pack, ['title', 'api_version']),
  },
  {
    engine: 'vslice',
    weight: 20,
    label: '_polymod_icon.png present',
    test: (c) => hasFile(c, '_polymod_icon.png'),
  },
  {
    engine: 'vslice',
    weight: 18,
    label: 'songs/ or data/songs/ song folders',
    test: (c) => anyMatch(c, /(^|\/)(songs|data\/songs)\/[^/]+/),
  },

  // ---- Kade Engine -------------------------------------------------------
  {
    engine: 'kade',
    weight: 35,
    label: 'assetsMods/ directory (Kade mod layout)',
    test: (c) => anyMatch(c, /(^|\/)assetsmods\//),
  },
  {
    engine: 'kade',
    weight: 30,
    label: 'ModCore files present',
    test: (c) => anyMatch(c, /(^|\/)modcore/),
  },
  {
    engine: 'kade',
    weight: 20,
    label: 'folder or metadata names Kade',
    test: (c) => c.root.includes('kade') || (str(c.mod?.['engine']) ?? '').toLowerCase().includes('kade'),
  },
  {
    engine: 'kade',
    weight: 12,
    label: 'bare chart files with no Psych/V-Slice manifest',
    test: (c) =>
      anyMatch(c, /(^|\/)data\/[^/]+\.json$/) && !hasFile(c, 'pack.json') && !hasFile(c, 'mod.json'),
  },

  // ---- Codename Engine ---------------------------------------------------
  {
    engine: 'codename',
    weight: 45,
    label: 'mod.json contains Codename-specific fields',
    test: (c) => hasAnyKey(c.mod, ['codename', 'codenameVersion', 'codename_version']),
  },
  {
    engine: 'codename',
    weight: 30,
    label: 'Haxe scripts (.hx/.hxs/.hscript)',
    test: (c) => anyMatch(c, /\.(hx|hxs|hscript)$/),
  },
  {
    engine: 'codename',
    weight: 20,
    label: 'assets/ with data/charts/',
    test: (c) => anyMatch(c, /(^|\/)assets\//) && anyMatch(c, /(^|\/)data\/charts\//),
  },
  {
    engine: 'codename',
    weight: 25,
    label: 'folder names Codename',
    test: (c) => c.root.includes('codename'),
  },
];

function scoreToConfidence(score: number): Confidence {
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 25) return 'low';
  return 'none';
}

const MIN_ACCEPT_SCORE = 25;

export function detectEngine(input: DetectionInput): DetectionResult {
  const ctx = buildContext(input);
  const scores = new Map<EngineId, number>();
  const evidence = new Map<EngineId, string[]>();

  for (const rule of RULES) {
    if (!rule.test(ctx)) continue;
    scores.set(rule.engine, (scores.get(rule.engine) ?? 0) + rule.weight);
    const list = evidence.get(rule.engine) ?? [];
    list.push(rule.label);
    evidence.set(rule.engine, list);
  }

  const ranked = [...scores.entries()]
    .map(([engine, score]) => ({ engine, score: Math.min(score, 100) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  if (!top || top.score < MIN_ACCEPT_SCORE) {
    return {
      engine: null,
      engineVersion: null,
      confidence: 'none',
      score: top?.score ?? 0,
      evidence: top ? (evidence.get(top.engine) ?? []) : [],
      alternatives: ranked.slice(1, 3),
    };
  }

  return {
    engine: top.engine,
    engineVersion: readEngineVersion(ctx, top.engine),
    confidence: scoreToConfidence(top.score),
    score: top.score,
    evidence: evidence.get(top.engine) ?? [],
    alternatives: ranked.slice(1, 3),
  };
}

function readEngineVersion(ctx: RuleContext, engine: EngineId): string | null {
  const fromMeta =
    str(ctx.mod?.['api_version']) ??
    str(ctx.pack?.['api_version']) ??
    str(ctx.mod?.['engine_version']) ??
    str(ctx.pack?.['engine_version']);
  if (fromMeta) return fromMeta;

  if (engine === 'psych') {
    const fromPack = str(ctx.pack?.['version']);
    if (fromPack) return fromPack;
  }

  const versionText = ctx.versionText?.trim();
  if (versionText && versionText.length <= 40) {
    return versionText.replace(/^v/i, '');
  }

  return null;
}
