import type { ChartNote, Lane, ParsedChart } from './chart';

/**
 * Gameplay rules, as pure functions.
 *
 * This is the part of the runtime that decides whether a note was hit, how
 * accurate it was, whether the player died, and when the song is over. It has no
 * DOM, no audio and no timers, so a whole chart can be simulated in tests and the
 * same code is what runs in the browser.
 *
 * Deliberately simple where the real engines are not: sustains are judged on
 * their initial hit, there are no ghost-tapping penalties and no health drain
 * between notes. Those are listed as limitations instead of being guessed at.
 */

export type Judgement = 'sick' | 'good' | 'bad' | 'shit' | 'miss';

export const JUDGEMENTS: Judgement[] = ['sick', 'good', 'bad', 'shit', 'miss'];

/** Psych's default hit windows, in milliseconds. */
export const DEFAULT_WINDOWS = { sick: 45, good: 90, bad: 135, shit: 160 } as const;

export type HitWindows = { sick: number; good: number; bad: number; shit: number };

/** Accuracy weight per judgement. Missing a note is worth zero, not a penalty. */
export const ACCURACY_WEIGHT: Record<Judgement, number> = {
  sick: 1,
  good: 0.75,
  bad: 0.4,
  shit: 0.2,
  miss: 0,
};

export interface RuntimeNote extends ChartNote {
  state: 'pending' | 'hit' | 'missed';
  /** Signed offset in ms; negative means early. */
  delta: number | null;
  judgement: Judgement | null;
}

export interface GameOptions {
  windows?: HitWindows;
  /** When true, the runtime plays the player's notes itself. */
  autoplay?: boolean;
  startingHealth?: number;
  gainPerHit?: number;
  lossPerMiss?: number;
}

export interface GameState {
  chart: ParsedChart;
  notes: RuntimeNote[];
  time: number;
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  health: number;
  maxHealth: number;
  /** Sum of accuracy weights for judged player notes. */
  accuracyValue: number;
  judged: number;
  failed: boolean;
  finished: boolean;
  windows: HitWindows;
  autoplay: boolean;
  gainPerHit: number;
  lossPerMiss: number;
  lastJudgement: { judgement: Judgement; lane: Lane; at: number } | null;
}

export interface PlayResult {
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  notesJudged: number;
  playerNotes: number;
  failed: boolean;
  durationMs: number;
}

export function createGame(chart: ParsedChart, options: GameOptions = {}): GameState {
  const startingHealth = options.startingHealth ?? 50;

  return {
    chart,
    notes: chart.notes.map((note) => ({ ...note, state: 'pending', delta: null, judgement: null })),
    time: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { sick: 0, good: 0, bad: 0, shit: 0, miss: 0 },
    health: startingHealth,
    maxHealth: 100,
    accuracyValue: 0,
    judged: 0,
    failed: false,
    finished: false,
    windows: options.windows ?? DEFAULT_WINDOWS,
    autoplay: options.autoplay ?? false,
    gainPerHit: options.gainPerHit ?? 1.6,
    lossPerMiss: options.lossPerMiss ?? 5,
    lastJudgement: null,
  };
}

/** Judge a hit offset. Returns null when the press is outside every window. */
export function judgementFor(delta: number, windows: HitWindows = DEFAULT_WINDOWS): Judgement | null {
  const distance = Math.abs(delta);
  if (distance <= windows.sick) return 'sick';
  if (distance <= windows.good) return 'good';
  if (distance <= windows.bad) return 'bad';
  if (distance <= windows.shit) return 'shit';
  return null;
}

/**
 * Move the game clock forward. Handles opponent notes, autoplay, misses and the
 * end of the song. Times must be monotonic; earlier values are ignored so a
 * slow frame cannot rewind the state.
 */
export function advanceGame(state: GameState, timeMs: number): void {
  if (state.finished) return;
  if (!Number.isFinite(timeMs) || timeMs < state.time) return;
  state.time = timeMs;

  for (const note of state.notes) {
    if (note.state !== 'pending') continue;

    if (!note.player) {
      if (note.time <= timeMs) note.state = 'hit';
      continue;
    }

    if (state.autoplay && note.time <= timeMs) {
      judge(state, note, 0, 'sick');
      continue;
    }

    if (note.time + state.windows.shit < timeMs) judge(state, note, null, 'miss');
  }

  if (state.health <= 0) {
    state.health = 0;
    state.failed = true;
    state.finished = true;
    return;
  }

  const pendingPlayer = state.notes.some((note) => note.player && note.state === 'pending');
  if (!pendingPlayer && state.chart.playerNotes > 0 && timeMs >= state.chart.lastNoteTime + 500) {
    state.finished = true;
  }
}

/**
 * Register a lane press. Returns the judgement, or null when no pending note is
 * inside the window (a stray press is not punished and not counted).
 */
export function pressLane(state: GameState, lane: Lane, timeMs: number): Judgement | null {
  if (state.finished) return null;
  if (!Number.isFinite(timeMs)) return null;

  let best: RuntimeNote | null = null;
  let bestDistance = Infinity;

  for (const note of state.notes) {
    if (note.state !== 'pending' || !note.player || note.lane !== lane) continue;
    const delta = timeMs - note.time;
    if (Math.abs(delta) > state.windows.shit) continue;
    const distance = Math.abs(delta);
    if (distance < bestDistance) {
      best = note;
      bestDistance = distance;
    }
  }

  if (!best) return null;
  const delta = timeMs - best.time;
  const judgement = judgementFor(delta, state.windows);
  if (!judgement) return null;
  judge(state, best, delta, judgement);
  return judgement;
}

function judge(state: GameState, note: RuntimeNote, delta: number | null, judgement: Judgement): void {
  note.judgement = judgement;
  note.delta = delta;
  note.state = judgement === 'miss' ? 'missed' : 'hit';

  state.counts[judgement] += 1;
  state.judged += 1;
  state.accuracyValue += ACCURACY_WEIGHT[judgement];
  state.lastJudgement = { judgement, lane: note.lane, at: state.time };

  if (judgement === 'miss') {
    state.combo = 0;
    state.score = Math.max(0, state.score);
    state.health = Math.max(0, state.health - state.lossPerMiss);
    return;
  }

  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += 350;
  state.health = Math.min(state.maxHealth, state.health + state.gainPerHit);
}

/** Accuracy in 0..1. Unplayed charts report 1, matching how engines display it. */
export function accuracyOf(state: GameState): number {
  if (state.judged === 0) return 1;
  return state.accuracyValue / state.judged;
}

export function resultsOf(state: GameState): PlayResult {
  return {
    score: state.score,
    accuracy: accuracyOf(state),
    maxCombo: state.maxCombo,
    counts: { ...state.counts },
    notesJudged: state.judged,
    playerNotes: state.chart.playerNotes,
    failed: state.failed,
    durationMs: Math.round(state.time),
  };
}
