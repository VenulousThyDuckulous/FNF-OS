import type { Judgement, PlayResult } from './player/engine';
import { STORES, deleteRecord, getAll, putRecord } from './idb';
import type { EngineId } from './engines/types';

/**
 * Saved scores and play history.
 *
 * Records live in this browser's IndexedDB, like the mods themselves. Nothing is
 * uploaded. Every record keeps the engine and mod it belongs to so the same song
 * name in two engines cannot be merged into one "best".
 */

export type Rank = 'S' | 'A' | 'B' | 'C' | 'D' | 'F';

export interface ScoreRecord {
  id: string;
  /** Null for the built-in test chart. */
  modId: string | null;
  modName: string;
  engine: EngineId | null;
  chartPath: string;
  songTitle: string;
  difficulty: string;
  score: number;
  accuracy: number;
  maxCombo: number;
  counts: Record<Judgement, number>;
  holdDrops: number;
  unitsTotal: number;
  rank: Rank;
  autoplay: boolean;
  failed: boolean;
  durationMs: number;
  playedAt: string;
}

export interface PersonalBest {
  key: string;
  modId: string | null;
  modName: string;
  engine: EngineId | null;
  songTitle: string;
  difficulty: string;
  best: ScoreRecord;
  attempts: number;
  lastPlayedAt: string;
}

/** Accuracy thresholds for a rank. Autoplay runs are saved but never ranked. */
export function rankFor(accuracy: number, autoplay = false): Rank {
  if (autoplay) return 'F';
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.9) return 'A';
  if (accuracy >= 0.8) return 'B';
  if (accuracy >= 0.7) return 'C';
  if (accuracy >= 0.6) return 'D';
  return 'F';
}

export function scoreKey(record: {
  engine: EngineId | null;
  modId: string | null;
  chartPath: string;
  difficulty: string;
}): string {
  return [record.engine ?? 'unknown', record.modId ?? 'builtin', record.chartPath, record.difficulty].join('::');
}

export function recordFromResult(input: {
  result: PlayResult;
  modId: string | null;
  modName: string;
  engine: EngineId | null;
  chartPath: string;
  songTitle: string;
  difficulty: string;
}): ScoreRecord {
  const rank = rankFor(input.result.accuracy, input.result.autoplay);
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    modId: input.modId,
    modName: input.modName,
    engine: input.engine,
    chartPath: input.chartPath,
    songTitle: input.songTitle,
    difficulty: input.difficulty,
    score: input.result.score,
    accuracy: input.result.accuracy,
    maxCombo: input.result.maxCombo,
    counts: { ...input.result.counts },
    holdDrops: input.result.holdDrops,
    unitsTotal: input.result.unitsTotal,
    rank,
    autoplay: input.result.autoplay,
    failed: input.result.failed,
    durationMs: input.result.durationMs,
    playedAt: new Date().toISOString(),
  };
}

export async function saveScore(record: ScoreRecord): Promise<void> {
  await putRecord(STORES.scores, record);
}

export async function listScores(): Promise<ScoreRecord[]> {
  const scores = await getAll<ScoreRecord>(STORES.scores);
  return scores.sort((a, b) => b.playedAt.localeCompare(a.playedAt));
}

export async function deleteScore(id: string): Promise<void> {
  await deleteRecord(STORES.scores, id);
}

/** One best per (engine, mod, chart, difficulty), newest attempt wins ties. */
export function personalBests(scores: ScoreRecord[]): PersonalBest[] {
  const byKey = new Map<string, PersonalBest>();

  for (const score of scores) {
    const key = scoreKey(score);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        modId: score.modId,
        modName: score.modName,
        engine: score.engine,
        songTitle: score.songTitle,
        difficulty: score.difficulty,
        best: score,
        attempts: 1,
        lastPlayedAt: score.playedAt,
      });
      continue;
    }

    existing.attempts += 1;
    if (score.playedAt > existing.lastPlayedAt) existing.lastPlayedAt = score.playedAt;
    // Autoplay runs are recorded for history but can never be a personal best.
    if (!score.autoplay && (existing.best.autoplay || isBetter(score, existing.best))) existing.best = score;
  }

  return [...byKey.values()].sort((a, b) => b.best.score - a.best.score);
}

/** Score first, then accuracy: a higher score is not always a cleaner run. */
export function isBetter(candidate: ScoreRecord, current: ScoreRecord): boolean {
  if (candidate.score !== current.score) return candidate.score > current.score;
  if (candidate.accuracy !== current.accuracy) return candidate.accuracy > current.accuracy;
  return candidate.maxCombo > current.maxCombo;
}

export function bestFor(scores: ScoreRecord[], key: string): ScoreRecord | null {
  let best: ScoreRecord | null = null;
  for (const score of scores) {
    if (scoreKey(score) !== key) continue;
    if (!best || isBetter(score, best)) best = score;
  }
  return best;
}

export interface SongActivity {
  key: string;
  modId: string | null;
  modName: string;
  engine: EngineId | null;
  songTitle: string;
  difficulty: string;
  plays: number;
  lastPlayedAt: string;
  bestRank: Rank;
}

/** Recently played songs, newest first, one row per song and difficulty. */
export function recentSongs(scores: ScoreRecord[], limit = 10): SongActivity[] {
  const byKey = new Map<string, SongActivity>();

  for (const score of scores) {
    const key = scoreKey(score);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        modId: score.modId,
        modName: score.modName,
        engine: score.engine,
        songTitle: score.songTitle,
        difficulty: score.difficulty,
        plays: 1,
        lastPlayedAt: score.playedAt,
        bestRank: score.rank,
      });
      continue;
    }
    existing.plays += 1;
    if (score.playedAt > existing.lastPlayedAt) existing.lastPlayedAt = score.playedAt;
    if (rankOrder(score.rank) < rankOrder(existing.bestRank)) existing.bestRank = score.rank;
  }

  return [...byKey.values()]
    .sort((a, b) => b.lastPlayedAt.localeCompare(a.lastPlayedAt))
    .slice(0, limit);
}

export function rankOrder(rank: Rank): number {
  return ['S', 'A', 'B', 'C', 'D', 'F'].indexOf(rank);
}

export interface HistorySummary {
  plays: number;
  songs: number;
  totalScore: number;
  bestRank: Rank | null;
  misses: number;
  holdDrops: number;
}

export function summarise(scores: ScoreRecord[]): HistorySummary {
  const songs = new Set(scores.map((score) => scoreKey(score)));
  let bestRank: Rank | null = null;
  let totalScore = 0;
  let misses = 0;
  let holdDrops = 0;

  for (const score of scores) {
    totalScore += score.score;
    misses += score.counts.miss;
    holdDrops += score.holdDrops;
    if (!bestRank || rankOrder(score.rank) < rankOrder(bestRank)) bestRank = score.rank;
  }

  return { plays: scores.length, songs: songs.size, totalScore, bestRank, misses, holdDrops };
}
