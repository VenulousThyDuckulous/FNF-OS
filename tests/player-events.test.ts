import { describe, expect, it } from 'vitest';
import { parseChart } from '../src/lib/player/chart';
import { createEventRunner, isSupportedEvent, unsupportedSummary } from '../src/lib/player/events';

function events() {
  return parseChart({
    song: {
      song: 'Event Test',
      bpm: 120,
      speed: 2,
      notes: [{ sectionNotes: [[1000, 0, 0]], mustHitSection: true }],
      events: [
        [1000, [['Camera Zoom', 1.5, 500]]],
        [2000, [['Play Animation', 'dad', 'hey']]],
        [2500, [['Set GF Speed', 2, 0]]],
        [3000, [['Change Scroll Speed', 3, 0]]],
        [3500, [['Hey!', 1, 0]]],
        [4000, [['Change Character', 'bf-car', 0]]],
        [4500, [['Camera Zoom', 0.5, 0]]],
        [5000, [['Add Camera Zoom', 0.5, 0]]],
      ],
    },
  }).events;
}

describe('chart events', () => {
  it('applies a camera zoom at its timestamp', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    expect(runner.apply(0).zoom).toBe(1);
    expect(runner.apply(1500).zoom).toBeCloseTo(1.5, 5);
  });

  it('eases zoom changes over their duration', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    expect(runner.apply(1000).zoom).toBeCloseTo(1, 5);
    expect(runner.apply(1250).zoom).toBeCloseTo(1.25, 5);
    expect(runner.apply(1500).zoom).toBeCloseTo(1.5, 5);
  });

  it('changes scroll speed', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    expect(runner.apply(2999).scrollSpeed).toBe(2);
    expect(runner.apply(3000).scrollSpeed).toBe(3);
  });

  it('emits animation and character-swap triggers', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    const atTwo = runner.apply(2000);
    expect(atTwo.triggers).toContainEqual({ kind: 'animation', at: 2000, target: 'opponent', value: 'hey' });

    const atHey = runner.apply(3500);
    expect(atHey.triggers).toContainEqual({ kind: 'animation', at: 3500, target: 'opponent', value: 'hey' });

    const atSwap = runner.apply(4000);
    expect(atSwap.triggers).toContainEqual({ kind: 'character-swap', at: 4000, target: 'player', value: 'bf-car' });
  });

  it('applies additive zoom relative to the current zoom', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    runner.apply(4500);
    // Camera Zoom 0.5 at 4500, then Add Camera Zoom 0.5 at 5000.
    expect(runner.apply(5000).zoom).toBeCloseTo(1, 5);
  });

  it('reports unsupported event names instead of ignoring them', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    runner.apply(6000);
    expect(unsupportedSummary(runner)).toContain('Set GF Speed ×1');
    expect(runner.unsupported.has('Hey!')).toBe(false);
    expect(runner.applied.has('Camera Zoom')).toBe(true);
  });

  it('knows which event names it implements', () => {
    expect(isSupportedEvent('camera zoom')).toBe(true);
    expect(isSupportedEvent('Change Scroll Speed')).toBe(true);
    expect(isSupportedEvent('Set GF Speed')).toBe(false);
  });

  it('resets back to the start of the timeline', () => {
    const runner = createEventRunner(events(), { baseSpeed: 2 });
    runner.apply(3000);
    expect(runner.consumed).toBeGreaterThan(0);
    runner.reset();
    expect(runner.consumed).toBe(0);
    expect(runner.apply(0).scrollSpeed).toBe(2);
    expect(runner.unsupported.size).toBe(0);
  });
});
