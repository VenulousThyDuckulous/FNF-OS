import { describe, expect, it } from 'vitest';
import type { PlayResult } from '../src/lib/player/engine';
import {
  isBetter,
  personalBests,
  rankFor,
  recentSongs,
  recordFromResult,
  scoreKey,
  summarise,
  type ScoreRecord,
} from '../src/lib/scores';

function result(overrides: Partial<PlayResult> = {}): PlayResult {
  return {
    score: 1000,
    accuracy: 0.96,
    maxCombo: 10,
    counts: { sick: 10, good: 0, bad: 0, shit: 0, miss: 0 },
    notesJudged: 10,
    playerNotes: 10,
    unitsTotal: 10,
    holdDrops: 0,
    holdCompletions: 0,
    failed: false,
    autoplay: false,
    durationMs: 15000,
    ...overrides,
  };
}

function record(overrides: Partial<PlayResult> = {}, playedAt = '2026-01-01T00:00:00.000Z'): ScoreRecord {
  const base = recordFromResult({
    result: result(overrides),
    modId: 'mod-1',
    modName: 'Test Mod',
    engine: 'psych',
    chartPath: 'data/song/chart.json',
    songTitle: 'Song',
    difficulty: 'normal',
  });
  return { ...base, playedAt };
}

describe('rank thresholds', () => {
  it('maps accuracy to the documented ranks', () => {
    expect(rankFor(1)).toBe('S');
    expect(rankFor(0.95)).toBe('S');
    expect(rankFor(0.949)).toBe('A');
    expect(rankFor(0.9)).toBe('A');
    expect(rankFor(0.8)).toBe('B');
    expect(rankFor(0.7)).toBe('C');
    expect(rankFor(0.6)).toBe('D');
    expect(rankFor(0.59)).toBe('F');
  });

  it('never ranks an autoplay run', () => {
    expect(rankFor(1, true)).toBe('F');
  });
});

describe('recording a run', () => {
  it('keeps the engine, mod and difficulty on the record', () => {
    const saved = record();
    expect(saved).toMatchObject({ engine: 'psych', modId: 'mod-1', difficulty: 'normal', rank: 'S' });
    expect(saved.counts.sick).toBe(10);
    expect(saved.autoplay).toBe(false);
  });

  it('marks autoplay runs so they cannot become a best', () => {
    const saved = record({ autoplay: true, score: 9999 });
    expect(saved.autoplay).toBe(true);
    expect(saved.rank).toBe('F');
  });

  it('separates keys by engine, mod, chart and difficulty', () => {
    const a = scoreKey({ engine: 'psych', modId: 'mod-1', chartPath: 'c', difficulty: 'normal' });
    const b = scoreKey({ engine: 'codename', modId: 'mod-1', chartPath: 'c', difficulty: 'normal' });
    const c = scoreKey({ engine: 'psych', modId: 'mod-2', chartPath: 'c', difficulty: 'normal' });
    const d = scoreKey({ engine: 'psych', modId: 'mod-1', chartPath: 'c', difficulty: 'hard' });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });
});

describe('personal bests', () => {
  it('picks the higher score and counts attempts', () => {
    const bests = personalBests([record({ score: 100 }, '2026-01-01T00:00:00Z'), record({ score: 500 }, '2026-01-02T00:00:00Z')]);
    expect(bests).toHaveLength(1);
    expect(bests[0]?.best.score).toBe(500);
    expect(bests[0]?.attempts).toBe(2);
    expect(bests[0]?.lastPlayedAt).toBe('2026-01-02T00:00:00Z');
  });

  it('never promotes an autoplay run', () => {
    const bests = personalBests([
      record({ score: 700 }, '2026-01-01T00:00:00Z'),
      record({ score: 5000, autoplay: true }, '2026-01-02T00:00:00Z'),
    ]);
    expect(bests[0]?.best.score).toBe(700);
    expect(bests[0]?.best.autoplay).toBe(false);
  });

  it('keeps different engines apart', () => {
    const psych = record({ score: 1000 });
    const codename: ScoreRecord = { ...psych, id: 'second', engine: 'codename', score: 2000 };
    const bests = personalBests([psych, codename]);
    expect(bests).toHaveLength(2);
    expect(bests.map((entry) => entry.engine).sort()).toEqual(['codename', 'psych']);
  });

  it('breaks score ties on accuracy, then combo', () => {
    const a = record({ score: 500, accuracy: 0.9, maxCombo: 5 });
    const b = record({ score: 500, accuracy: 0.95, maxCombo: 5 });
    expect(isBetter(b, a)).toBe(true);
    expect(isBetter(a, b)).toBe(false);
    expect(isBetter({ ...a, maxCombo: 6 }, a)).toBe(true);
  });
});

describe('recent songs and summary', () => {
  it('orders recent songs by last play and limits the list', () => {
    const list = [
      record({}, '2026-01-01T00:00:00Z'),
      record({}, '2026-01-03T00:00:00Z'),
      { ...record({}, '2026-01-02T00:00:00Z'), id: 'hard-run', difficulty: 'hard' },
    ];
    const recent = recentSongs(list, 2);
    expect(recent).toHaveLength(2);
    expect(recent[0]?.lastPlayedAt).toBe('2026-01-03T00:00:00Z');
    expect(recent[1]?.difficulty).toBe('hard');
  });

  it('summarises plays, misses and hold drops', () => {
    const summary = summarise([
      record({ counts: { sick: 8, good: 0, bad: 0, shit: 0, miss: 2 }, holdDrops: 1 }),
      record({ score: 500 }),
    ]);
    expect(summary.plays).toBe(2);
    expect(summary.songs).toBe(1);
    expect(summary.totalScore).toBe(1500);
    expect(summary.misses).toBe(2);
    expect(summary.holdDrops).toBe(1);
    expect(summary.bestRank).toBe('S');
  });
});
