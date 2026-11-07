import type { EntryMap } from '../import/zip';
import { LANE_COUNT, type Lane } from './chart';
import { parseSparrowXml, type SparrowAtlas, type SparrowFrame } from './sparrow';

/**
 * Custom note skins.
 *
 * Psych note skins are a Sparrow PNG+XML pair, usually `images/noteSkins/NOTE_assets`.
 * Frames are named per colour (`purple0`, `blue press`, `purple hold piece`, ...).
 * When a mod has no skin, or its atlas is missing the frames a lane needs, the
 * renderer falls back to its built-in diamonds for that lane rather than drawing
 * nothing.
 */

/** Lane 0-3 map to Psych's note colours. */
export const NOTE_COLOUR_NAMES = ['purple', 'blue', 'green', 'red'] as const;

export interface NoteSkinSource {
  /** Lower-case path used for diagnostics. */
  name: string;
  imagePath: string;
  xmlPath: string;
}

export interface NoteSkin {
  name: string;
  atlas: SparrowAtlas;
  /** Resolved frame names; missing pieces are null and drawn with the default. */
  frames: Record<string, SparrowFrame | null>;
}

const SKIN_PATTERNS = [
  /(^|\/)(?:assets\/)?images\/noteSkins\/([^/]+)\/([^/]+)\.(png|xml)$/i,
  /(^|\/)(?:assets\/)?images\/noteSkins\/([^/]+)\.(png|xml)$/i,
  /(^|\/)(?:assets\/)?images\/(NOTE_assets|noteSkins)\.(png|xml)$/i,
];

/** Find a Sparrow note-skin pair in an imported mod. */
export function resolveNoteSkin(files: EntryMap): NoteSkinSource | null {
  const index = new Map<string, string>();
  for (const path of files.keys()) index.set(path.toLowerCase().replace(/\\/g, '/'), path);

  for (const pattern of SKIN_PATTERNS) {
    for (const [lower, original] of index) {
      if (!pattern.test(lower) || !lower.endsWith('.png')) continue;
      const xml = index.get(lower.replace(/\.png$/, '.xml'));
      if (!xml) continue;
      const name = lower.slice(lower.lastIndexOf('/') + 1, lower.lastIndexOf('.'));
      return { name, imagePath: original, xmlPath: xml };
    }
  }

  return null;
}

export function skinFrameName(lane: Lane, variant: 'note' | 'press' | 'holdPiece' | 'holdEnd'): string {
  const colour = NOTE_COLOUR_NAMES[lane % LANE_COUNT] ?? 'purple';
  if (variant === 'note') return `${colour}0`;
  if (variant === 'press') return `${colour} press`;
  if (variant === 'holdPiece') return `${colour} hold piece`;
  return `${colour} hold end`;
}

/**
 * Build the skin from an already-decoded XML string and image. Pure so tests can
 * cover frame resolution without a canvas.
 */
export function createNoteSkin(name: string, xml: string, image: CanvasImageSource): NoteSkin {
  const parsed = parseSparrowXml(xml);
  const frames: Record<string, SparrowFrame | null> = {};

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const laneIndex = lane as Lane;
    for (const variant of ['note', 'press', 'holdPiece', 'holdEnd'] as const) {
      const wanted = skinFrameName(laneIndex, variant).toLowerCase();
      const exact = parsed.get(skinFrameName(laneIndex, variant));
      // Some skins capitalise frames ("Purple0") or omit the trailing zero.
      const loose = exact ?? [...parsed.values()].find((frame) => frame.name.toLowerCase() === wanted);
      frames[`${lane}:${variant}`] = loose ?? null;
    }
  }

  return {
    name,
    atlas: { image, frames: parsed, imageWidth: 0, imageHeight: 0 },
    frames,
  };
}

export function skinFrame(
  skin: NoteSkin | null,
  lane: Lane,
  variant: 'note' | 'press' | 'holdPiece' | 'holdEnd',
): SparrowFrame | null {
  if (!skin) return null;
  return skin.frames[`${lane}:${variant}`] ?? null;
}

/** How many of a skin's expected frames are present, for the readiness report. */
export function skinCoverage(skin: NoteSkin): { present: number; expected: number } {
  const values = Object.values(skin.frames);
  return { present: values.filter((frame) => frame !== null).length, expected: values.length };
}
