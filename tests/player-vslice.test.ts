import { describe, expect, it } from 'vitest';
import { ChartError, parseChart } from '../src/lib/player/chart';
import { isVSliceChart, parseVSliceChart, parseVSliceMetadata, vsliceDifficulties } from '../src/lib/player/vslice';

const chart = {
  version: '2.0.0',
  scrollSpeed: { normal: 1.5, hard: 2.2 },
  events: [{ t: 1000, e: 'Camera Zoom', v: { zoom: 1.4, duration: 200 } }],
  notes: {
    normal: [
      { t: 1000, d: 0, l: 0 },
      { t: 1200, d: 4, l: 0, k: 'mine' },
      { t: 1400, d: 1, l: 500 },
    ],
    hard: [{ t: 1000, d: 3, l: 0 }],
  },
};

describe('V-Slice detection', () => {
  it('recognises a current V-Slice chart', () => {
    expect(isVSliceChart(chart)).toBe(true);
  });

  it('does not claim legacy charts or Psych charts', () => {
    expect(isVSliceChart({ song: 'Bopeebo', notes: [{ sectionNotes: [[0, 0, 0]] }] })).toBe(false);
    expect(isVSliceChart({ format: 'psych_v1', version: '1.0.0', scrollSpeed: 2, notes: {} })).toBe(false);
    expect(isVSliceChart({})).toBe(false);
  });

  it('lists the difficulties in the chart', () => {
    expect(vsliceDifficulties(chart)).toEqual(['normal', 'hard']);
  });
});

describe('V-Slice parsing', () => {
  it('reads notes, the player strumline, sustains and note kinds', () => {
    const parsed = parseChart(chart);
    expect(parsed.format).toBe('vslice');
    expect(parsed.difficulty).toBe('normal');
    expect(parsed.speed).toBe(1.5);

    expect(parsed.notes).toHaveLength(3);
    expect(parsed.notes[0]).toMatchObject({ time: 1000, lane: 0, player: true, sustain: 0 });
    // d = 4 is the opponent's strumline.
    expect(parsed.notes[1]).toMatchObject({ time: 1200, lane: 0, player: false, type: 'mine' });
    expect(parsed.notes[2]).toMatchObject({ time: 1400, lane: 1, player: true, sustain: 500 });
    expect(parsed.playerNotes).toBe(2);
    expect(parsed.noteTypes).toEqual(['mine']);
  });

  it('selects a requested difficulty', () => {
    const parsed = parseVSliceChart(chart, { difficulty: 'hard' });
    expect(parsed.difficulty).toBe('hard');
    expect(parsed.speed).toBeCloseTo(2.2);
    expect(parsed.notes).toHaveLength(1);
    expect(parsed.notes[0]).toMatchObject({ lane: 3, player: true });
  });

  it('flattens events into the shared event shape', () => {
    const parsed = parseChart(chart);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({ time: 1000, name: 'Camera Zoom', value1: 1.4, value2: 200 });
  });

  it('refuses tick-based charts instead of desyncing them', () => {
    expect(() =>
      parseVSliceChart(chart, { metadata: { ...metadata(), timeFormat: 'ticks' } }),
    ).toThrowError(ChartError);
  });

  it('converts float (seconds) charts to milliseconds', () => {
    // In float charts the timestamps themselves are seconds, not milliseconds.
    const floatChart = {
      ...chart,
      events: [{ t: 1, e: 'Camera Zoom', v: { zoom: 1.2 } }],
      notes: { normal: [{ t: 1.5, d: 0, l: 0.5 }] },
    };
    const parsed = parseVSliceChart(floatChart, { metadata: { ...metadata(), timeFormat: 'float' } });
    expect(parsed.notes[0]).toMatchObject({ time: 1500, sustain: 500 });
    expect(parsed.events[0]?.time).toBe(1000);
  });

  it('reports a chart with no notes as a named problem', () => {
    try {
      parseVSliceChart({ version: '2.0.0', scrollSpeed: 1, notes: { normal: [] } });
      throw new Error('expected a ChartError');
    } catch (error) {
      expect(error).toBeInstanceOf(ChartError);
      expect((error as ChartError).problem).toBe('no-notes');
    }
  });
});

describe('V-Slice metadata', () => {
  it('reads the current metadata layout', () => {
    const parsed = parseVSliceMetadata({
      songName: 'Bopeebo',
      artist: 'Kawai Sprite',
      timeFormat: 'ms',
      playData: {
        stage: 'mainStage',
        characters: { player: 'bf', opponent: 'dad', girlfriend: 'gf' },
        difficulties: ['easy', 'normal', 'hard'],
      },
    });

    expect(parsed).toMatchObject({
      songName: 'Bopeebo',
      stage: 'mainStage',
      player1: 'bf',
      player2: 'dad',
      difficulties: ['easy', 'normal', 'hard'],
      timeFormat: 'ms',
    });
  });

  it('reads the older metadata layout', () => {
    const parsed = parseVSliceMetadata({
      song: 'Fresh',
      player1: 'bf',
      player2: 'dad',
      gfVersion: 'gf',
      stage: 'stage',
      bpm: 102,
      difficulties: ['Easy', 'Normal'],
    });
    expect(parsed).toMatchObject({ songName: 'Fresh', bpm: 102, player1: 'bf', difficulties: ['Easy', 'Normal'] });
  });
});

function metadata() {
  return {
    songName: 'Test',
    artist: null,
    stage: 'stage',
    player1: 'bf',
    player2: 'dad',
    girlfriend: 'gf',
    difficulties: ['normal'],
    timeFormat: 'ms',
    bpm: 150,
  };
}
