import type { ChartNote, Lane, ParsedChart } from './chart';

/**
 * Gameplay rules, as pure functions.
 *
 * This is the part of the runtime that decides whether a note was hit, how
 * accurate it was, whether the player died, and when the song is over. It has no
 * DOM, no audio and no timers, so a whole chart can be simulated in tests and the
 * same code is what runs in the browser.
 *
 * Sustains are scored in two units: the head (a normal note) and the tail. The
 * tail counts when the lane is still held at the end of the sustain, and is
 * dropped if the key is released more than {@link HOLD_RELEASE_GRACE_MS} before
 * it. A dropped tail is a miss: it resets combo, costs health and counts against
 * accuracy, which is how the engines behave.
 */

export type Judgement = 'sick' | 'good' | 'bad' | 'shit' | 'miss';

export const JUDGEMENTS: Judgement[] = ['sick', 'good', 'bad', 'shit', 'miss'];

/** Psych's default hit windows, in milliseconds. */
export const DEFAULT_WINDOWS = { sick: 45, good: 90, bad: 135, shit: 160 } as const;

export type HitWindows = { sick: number; good: number; bad: number; shit: number };

/** How early a hold may be released and still count, in ms. */
export const HOLD_RELEASE_GRACE_MS = 120;

/** Accuracy weight per judgement. Missing a note is worth zero, not a penalty. */
export const ACCURACY_WEIGHT: Record<Judgement, number> = {
  sick: 1,
  good: 0.75,
  bad: 0.4,
  shit: 0.2,
  miss: 0,
};

export type HoldState = 'none' | 'active' | 'held' | 'dropped';

export interface RuntimeNote extends ChartNote {
  state: 'pending' | 'hit' | 'missed';
  /** Signed offset in ms; negative means early. */
  delta: number | null;
  judgement: Judgement | null;
  hold: HoldState;
  /** Time the sustain ends, or null for a tap. */
  holdEnd: number | null;
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
  /** Sum of accuracy weights for judged units (heads and hold tails). */
  accuracyValue: number;
  /** Number of judged units. Sustained notes contribute two. */
  judged: number;
  /** Heads plus hold tails that can be judged. */
  unitsTotal: number;
  holdDrops: number;
  holdCompletions: number;
  failed: boolean;
  finished: boolean;
  windows: HitWindows;
  autoplay: boolean;
  gainPerHit: number;
  lossPerMiss: number;
  lastJudgement: { judgement: Judgement; lane: Lane; at: number; kind: 'head' | 'tail' } | null;
}

export interface PlayResult {
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  notesJudged: number;
  playerNotes: number;
  unitsTotal: number;
  holdDrops: number;
  holdCompletions: number;
  failed: boolean;
  autoplay: boolean;
  durationMs: number;
}

export function createGame(chart: ParsedChart, options: GameOptions = {}): GameState {
  const startingHealth = options.startingHealth ?? 50;
  const playerNotes = chart.notes.filter((note) => note.player);

  return {
    chart,
    notes: chart.notes.map((note) => ({
      ...note,
      state: 'pending',
      delta: null,
      judgement: null,
      hold: 'none',
      holdEnd: note.player && note.sustain > 0 ? note.time + note.sustain : null,
    })),
    time: 0,
    score: 0,
    combo: 0,
    maxCombo: 0,
    counts: { sick: 0, good: 0, bad: 0, shit: 0, miss: 0 },
    health: startingHealth,
    maxHealth: 100,
    accuracyValue: 0,
    judged: 0,
    unitsTotal: playerNotes.length + playerNotes.filter((note) => note.sustain > 0).length,
    holdDrops: 0,
    holdCompletions: 0,
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
 * Move the game clock forward. Handles opponent notes, autoplay, misses, hold
 * tails and the end of the song. Times must be monotonic; earlier values are
 * ignored so a slow frame cannot rewind the state.
 */
export function advanceGame(state: GameState, timeMs: number): void {
  if (state.finished) return;
  if (!Number.isFinite(timeMs) || timeMs < state.time) return;
  state.time = timeMs;

  for (const note of state.notes) {
    if (note.state === 'pending') {
      if (!note.player) {
        if (note.time <= timeMs) note.state = 'hit';
        continue;
      }

      if (state.autoplay && note.time <= timeMs) {
        judgeHead(state, note, 0, 'sick');
        continue;
      }

      if (note.time + state.windows.shit < timeMs) judgeHead(state, note, null, 'miss');
      continue;
    }

    // An active hold is complete once the clock passes its end. Releasing early
    // is handled by releaseLane; reaching the end while held is a completed tail.
    if (note.hold === 'active' && note.holdEnd !== null && timeMs >= note.holdEnd) {
      completeHold(state, note);
    }
  }

  if (state.health <= 0) {
    state.health = 0;
    state.failed = true;
    state.finished = true;
    return;
  }

  const pendingHead = state.notes.some((note) => note.player && note.state === 'pending');
  const activeHold = state.notes.some((note) => note.hold === 'active');
  if (
    !pendingHead &&
    !activeHold &&
    state.chart.playerNotes > 0 &&
    timeMs >= state.chart.lastNoteTime + 500
  ) {
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
  judgeHead(state, best, delta, judgement);
  return judgement;
}

/**
 * Register a lane release. Only meaningful for an active hold: releasing inside
 * the grace period at the end completes it, releasing earlier drops the tail.
 */
export function releaseLane(state: GameState, lane: Lane, timeMs: number): 'held' | 'dropped' | null {
  if (state.finished) return null;
  if (!Number.isFinite(timeMs)) return null;

  const note = state.notes.find((entry) => entry.hold === 'active' && entry.lane === lane);
  if (!note || note.holdEnd === null) return null;

  if (timeMs >= note.holdEnd - HOLD_RELEASE_GRACE_MS) {
    completeHold(state, note);
    return 'held';
  }

  dropHold(state, note);
  return 'dropped';
}

function judgeHead(state: GameState, note: RuntimeNote, delta: number | null, judgement: Judgement): void {
  note.judgement = judgement;
  note.delta = delta;
  note.state = judgement === 'miss' ? 'missed' : 'hit';

  if (judgement === 'miss') {
    note.hold = 'none';
    applyJudgement(state, judgement, note.lane, 'head');
    return;
  }

  note.hold = note.sustain > 0 ? 'active' : 'none';
  applyJudgement(state, judgement, note.lane, 'head');

  // A hold whose end already passed (a very late hit) completes immediately.
  if (note.hold === 'active' && note.holdEnd !== null && state.time >= note.holdEnd) {
    completeHold(state, note);
  }
}

function completeHold(state: GameState, note: RuntimeNote): void {
  note.hold = 'held';
  state.holdCompletions += 1;
  // The tail is always worth a full unit: the player held through the note.
  applyJudgement(state, 'sick', note.lane, 'tail', 40);
}

function dropHold(state: GameState, note: RuntimeNote): void {
  note.hold = 'dropped';
  state.holdDrops += 1;
  applyJudgement(state, 'miss', note.lane, 'tail');
}

function applyJudgement(
  state: GameState,
  judgement: Judgement,
  lane: Lane,
  kind: 'head' | 'tail',
  bonusScore = 0,
): void {
  state.counts[judgement] += 1;
  state.judged += 1;
  state.accuracyValue += ACCURACY_WEIGHT[judgement];
  state.lastJudgement = { judgement, lane, at: state.time, kind };

  if (judgement === 'miss') {
    state.combo = 0;
    state.health = Math.max(0, state.health - state.lossPerMiss);
    return;
  }

  state.combo += 1;
  state.maxCombo = Math.max(state.maxCombo, state.combo);
  state.score += 350 + bonusScore;
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
    unitsTotal: state.unitsTotal,
    holdDrops: state.holdDrops,
    holdCompletions: state.holdCompletions,
    failed: state.failed,
    autoplay: state.autoplay,
    durationMs: Math.round(state.time),
  };
}
