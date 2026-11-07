import type { EntryMap } from '../import/zip';
import { framesWithPrefix, frameForAnimation, type SparrowAtlas, type SparrowFrame } from './sparrow';

/**
 * Characters and stages.
 *
 * Psych describes a character with `characters/<name>.json`: a list of animations
 * (name, Sparrow prefix, fps, loop, offsets) plus position, flip and scale. The
 * sprite itself is `characters/<name>.png` with a matching `.xml`.
 *
 * Supported: idle/sing/loop animations, offsets, flip, scale, left/right
 * placement, and a single background image (plus an optional front layer) for
 * the stage. Not supported: Lua-driven character/stage logic, shaders, stage
 * lighting scripts, and per-character shader effects - those are reported, never
 * silently faked.
 */

export interface CharacterAnimation {
  name: string;
  prefix: string;
  fps: number;
  loop: boolean;
  offsets: [number, number];
}

export interface CharacterDefinition {
  name: string;
  animations: CharacterAnimation[];
  position: [number, number];
  cameraPosition: [number, number];
  flipX: boolean;
  scale: number;
}

export interface CharacterAssets {
  jsonPath: string;
  imagePath: string;
  xmlPath: string;
}

export interface StageAssets {
  name: string;
  backgroundPath: string | null;
  frontPath: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function toTuple(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) return [0, 0];
  return [toNumber(value[0], 0), toNumber(value[1], 0)];
}

/** Parse a Psych character JSON file. Returns null when it has no animations. */
export function parseCharacterJson(raw: unknown): CharacterDefinition | null {
  if (!isRecord(raw)) return null;
  const list = Array.isArray(raw.animations) ? raw.animations : null;
  if (!list) return null;

  const animations: CharacterAnimation[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const prefix = typeof entry.name === 'string' ? entry.name.trim() : '';
    const name = typeof entry.anim === 'string' ? entry.anim.trim() : prefix;
    if (!prefix || !name) continue;
    animations.push({
      name,
      prefix,
      fps: toNumber(entry.fps, 24),
      loop: entry.loop !== false,
      offsets: toTuple(entry.offsets),
    });
  }

  if (animations.length === 0) return null;

  return {
    name: typeof raw.name === 'string' ? raw.name : '',
    animations,
    position: toTuple(raw.position),
    cameraPosition: toTuple(raw.camera_position ?? raw.cameraPosition),
    flipX: raw.flip_x === true || raw.flipX === true,
    scale: Math.max(0.1, toNumber(raw.scale, 1)),
  };
}

/** Find the animation a name refers to, falling back to idle then the first. */
export function pickAnimation(def: CharacterDefinition, wanted: string): CharacterAnimation | null {
  const target = wanted.toLowerCase();
  const exact = def.animations.find((animation) => animation.name.toLowerCase() === target);
  if (exact) return exact;
  const prefixed = def.animations.find((animation) => animation.name.toLowerCase().startsWith(target));
  if (prefixed) return prefixed;
  const idle = def.animations.find((animation) => animation.name.toLowerCase() === 'idle');
  return idle ?? def.animations[0] ?? null;
}

export function characterFrame(
  atlas: SparrowAtlas,
  animation: CharacterAnimation,
  elapsedMs: number,
): SparrowFrame | null {
  const frames = framesWithPrefix(atlas.frames, animation.prefix);
  return frameForAnimation(frames, elapsedMs, animation.fps, animation.loop);
}

/** Which sing animation a lane press should trigger. */
export function singAnimationForLane(lane: number): string {
  return ['singLEFT', 'singDOWN', 'singUP', 'singRIGHT'][lane % 4] ?? 'idle';
}

const CHARACTER_ROOTS = ['characters/', 'images/characters/', 'images/'];

export function resolveCharacterAssets(files: EntryMap, name: string): CharacterAssets | null {
  const index = new Map<string, string>();
  for (const path of files.keys()) index.set(path.toLowerCase().replace(/\\/g, '/'), path);

  const lowerName = name.toLowerCase();
  for (const root of CHARACTER_ROOTS) {
    const jsonPath = index.get(`${root}${lowerName}.json`);
    if (!jsonPath) continue;
    const imagePath = index.get(`${root}${lowerName}.png`);
    const xmlPath = index.get(`${root}${lowerName}.xml`);
    if (!imagePath || !xmlPath) continue;
    return { jsonPath, imagePath, xmlPath };
  }

  return null;
}

/**
 * Resolve a stage's images. Psych stages are `<stage>.png` (background) with an
 * optional `<stage>Front.png`; custom stages often use `stages/<name>/bg.png`.
 */
export function resolveStageAssets(files: EntryMap, stageName: string): StageAssets {
  const index = new Map<string, string>();
  for (const path of files.keys()) index.set(path.toLowerCase().replace(/\\/g, '/'), path);
  const name = stageName.toLowerCase();

  const pick = (...candidates: string[]): string | null => {
    for (const candidate of candidates) {
      const hit = index.get(candidate);
      if (hit) return hit;
    }
    return null;
  };

  const backgroundPath =
    pick(
      `stages/${name}/bg.png`,
      `stages/${name}/background.png`,
      `images/${name}.png`,
      `images/stage.png`,
    ) ?? null;

  const frontPath =
    pick(
      `stages/${name}/front.png`,
      `stages/${name}/fg.png`,
      `images/${name}front.png`,
      `images/stagefront.png`,
    ) ?? null;

  return { name: stageName, backgroundPath, frontPath };
}
