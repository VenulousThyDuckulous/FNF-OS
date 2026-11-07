/**
 * Psych-format chart reading.
 *
 * The chart JSON that Psych (and most forks) ship is the only part of a mod
 * that describes gameplay, so it is the contract our runtime reads. Nothing
 * here executes mod code: the file is parsed as data, every note time is
 * checked, and anything malformed becomes a named problem instead of a silent
 * guess.
 *
 * Layout handled: `{ "song": { ... } }` (Psych 0.5-1.0) and a bare chart object.
 * Note times are absolute milliseconds and are used as-is.
 */

export type Lane = 0 | 1 | 2 | 3;

export const LANE_COUNT = 4;

export interface ChartNote {
  time: number;
  lane: Lane;
  /** Sustain length in ms. 0 when the note is a tap. */
  sustain: number;
  /** `null` for a normal note; the source string for a custom note type. */
  type: string | null;
  /** True for notes the player must hit; opponent notes play automatically. */
  player: boolean;
}

export interface ChartSection {
  time: number;
  bpm: number;
  mustHit: boolean;
}

export interface ChartEvent {
  time: number;
  name: string;
  value1: string | number;
  value2: string | number;
}

export interface ParsedChart {
  title: string;
  bpm: number;
  /** Scroll speed declared by the chart; 1.0-3.0 in practice. */
  speed: number;
  player1: string;
  player2: string;
  stage: string;
  needsVoices: boolean;
  sections: ChartSection[];
  notes: ChartNote[];
  events: ChartEvent[];
  /** Notes the player is responsible for. */
  playerNotes: number;
  /** Time of the last judged note, in ms. */
  lastNoteTime: number;
  /** How long the song needs, in ms. */
  length: number;
  /** Custom note types found in the chart. */
  noteTypes: string[];
}

export type ChartProblem = 'not-json' | 'not-a-chart' | 'no-sections' | 'no-notes' | 'bad-times';

export class ChartError extends Error {
  readonly problem: ChartProblem;

  constructor(problem: ChartProblem, message: string) {
    super(message);
    this.name = 'ChartError';
    this.problem = problem;
  }
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
 * Parse a chart object. Throws {@link ChartError} with a stable `problem` code,
 * which the UI turns into a specific message instead of "something went wrong".
 */
export function parseChart(raw: unknown): ParsedChart {
  if (!isRecord(raw)) throw new ChartError('not-a-chart', 'Chart JSON is not an object.');

  const root = isRecord(raw.song) ? raw.song : raw;

  const sectionsRaw = root.notes;
  if (!Array.isArray(sectionsRaw)) {
    throw new ChartError('not-a-chart', 'Chart JSON has no `notes` array of sections.');
  }

  const baseBpm = toNumber(root.bpm) ?? 100;
  const startBpm = baseBpm > 0 ? baseBpm : 100;
  let bpm = startBpm;
  const speed = clamp(toNumber(root.speed) ?? 2, 0.5, 4);

  const notes: ChartNote[] = [];
  const sections: ChartSection[] = [];
  const noteTypes = new Set<string>();
  let sectionTime = 0;
  let badTimes = 0;

  for (const sectionRaw of sectionsRaw) {
    if (!isRecord(sectionRaw)) continue;

    const sectionBpm = toNumber(sectionRaw.bpm);
    if (sectionBpm !== null && sectionBpm > 0 && sectionRaw.changeBPM === true) bpm = sectionBpm;

    const mustHit = sectionRaw.mustHitSection === true;
    const steps = toNumber(sectionRaw.lengthInSteps) ?? 16;
    const stepMs = 60000 / bpm / 4;

    sections.push({ time: sectionTime, bpm, mustHit });
    sectionTime += Math.max(1, steps) * stepMs;

    const sectionNotes = sectionRaw.sectionNotes;
    if (!Array.isArray(sectionNotes)) continue;

    for (const noteRaw of sectionNotes) {
      if (!Array.isArray(noteRaw)) continue;

      const time = toNumber(noteRaw[0]);
      const data = toNumber(noteRaw[1]);
      if (time === null || data === null) {
        badTimes += 1;
        continue;
      }
      if (time < 0 || data < 0) {
        badTimes += 1;
        continue;
      }

      const lane = Math.floor(data % LANE_COUNT) as Lane;
      // Psych rule: a note belongs to the opponent when `mustHitSection` and the
      // note sits in lanes 4-7 xor; anything in the low lanes follows the section.
      const player = mustHit !== data > 3;

      const rawLength = toNumber(noteRaw[2]) ?? 0;
      const sustain = clamp(rawLength, 0, 60_000);
      const typeRaw = noteRaw[3];
      const type = typeof typeRaw === 'string' && typeRaw.trim() !== '' ? typeRaw.trim() : null;
      if (type) noteTypes.add(type);

      notes.push({ time, lane, sustain, type, player });
    }
  }

  if (sections.length === 0) throw new ChartError('no-sections', 'Chart has no usable sections.');
  if (notes.length === 0) {
    throw new ChartError('no-notes', 'Chart has no notes. This may be an empty or placeholder chart.');
  }
  if (badTimes > 0 && badTimes === notes.length) {
    throw new ChartError('bad-times', 'Every note in this chart has an invalid time or lane.');
  }

  notes.sort((a, b) => a.time - b.time);

  const lastNoteTime = notes.reduce((max, note) => Math.max(max, note.time + note.sustain), 0);
  const events = parseEvents(root.events);

  return {
    title: toText(root.song, 'Untitled song'),
    // The song tempo, not whatever the last section changed it to.
    bpm: startBpm,
    speed,
    player1: toText(root.player1, 'bf'),
    player2: toText(root.player2, 'dad'),
    stage: toText(root.stage, 'stage'),
    needsVoices: root.needsVoices !== false,
    sections,
    notes,
    events,
    playerNotes: notes.filter((note) => note.player).length,
    lastNoteTime,
    length: lastNoteTime + 3000,
    noteTypes: [...noteTypes],
  };
}

export function parseChartText(text: string): ParsedChart {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ChartError('not-json', 'Chart file is not valid JSON.');
  }
  return parseChart(raw);
}

/** Psych stores events as `[[ms, [[name, v1, v2], ...]], ...]`. */
function parseEvents(raw: unknown): ChartEvent[] {
  if (!Array.isArray(raw)) return [];
  const events: ChartEvent[] = [];

  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const time = toNumber(entry[0]);
    if (time === null || time < 0) continue;
    const group = entry[1];
    if (!Array.isArray(group)) continue;

    for (const item of group) {
      if (!Array.isArray(item)) continue;
      const name = typeof item[0] === 'string' ? item[0].trim() : '';
      if (!name) continue;
      const value1 = typeof item[1] === 'string' || typeof item[1] === 'number' ? item[1] : '';
      const value2 = typeof item[2] === 'string' || typeof item[2] === 'number' ? item[2] : '';
      events.push({ time, name, value1, value2 });
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
