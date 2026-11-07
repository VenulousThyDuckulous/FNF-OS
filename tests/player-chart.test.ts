import { describe, expect, it } from 'vitest';
import { ChartError, parseChart, parseChartText } from '../src/lib/player/chart';

function chartJson(overrides: Record<string, unknown> = {}): unknown {
  return {
    song: {
      song: 'Test Song',
      bpm: 120,
      speed: 2,
      player1: 'bf',
      player2: 'dad',
      stage: 'stage',
      needsVoices: true,
      notes: [
        {
          sectionNotes: [
            [1000, 0, 0],
            [1250, 4, 500],
            [1500, 1, 0, 'mine'],
          ],
          bpm: 120,
          mustHitSection: true,
          changeBPM: false,
          lengthInSteps: 16,
        },
        {
          sectionNotes: [[3500, 2, 0]],
          bpm: 150,
          mustHitSection: false,
          changeBPM: true,
          lengthInSteps: 16,
        },
      ],
      ...overrides,
    },
  };
}

describe('chart parsing', () => {
  it('reads song metadata and notes', () => {
    const chart = parseChart(chartJson());
    expect(chart.title).toBe('Test Song');
    expect(chart.bpm).toBe(120);
    expect(chart.speed).toBe(2);
    expect(chart.notes).toHaveLength(4);
    // Section 1 has two player notes; section 2's low lane belongs to the opponent.
    expect(chart.playerNotes).toBe(2);
  });

  it('maps lanes and ownership with the mustHitSection XOR rule', () => {
    const chart = parseChart(chartJson());
    const [first, second, third] = chart.notes;

    // Section 1 is mustHitSection: low lanes belong to the player.
    expect(first).toMatchObject({ lane: 0, player: true, time: 1000 });
    expect(second).toMatchObject({ lane: 0, player: false, sustain: 500 });
    expect(third).toMatchObject({ lane: 1, player: true, type: 'mine' });

    // Section 2 is not: the low lane belongs to the opponent.
    expect(chart.notes[3]).toMatchObject({ lane: 2, player: false, time: 3500 });
  });

  it('records custom note types and chart length', () => {
    const chart = parseChart(chartJson());
    expect(chart.noteTypes).toEqual(['mine']);
    expect(chart.lastNoteTime).toBe(3500);
    expect(chart.length).toBe(6500);
  });

  it('applies BPM changes only when the section says so', () => {
    const chart = parseChart(chartJson());
    expect(chart.sections[0]?.bpm).toBe(120);
    expect(chart.sections[1]?.bpm).toBe(150);
  });

  it('parses events into a flat list', () => {
    const chart = parseChart(
      chartJson({
        events: [
          [2000, [['Camera Zoom', 1.2, 2]]],
          [3000, [['Play Animation', 'BF', 'hey']]],
        ],
      }),
    );
    expect(chart.events).toHaveLength(2);
    expect(chart.events[0]).toMatchObject({ time: 2000, name: 'Camera Zoom', value1: 1.2, value2: 2 });
    expect(chart.events[1]).toMatchObject({ name: 'Play Animation', value1: 'BF', value2: 'hey' });
  });

  it('accepts a bare chart object without the song wrapper', () => {
    const bare = { song: 'Bare', bpm: 100, notes: [{ sectionNotes: [[500, 4, 0]], mustHitSection: false }] };
    const chart = parseChart(bare);
    expect(chart.title).toBe('Bare');
    expect(chart.notes[0]).toMatchObject({ lane: 0, player: true, time: 500 });
  });

  it('refuses charts with no notes', () => {
    expect(() => parseChart(chartJson({ notes: [] }))).toThrow(ChartError);
    expect(() => parseChart(chartJson({ notes: [{ sectionNotes: [] }] }))).toThrow(/no notes/i);
  });

  it('refuses JSON that is not a chart', () => {
    expect(() => parseChart({ hello: 'world' })).toThrow(ChartError);
    expect(() => parseChartText('{not json')).toThrow(/valid JSON/);
  });

  it('skips notes with invalid times instead of shifting them', () => {
    const chart = parseChart(
      chartJson({
        notes: [{ sectionNotes: [[1000, 4, 0], [-5, 4, 0], ['nope', 4, 0]], mustHitSection: false }],
      }),
    );
    expect(chart.notes).toHaveLength(1);
    expect(chart.notes[0]?.time).toBe(1000);
  });
});
