import { describe, expect, it } from 'vitest';
import { parseChart } from '../src/lib/player/chart';
import {
  HOLD_RELEASE_GRACE_MS,
  accuracyOf,
  advanceGame,
  createGame,
  pressLane,
  releaseLane,
} from '../src/lib/player/engine';

function holdChart() {
  return parseChart({
    song: {
      song: 'Hold Test',
      bpm: 120,
      speed: 2,
      notes: [
        {
          sectionNotes: [[1000, 0, 400]],
          mustHitSection: true,
          lengthInSteps: 16,
        },
      ],
    },
  });
}

function pressHold() {
  const game = createGame(holdChart());
  advanceGame(game, 1000);
  expect(pressLane(game, 0, 1000)).toBe('sick');
  return game;
}

describe('hold-note scoring', () => {
  it('scores the head and then the tail while the lane stays held', () => {
    const game = pressHold();
    expect(game.holdCompletions).toBe(0);
    expect(game.judged).toBe(1);
    expect(game.unitsTotal).toBe(2);

    advanceGame(game, 1399);
    expect(game.judged).toBe(1);

    advanceGame(game, 1400);
    expect(game.holdCompletions).toBe(1);
    expect(game.judged).toBe(2);
    expect(game.counts.miss).toBe(0);
    expect(accuracyOf(game)).toBe(1);
    expect(game.score).toBe(350 + 390);
  });

  it('drops the tail when the key is released early', () => {
    const game = pressHold();
    advanceGame(game, 1100);

    expect(releaseLane(game, 0, 1100)).toBe('dropped');
    expect(game.holdDrops).toBe(1);
    expect(game.counts.miss).toBe(1);
    expect(game.combo).toBe(0);
    expect(game.judged).toBe(2);
    expect(accuracyOf(game)).toBe(0.5);
  });

  it('accepts a release inside the grace window', () => {
    const game = pressHold();
    advanceGame(game, 1250);

    expect(releaseLane(game, 0, 1400 - HOLD_RELEASE_GRACE_MS)).toBe('held');
    expect(game.holdCompletions).toBe(1);
    expect(game.counts.miss).toBe(0);
    expect(game.holdDrops).toBe(0);
  });

  it('counts one miss, not two, when the head is missed', () => {
    const game = createGame(holdChart());
    advanceGame(game, 1000 + 161);

    expect(game.counts.miss).toBe(1);
    expect(game.judged).toBe(1);
    expect(game.holdDrops).toBe(0);

    advanceGame(game, 1500);
    expect(game.judged).toBe(1);
    expect(game.holdCompletions).toBe(0);
  });

  it('completes holds in autoplay and still finishes the song', () => {
    const game = createGame(holdChart(), { autoplay: true });
    for (let time = 0; time <= 2500; time += 16) advanceGame(game, time);

    expect(game.holdCompletions).toBe(1);
    expect(game.counts.sick).toBe(2);
    expect(game.counts.miss).toBe(0);
    expect(accuracyOf(game)).toBe(1);
    expect(game.finished).toBe(true);
    expect(results(game)).toMatchObject({ holdDrops: 0, holdCompletions: 1 });
  });

  it('ignores releases with no active hold', () => {
    const game = createGame(holdChart());
    advanceGame(game, 1000);
    expect(releaseLane(game, 0, 1100)).toBeNull();
    expect(game.judged).toBe(0);
  });
});

function results(game: ReturnType<typeof createGame>) {
  return {
    holdDrops: game.holdDrops,
    holdCompletions: game.holdCompletions,
  };
}
