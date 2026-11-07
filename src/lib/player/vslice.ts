import {
  ChartError,
  LANE_COUNT,
  type ChartEvent,
  type ChartNote,
  type ChartSection,
  type Lane,
  type ParsedChart,
} from './chart';

/**
 * V-Slice chart reading.
 *
 * V-Slice is Friday Night Funkin's current chart format. The schema below comes
 * from the engine's own data classes (Funkin `SongChartData` / `SongNoteData`):
 *
 * ```json
 * {
 *   "version": "2.0.0",
 *   "scrollSpeed": { "normal": 1.5 },
 *   "events": [{ "t": 1000, "e": "FocusCamera", "v": { "char": 1 } }],
 *   "notes": {
 *     "normal": [
 *       { "t": 2000, "d": 0, "l": 0, "k": "" },
 *       { "t": 2500, "d": 4, "l": 500 }
 *     ]
 *   }
 * }
 * ```
 *
 * `d` is a note data index: lanes are `d % 4`, and `floor(d / 4)` selects the
 * strumline (0 = the player, 1 = the opponent). `l` is the hold length in ms and
 * `k` a note kind. Note and event times are milliseconds.
 *
 * Older V-Slice charts (0.3 and earlier) use the legacy section array that Psych
 * also reads, so `parseChart` sends those through the Psych reader and they are
 * reported as psych-format rather than being called V-Slice. Charts using the
 * `"ticks"` time format are refused with a named problem: converting ticks
 * needs the full tempo map, and guessing would desync the song.
 */

export interface VSliceMetadata {
  songName: string;
  artist: string | null;
  stage: string;
  player1: string;
  player2: string;
  girlfriend: string;
  difficulties: string[];
  timeFormat: string;
  bpm: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function toText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * True only for the current V-Slice schema: a version, a per-difficulty note map
 * and a scroll-speed declaration. Legacy charts (notes as a section array) and
 * Psych's own `format: "psych_v1"` files are excluded on purpose.
 */
export function isVSliceChart(raw: unknown): boolean {
  if (!isRecord(raw)) return false;
  if (typeof raw.format === 'string' && raw.format.toLowerCase().startsWith('psych')) return false;
  const versioned = typeof raw.version === 'string' || typeof raw.version === 'number';
  const notesMap = isRecord(raw.notes);
  const scrollDeclared = isRecord(raw.scrollSpeed) || typeof raw.scrollSpeed === 'number';
  return versioned && notesMap && scrollDeclared;
}

/** Difficulty keys present in a V-Slice chart, in chart order. */
export function vsliceDifficulties(raw: unknown): string[] {
  if (!isRecord(raw) || !isRecord(raw.notes)) return [];
  return Object.keys(raw.notes);
}

export interface VSliceParseOptions {
  difficulty?: string;
  metadata?: VSliceMetadata | null;
}

export function parseVSliceChart(raw: unknown, options: VSliceParseOptions = {}): ParsedChart {
  if (!isRecord(raw)) throw new ChartError('not-a-chart', 'V-Slice chart is not an object.');

  const notesMap = raw.notes;
  if (!isRecord(notesMap)) {
    throw new ChartError('not-a-chart', 'V-Slice chart has no per-difficulty `notes` object.');
  }

  const available = Object.keys(notesMap).filter((key) => Array.isArray(notesMap[key]));
  if (available.length === 0) {
    throw new ChartError('no-notes', 'V-Slice chart has no note arrays for any difficulty.');
  }

  const difficulty =
    options.difficulty && available.includes(options.difficulty)
      ? options.difficulty
      : available.includes('normal')
        ? 'normal'
        : (available[0] as string);
  const noteList = notesMap[difficulty] as unknown[];

  const timeFormat = options.metadata?.timeFormat ?? toText(raw.timeFormat, 'ms');
  if (timeFormat === 'ticks') {
    throw new ChartError(
      'unsupported-time-format',
      'This V-Slice chart uses tick-based time, which needs the song tempo map to convert. It cannot be played without desyncing.',
    );
  }
  // "float" charts store times in seconds; everything else is milliseconds.
  const timeScale = timeFormat === 'float' ? 1000 : 1;

  const notes: ChartNote[] = [];
  let badNotes = 0;

  for (const entry of noteList) {
    if (!isRecord(entry)) {
      badNotes += 1;
      continue;
    }
    const rawTime = toNumber(entry.t);
    const rawData = toNumber(entry.d);
    if (rawTime === null || rawData === null || rawTime < 0 || rawData < 0) {
      badNotes += 1;
      continue;
    }

    const time = rawTime * timeScale;
    const data = Math.floor(rawData);
    const lane = (data % LANE_COUNT) as Lane;
    // floor(d / 4) === 0 means the player's strumline in V-Slice.
    const player = Math.floor(data / LANE_COUNT) === 0;
    const sustain = Math.min(60_000, Math.max(0, (toNumber(entry.l) ?? 0) * timeScale));
    const kind = typeof entry.k === 'string' && entry.k.trim() !== '' ? entry.k.trim() : null;

    notes.push({ time, lane, sustain, type: kind, player });
  }

  if (notes.length === 0) {
    throw new ChartError('no-notes', `V-Slice difficulty "${difficulty}" has no usable notes.`);
  }

  const bpmFromChart = toNumber(raw.bpm);
  const bpm = Math.max(1, bpmFromChart ?? options.metadata?.bpm ?? 100);

  const scrollSpeed = readScrollSpeed(raw.scrollSpeed, difficulty);
  const speed = Math.min(4, Math.max(0.5, scrollSpeed));
  notes.sort((a, b) => a.time - b.time);

  const events = readEvents(raw.events, timeScale);
  const lastNoteTime = notes.reduce((max, note) => Math.max(max, note.time + note.sustain), 0);
  const sections: ChartSection[] = [{ time: 0, bpm, mustHit: true }];

  const playData = isRecord(raw.playData) ? raw.playData : null;
  const characters = playData && isRecord(playData.characters) ? playData.characters : null;

  return {
    format: 'vslice',
    title: toText(raw.songName ?? raw.song, options.metadata?.songName ?? 'Untitled song'),
    bpm,
    difficulty,
    speed,
    player1: toText(characters?.player ?? raw.player1, options.metadata?.player1 ?? 'bf'),
    player2: toText(characters?.opponent ?? raw.player2, options.metadata?.player2 ?? 'dad'),
    gf: toText(characters?.girlfriend ?? raw.gfVersion, options.metadata?.girlfriend ?? 'gf'),
    stage: toText(playData?.stage ?? raw.stage, options.metadata?.stage ?? 'stage'),
    needsVoices: raw.needsVoices !== false,
    sections,
    notes,
    events,
    playerNotes: notes.filter((note) => note.player).length,
    lastNoteTime,
    length: lastNoteTime + 3000,
    noteTypes: [...new Set(notes.map((note) => note.type).filter((type): type is string => type !== null))],
  };
}

function readScrollSpeed(value: unknown, difficulty: string): number {
  if (typeof value === 'number') return value;
  if (!isRecord(value)) return 1;
  const direct = toNumber(value[difficulty]);
  if (direct !== null) return direct;
  const normal = toNumber(value.normal);
  if (normal !== null) return normal;
  for (const entry of Object.values(value)) {
    const number = toNumber(entry);
    if (number !== null) return number;
  }
  return 1;
}

/**
 * Convert V-Slice events (`{ t, e, v }`) into the shared event shape. Values are
 * flattened by their documented keys; the event runner decides what it supports.
 */
function readEvents(raw: unknown, timeScale: number): ChartEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: ChartEvent[] = [];

  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const time = toNumber(entry.t);
    if (time === null || time < 0) continue;
    const name = typeof entry.e === 'string' ? entry.e.trim() : '';
    if (!name) continue;

    const value = entry.v;
    let value1: string | number = '';
    let value2: string | number = '';

    if (isRecord(value)) {
      value1 = pickValue(value, ['zoom', 'speed', 'char', 'value', 'name', 'anim', 'character']);
      value2 = pickValue(value, ['duration', 'value2', 'time', 'length']);
    } else if (typeof value === 'string' || typeof value === 'number') {
      value1 = value;
    }

    events.push({ time: time * timeScale, name, value1, value2 });
  }

  return events.sort((a, b) => a.time - b.time);
}

function pickValue(source: Record<string, unknown>, keys: string[]): string | number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return value;
  }
  // Unknown keys: keep the first primitive so an event can still be diagnosed.
  for (const value of Object.values(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') return value;
  }
  return '';
}

/** Parse a V-Slice `metadata.json` (or the older `data/<song>/<song>-metadata.json`). */
export function parseVSliceMetadata(raw: unknown): VSliceMetadata | null {
  if (!isRecord(raw)) return null;

  const playData = isRecord(raw.playData) ? raw.playData : null;
  const characters = playData && isRecord(playData.characters) ? playData.characters : null;
  const difficultiesRaw = playData?.difficulties ?? raw.difficulties;

  const difficulties = Array.isArray(difficultiesRaw)
    ? difficultiesRaw.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return {
    songName: toText(raw.songName ?? raw.song, 'Untitled song'),
    artist: typeof raw.artist === 'string' ? raw.artist : null,
    stage: toText(playData?.stage ?? raw.stage, 'stage'),
    player1: toText(characters?.player ?? raw.player1, 'bf'),
    player2: toText(characters?.opponent ?? raw.player2, 'dad'),
    girlfriend: toText(characters?.girlfriend ?? raw.gfVersion, 'gf'),
    difficulties,
    timeFormat: toText(raw.timeFormat, 'ms'),
    bpm: toNumber(raw.bpm) ?? toNumber(raw.tempo) ?? null,
  };
}
