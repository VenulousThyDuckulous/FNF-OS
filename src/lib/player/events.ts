import type { ChartEvent } from './chart';

/**
 * Chart events.
 *
 * Events are data, never script: each one is matched by name against an explicit
 * table of effects this runtime can actually apply. Anything else is counted and
 * reported to the player, because silently dropping an event would make a
 * modchart look broken for no stated reason.
 *
 * Implemented effects: camera zoom (absolute and additive), scroll-speed changes,
 * character animation triggers, "Hey!" and character swaps (reported to the
 * renderer, applied only when the replacement's assets exist), and camera focus
 * (a no-op on the highway, so it is reported instead of claimed).
 */

export interface EventTrigger {
  kind: 'animation' | 'character-swap';
  /** Time the event fired, in ms. */
  at: number;
  /** Who the event addresses: the player's character or the opponent's. */
  target: 'player' | 'opponent';
  value: string;
}

export interface EventFrame {
  /** Camera zoom multiplier, 1 = no zoom. */
  zoom: number;
  /** Current scroll speed multiplier. */
  scrollSpeed: number;
  /** Triggers that fired since the previous frame. */
  triggers: EventTrigger[];
}

export interface EventRunner {
  apply(timeMs: number): EventFrame;
  /** Event names seen in the chart that this runtime does not implement. */
  unsupported: Map<string, number>;
  /** Event names that were applied at least once. */
  applied: Set<string>;
  /** How many events have been consumed by the timeline. */
  consumed: number;
  reset(): void;
}

const SUPPORTED = new Set([
  'camera zoom',
  'add camera zoom',
  'change scroll speed',
  'play animation',
  'hey!',
  'change character',
]);

/** True when this runtime applies the named event instead of only reporting it. */
export function isSupportedEvent(name: string): boolean {
  return SUPPORTED.has(name.trim().toLowerCase());
}

function numberValue(value: string | number, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) && String(value).trim() !== '' ? parsed : fallback;
}

function textValue(value: string | number): string {
  return typeof value === 'string' ? value.trim() : String(value);
}

/** Which character an event refers to. Psych uses character names or 0/1. */
function triggerTarget(value: string | number): 'player' | 'opponent' {
  const text = textValue(value).toLowerCase();
  if (text === '1' || text === 'dad' || text === 'opponent') return 'opponent';
  return 'player';
}

export function createEventRunner(events: ChartEvent[], options: { baseSpeed: number }): EventRunner {
  const sorted = [...events].sort((a, b) => a.time - b.time);
  const baseSpeed = Math.max(0.1, options.baseSpeed);

  let index = 0;
  let scrollSpeed = baseSpeed;
  let zoomTarget = 1;
  let zoomFrom = 1;
  let zoomStart = 0;
  let zoomDuration = 0;
  const unsupported = new Map<string, number>();
  const applied = new Set<string>();

  const zoomAt = (timeMs: number): number => {
    if (zoomDuration <= 0) return zoomTarget;
    const progress = Math.min(1, Math.max(0, (timeMs - zoomStart) / zoomDuration));
    return zoomFrom + (zoomTarget - zoomFrom) * progress;
  };

  return {
    unsupported,
    applied,
    get consumed() {
      return index;
    },
    reset() {
      index = 0;
      scrollSpeed = baseSpeed;
      zoomTarget = 1;
      zoomFrom = 1;
      zoomStart = 0;
      zoomDuration = 0;
      unsupported.clear();
      applied.clear();
    },
    apply(timeMs: number): EventFrame {
      const triggers: EventTrigger[] = [];

      while (index < sorted.length && sorted[index]!.time <= timeMs) {
        const event = sorted[index]!;
        index += 1;
        const name = event.name.trim().toLowerCase();

        if (!SUPPORTED.has(name)) {
          unsupported.set(event.name, (unsupported.get(event.name) ?? 0) + 1);
          continue;
        }

        switch (name) {
          case 'camera zoom':
          case 'add camera zoom': {
            const amount = numberValue(event.value1, 1);
            const duration = Math.max(0, numberValue(event.value2, 0));
            zoomFrom = zoomAt(event.time);
            zoomTarget =
              name === 'add camera zoom'
                ? Math.min(2.5, Math.max(0.5, zoomFrom + amount))
                : Math.min(2.5, Math.max(0.5, amount));
            zoomStart = event.time;
            zoomDuration = duration;
            applied.add(event.name);
            break;
          }
          case 'change scroll speed': {
            const speed = numberValue(event.value1, scrollSpeed);
            // Psych treats the value as a multiplier of the chart's own speed.
            scrollSpeed = Math.min(6, Math.max(0.2, speed));
            applied.add(event.name);
            break;
          }
          case 'play animation': {
            triggers.push({
              kind: 'animation',
              at: event.time,
              target: triggerTarget(event.value1),
              value: textValue(event.value2),
            });
            applied.add(event.name);
            break;
          }
          case 'hey!': {
            triggers.push({ kind: 'animation', at: event.time, target: 'opponent', value: 'hey' });
            applied.add(event.name);
            break;
          }
          case 'change character': {
            triggers.push({
              kind: 'character-swap',
              at: event.time,
              target: 'player',
              value: textValue(event.value1),
            });
            applied.add(event.name);
            break;
          }
          default:
            unsupported.set(event.name, (unsupported.get(event.name) ?? 0) + 1);
        }
      }

      return { zoom: zoomAt(timeMs), scrollSpeed, triggers };
    },
  };
}

/** Human-readable list of event names that will be ignored, for the UI. */
export function unsupportedSummary(runner: EventRunner): string[] {
  return [...runner.unsupported.entries()].map(
    ([name, count]) => `${name} ×${count}`,
  );
}
