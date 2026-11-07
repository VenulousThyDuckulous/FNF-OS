import type { EntryMap } from '../import/zip';
import { resolveCharacterAssets, resolveStageAssets, type CharacterAssets, type StageAssets } from './characters';
import { ChartError, parseChart, type ParsedChart } from './chart';
import { isSupportedEvent } from './events';
import { resolveNoteSkin, type NoteSkinSource } from './skins';
import {
  isVSliceChart,
  parseVSliceChart,
  parseVSliceMetadata,
  vsliceDifficulties,
  type VSliceMetadata,
} from './vslice';

/**
 * Turning an imported mod into something playable.
 *
 * The steps are deliberately explicit and each can fail on its own:
 *
 * 1. find chart files inside the mod (Psych `data/**` charts and V-Slice
 *    `songs/**` charts),
 * 2. parse them in the dialect they are actually written in,
 * 3. find the instrumental (and vocals) for the song,
 * 4. find the optional art - note skin, characters, stage,
 * 5. report what will not be honoured (Lua, unsupported events, custom notes).
 *
 * Anything missing produces a named failure with the path that was looked for,
 * so the player shows a real cause instead of a generic error.
 */

export interface SongListing {
  /** Stable id: chart path, plus the difficulty for V-Slice charts. */
  id: string;
  chartPath: string;
  directory: string;
  difficulty: string;
  title: string;
  format: 'psych' | 'vslice';
  chart: ParsedChart;
}

export interface ScenePaths {
  noteSkin: NoteSkinSource | null;
  player: CharacterAssets | null;
  opponent: CharacterAssets | null;
  stage: StageAssets;
}

export interface PlayableSong extends SongListing {
  audio: { instrumental: string; voices: string | null };
  assets: ScenePaths;
  warnings: string[];
  unsupportedEvents: string[];
}

export type PrepareFailure = { reason: string; detail: string };
export type PrepareResult = { ok: true; song: PlayableSong } | { ok: false; failure: PrepareFailure };

const AUDIO_EXTENSIONS = ['ogg', 'mp3', 'wav'] as const;

/** Psych: `data/<anything>/<file>.json`, with an optional `assets/` root. */
const PSYCH_CHART_RE = /(^|\/)(?:assets\/)?data\/(.+)\/([^/]+)\.json$/;
/** V-Slice: `songs/<song>/<file>.json`, with an optional `assets/` root. */
const VSLICE_CHART_RE = /(^|\/)(?:assets\/)?songs\/([^/]+)\/([^/]+)\.json$/;

const CONFIG_BASENAMES = new Set(['config', 'reset', 'options', 'preferences', 'metadata', 'meta']);

const MAX_CHART_BYTES = 16 * 1024 * 1024;

function buildIndex(files: EntryMap): Map<string, string> {
  const index = new Map<string, string>();
  for (const path of files.keys()) index.set(path.toLowerCase(), path);
  return index;
}

function readText(files: EntryMap, path: string): string | null {
  const bytes = files.get(path);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export function difficultyFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('erect')) return 'erect';
  if (lower.includes('nightmare')) return 'nightmare';
  if (lower.includes('hard')) return 'hard';
  if (lower.includes('easy')) return 'easy';
  if (lower.includes('normal')) return 'normal';
  return 'normal';
}

/** Read `metadata.json` sitting next to a V-Slice chart, if present. */
function readMetadata(files: EntryMap, chartPath: string): VSliceMetadata | null {
  const directory = chartPath.slice(0, chartPath.lastIndexOf('/'));
  const stem = chartPath.slice(chartPath.lastIndexOf('/') + 1).replace(/\.json$/i, '');

  const candidates = [`${directory}/metadata.json`, `${directory}/${stem}-metadata.json`, `${directory}/meta.json`];
  for (const candidate of candidates) {
    const text = readText(files, candidate);
    if (!text) continue;
    try {
      const parsed = parseVSliceMetadata(JSON.parse(text) as unknown);
      if (parsed) return parsed;
    } catch {
      // A malformed metadata file must not stop the chart from being read.
    }
  }
  return null;
}

/**
 * List every chart in a mod that this runtime can read. Unparseable charts are
 * reported with their problem rather than dropped silently.
 */
export function listSongs(files: EntryMap): { songs: SongListing[]; problems: string[] } {
  const songs: SongListing[] = [];
  const problems: string[] = [];

  for (const [path, bytes] of files) {
    const normalised = path.replace(/\\/g, '/');
    if (!/\.json$/i.test(normalised)) continue;

    const lower = normalised.toLowerCase();
    const psychMatch = PSYCH_CHART_RE.exec(lower);
    const vsliceMatch = VSLICE_CHART_RE.exec(lower);
    if (!psychMatch && !vsliceMatch) continue;

    const fileName = normalised.slice(normalised.lastIndexOf('/') + 1);
    const stem = fileName.replace(/\.json$/i, '');
    if (CONFIG_BASENAMES.has(stem.toLowerCase())) continue;
    if (bytes.length > MAX_CHART_BYTES) {
      problems.push(`${path}: chart file is larger than ${MAX_CHART_BYTES / (1024 * 1024)} MB.`);
      continue;
    }

    const text = readText(files, path);
    if (text === null) {
      problems.push(`${path}: chart could not be decoded as text.`);
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      problems.push(`${path}: chart file is not valid JSON.`);
      continue;
    }

    try {
      if (isVSliceChart(raw)) {
        const metadata = readMetadata(files, path);
        const difficulties = vsliceDifficulties(raw);
        if (difficulties.length === 0) {
          problems.push(`${path}: V-Slice chart has no difficulties.`);
          continue;
        }
        for (const difficulty of difficulties) {
          const chart = parseVSliceChart(raw, { difficulty, metadata });
          songs.push({
            id: `${path}#${difficulty}`,
            chartPath: path,
            directory: path.slice(0, path.lastIndexOf('/')),
            difficulty,
            title: metadata?.songName ?? chart.title,
            format: 'vslice',
            chart,
          });
        }
        continue;
      }

      const chart = parseChart(raw);
      songs.push({
        id: path,
        chartPath: path,
        directory: path.slice(0, path.lastIndexOf('/')),
        difficulty: difficultyFromName(stem),
        title: chart.title,
        format: chart.format,
        chart,
      });
    } catch (error) {
      const detail =
        error instanceof ChartError
          ? error.message
          : error instanceof SyntaxError
            ? 'Chart file is not valid JSON.'
            : error instanceof Error
              ? error.message
              : 'Chart could not be read.';
      problems.push(`${path}: ${detail}`);
    }
  }

  // Prefer the chart the mod most likely wants to be played with.
  const rank = (difficulty: string): number =>
    difficulty === 'normal' ? 0 : difficulty === 'hard' ? 1 : difficulty === 'easy' ? 2 : 3;
  songs.sort(
    (a, b) =>
      a.title.localeCompare(b.title) ||
      rank(a.difficulty) - rank(b.difficulty) ||
      a.difficulty.localeCompare(b.difficulty),
  );

  return { songs, problems };
}

function findAudioFile(index: Map<string, string>, token: string, directoryName: string): string | null {
  const bases = [`${directoryName}/`, ''];
  const roots = ['songs/', 'music/', 'audio/', ''];

  // Mods are often shipped inside a single wrapping folder, so a candidate is
  // accepted both from the archive root and from the end of a longer path.
  const lookup = (candidate: string): string | null => {
    const direct = index.get(candidate);
    if (direct) return direct;
    const suffix = `/${candidate}`;
    for (const [lower, original] of index) {
      if (lower.endsWith(suffix)) return original;
    }
    return null;
  };

  for (const root of roots) {
    for (const base of bases) {
      for (const ext of AUDIO_EXTENSIONS) {
        const hit = lookup(`${root}${base}${token}.${ext}`.toLowerCase());
        if (hit) return hit;
      }
    }
  }

  const wanted = `${token}.`;
  let loose: string | null = null;
  for (const [lower, original] of index) {
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    if (!base.startsWith(wanted)) continue;
    if (!AUDIO_EXTENSIONS.some((ext) => base.endsWith(`.${ext}`))) continue;
    if (directoryName && lower.includes(`${directoryName.toLowerCase()}/`)) return original;
    if (!loose) loose = original;
  }

  return loose;
}

/**
 * Resolve everything one chart needs. Returns a specific failure when a track
 * is missing, because "no audio" is the most common reason a Psych mod folder
 * cannot be played on its own.
 */
export function prepareSong(files: EntryMap, chartPath: string, difficulty?: string): PrepareResult {
  const text = readText(files, chartPath);
  if (text === null) {
    return { ok: false, failure: { reason: 'chart-missing', detail: `Chart "${chartPath}" is not in this mod.` } };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, failure: { reason: 'chart-invalid', detail: 'Chart file is not valid JSON.' } };
  }

  const isVSlice = isVSliceChart(raw);
  const metadata = isVSlice ? readMetadata(files, chartPath) : null;

  let chart: ParsedChart;
  try {
    chart = isVSlice ? parseVSliceChart(raw, { difficulty, metadata }) : parseChart(raw);
  } catch (error) {
    return {
      ok: false,
      failure: {
        reason: 'chart-invalid',
        detail: error instanceof Error ? error.message : 'Chart could not be parsed.',
      },
    };
  }

  if (chart.playerNotes === 0) {
    return {
      ok: false,
      failure: {
        reason: 'no-player-notes',
        detail: 'This chart only contains opponent notes, so there is nothing to play.',
      },
    };
  }

  const index = buildIndex(files);
  const directoryName = chartPath.slice(0, chartPath.lastIndexOf('/')).split('/').pop() ?? '';
  const songName = directoryName || chart.title;
  const title = metadata?.songName ?? chart.title;

  const instrumental = findAudioFile(index, 'inst', songName);
  if (!instrumental) {
    const searched = AUDIO_EXTENSIONS.map((ext) => `songs/${songName}/Inst.${ext}`).join(', ');
    return {
      ok: false,
      failure: {
        reason: 'missing-audio',
        detail: `No instrumental track found for "${songName}". Looked for ${searched} and equivalent names under music/ or the mod root.`,
      },
    };
  }

  const voices = findAudioFile(index, 'voices', songName);
  const warnings: string[] = [];

  if (!voices && chart.needsVoices) {
    warnings.push('The chart expects a vocals track, but none was found. Vocals will be silent.');
  }

  const luaCount = [...files.keys()].filter((path) => /\.lua$/i.test(path)).length;
  if (luaCount > 0) {
    warnings.push(`${luaCount} Lua script${luaCount === 1 ? '' : 's'} present. Scripts are not executed by this runtime.`);
  }

  const hscriptCount = [...files.keys()].filter((path) => /\.(hx|hscript|hxs)$/i.test(path)).length;
  if (hscriptCount > 0) {
    warnings.push(`${hscriptCount} HScript file${hscriptCount === 1 ? '' : 's'} present. Scripts are not executed by this runtime.`);
  }

  if (chart.noteTypes.length > 0) {
    warnings.push(
      `Custom note types (${chart.noteTypes.slice(0, 4).join(', ')}) are drawn as normal notes; their special behaviour is not implemented.`,
    );
  }

  const unsupportedEvents = [
    ...new Set(chart.events.filter((event) => !isSupportedEvent(event.name)).map((event) => event.name)),
  ];
  if (unsupportedEvents.length > 0) {
    warnings.push(
      `${unsupportedEvents.length} event type${unsupportedEvents.length === 1 ? '' : 's'} will be reported but not applied (${unsupportedEvents.slice(0, 4).join(', ')}).`,
    );
  }

  const assets: ScenePaths = {
    noteSkin: resolveNoteSkin(files),
    player: resolveCharacterAssets(files, chart.player1),
    opponent: resolveCharacterAssets(files, chart.player2),
    stage: resolveStageAssets(files, chart.stage),
  };

  if (!assets.player && !assets.opponent) {
    warnings.push('No character sprites were found for this chart; the highway plays without characters.');
  }
  if (!assets.stage.backgroundPath) {
    warnings.push('No stage background was found; the runtime uses its own backdrop.');
  }

  return {
    ok: true,
    song: {
      id: isVSlice ? `${chartPath}#${chart.difficulty ?? 'normal'}` : chartPath,
      chartPath,
      directory: directoryName,
      difficulty: chart.difficulty ?? difficultyFromName(chartPath.slice(chartPath.lastIndexOf('/') + 1).replace(/\.json$/i, '')),
      title,
      format: chart.format,
      chart,
      audio: { instrumental, voices },
      assets,
      warnings,
      unsupportedEvents,
    },
  };
}
