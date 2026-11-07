import { describe, expect, it } from 'vitest';
import { parseChart } from '../src/lib/player/chart';
import {
  DEFAULT_WINDOWS,
  accuracyOf,
  advanceGame,
  createGame,
  judgementFor,
  pressLane,
  resultsOf,
} from '../src/lib/player/engine';

function testChart() {
  return parseChart({
    song: {
      song: 'Engine Test',
      bpm: 120,
      speed: 2,
      notes: [
        {
          sectionNotes: [
            [1000, 4, 0],
            [1200, 5, 0],
            [1400, 6, 0],
            [1600, 7, 0],
            [2000, 4, 400],
            [2400, 5, 0],
          ],
          mustHitSection: false,
          lengthInSteps: 16,
        },
      ],
    },
  });
}

describe('judgement windows', () => {
  it('maps offsets to the documented windows', () => {
    expect(judgementFor(0)).toBe('sick');
    expect(judgementFor(-40)).toBe('sick');
    expect(judgementFor(46)).toBe('good');
    expect(judgementFor(-100)).toBe('bad');
    expect(judgementFor(150)).toBe('shit');
    expect(judgementFor(161)).toBeNull();
    expect(DEFAULT_WINDOWS.shit).toBe(160);
  });
});

describe('gameplay simulation', () => {
  it('judges a perfectly timed press', () => {
    const game = createGame(testChart());
    advanceGame(game, 990);
    expect(pressLane(game, 0, 1000)).toBe('sick');
    expect(game.score).toBe(350);
    expect(game.combo).toBe(1);
    expect(game.counts.sick).toBe(1);
  });

  it('ignores presses with no note in the lane', () => {
    const game = createGame(testChart());
    advanceGame(game, 1000);
    expect(pressLane(game, 3, 1000)).toBeNull();
    expect(game.judged).toBe(0);
  });

  it('registers a miss once the window has passed, and only once', () => {
    const game = createGame(testChart());
    advanceGame(game, 1000 + DEFAULT_WINDOWS.shit + 1);
    expect(game.counts.miss).toBe(1);
    expect(game.combo).toBe(0);
    advanceGame(game, 1400 + DEFAULT_WINDOWS.shit + 1);
    // Notes at 1200 and 1400 have now also expired; the first miss is not counted twice.
    expect(game.counts.miss).toBe(3);
  });

  it('does not rewind when given an earlier time', () => {
    const game = createGame(testChart());
    advanceGame(game, 2000);
    const afterFirst = game.time;
    advanceGame(game, 10);
    expect(game.time).toBe(afterFirst);
  });

  it('plays a whole chart with autoplay and finishes it', () => {
    const game = createGame(testChart(), { autoplay: true });
    for (let time = 0; time <= 5000; time += 16) advanceGame(game, time);

    expect(game.finished).toBe(true);
    expect(game.counts.sick).toBe(game.chart.playerNotes);
    expect(game.counts.miss).toBe(0);
    expect(game.combo).toBe(game.chart.playerNotes);
    expect(game.maxCombo).toBe(game.chart.playerNotes);
    expect(accuracyOf(game)).toBe(1);

    const results = resultsOf(game);
    expect(results.playerNotes).toBe(6);
    expect(results.failed).toBe(false);
    expect(results.accuracy).toBe(1);
  });

  it('counts opponent notes as played without scoring them', () => {
    const opponentChart = parseChart({
      song: {
        song: 'Opponent only',
        bpm: 120,
        notes: [{ sectionNotes: [[500, 0, 0], [700, 1, 0]], mustHitSection: false }],
      },
    });
    const game = createGame(opponentChart, { autoplay: true });
    advanceGame(game, 1000);
    expect(game.score).toBe(0);
    expect(game.judged).toBe(0);
    expect(game.notes.every((note) => note.state === 'hit')).toBe(true);
  });

  it('fails the song when health runs out', () => {
    const game = createGame(testChart(), { startingHealth: 10, lossPerMiss: 5 });
    advanceGame(game, 5000);
    expect(game.failed).toBe(true);
    expect(game.finished).toBe(true);
    expect(game.counts.miss).toBeGreaterThan(0);
  });

  it('records the last judgement with its lane', () => {
    const game = createGame(testChart());
    advanceGame(game, 1200);
    pressLane(game, 1, 1205);
    expect(game.lastJudgement).toMatchObject({ lane: 1, judgement: 'sick' });
  });
});
