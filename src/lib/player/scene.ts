import type { EntryMap } from '../import/zip';
import {
  characterFrame,
  parseCharacterJson,
  pickAnimation,
  type CharacterAnimation,
  type CharacterAssets,
  type CharacterDefinition,
  type StageAssets,
} from './characters';
import { createNoteSkin, type NoteSkin, type NoteSkinSource } from './skins';
import { parseSparrowXml, type SparrowAtlas, type SparrowFrame } from './sparrow';

/**
 * Loading a mod's visual assets.
 *
 * Everything here reads bytes out of the imported archive: the note-skin atlas,
 * the two characters and the stage background. Image decoding uses the browser's
 * own decoder through a blob, so no mod file is ever executed as code. Missing
 * pieces are collected as problems and the runtime falls back to its own drawing
 * instead of failing the song.
 */

export interface SceneAssets {
  noteSkin: NoteSkinSource | null;
  player: CharacterAssets | null;
  opponent: CharacterAssets | null;
  stage: StageAssets;
}

export interface LoadedCharacter {
  def: CharacterDefinition;
  atlas: SparrowAtlas;
  side: 'player' | 'opponent';
}

export interface LoadedStage {
  background: CanvasImageSource | null;
  front: CanvasImageSource | null;
}

export interface LoadedScene {
  skin: NoteSkin | null;
  player: LoadedCharacter | null;
  opponent: LoadedCharacter | null;
  stage: LoadedStage;
  problems: string[];
}

/** Mutable animation state for one character. */
export interface AnimatedCharacter {
  def: CharacterDefinition;
  atlas: SparrowAtlas;
  animation: CharacterAnimation;
  startedAt: number;
  side: 'player' | 'opponent';
}

export function createAnimatedCharacter(character: LoadedCharacter, atMs: number): AnimatedCharacter {
  const idle = pickAnimation(character.def, 'idle') ?? character.def.animations[0]!;
  return {
    def: character.def,
    atlas: character.atlas,
    animation: idle,
    startedAt: atMs,
    side: character.side,
  };
}

/** Switch animation, restarting the loop only when the name changes. */
export function setCharacterAnimation(character: AnimatedCharacter, name: string, atMs: number): void {
  const next = pickAnimation(character.def, name);
  if (!next) return;
  if (next.name === character.animation.name) return;
  character.animation = next;
  character.startedAt = atMs;
}

export function characterCurrentFrame(character: AnimatedCharacter | null, atMs: number): SparrowFrame | null {
  if (!character) return null;
  return characterFrame(character.atlas, character.animation, Math.max(0, atMs - character.startedAt));
}

async function decodeImage(bytes: Uint8Array): Promise<CanvasImageSource | null> {
  const copy = bytes.slice();
  try {
    if (typeof createImageBitmap === 'function') {
      return await createImageBitmap(new Blob([copy], { type: 'image/png' }));
    }
  } catch {
    // Fall through to the <img> path below.
  }

  if (typeof Image === 'undefined') return null;

  return await new Promise<CanvasImageSource | null>((resolve) => {
    const url = URL.createObjectURL(new Blob([copy], { type: 'image/png' }));
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function readText(files: EntryMap, path: string): string | null {
  const bytes = files.get(path);
  if (!bytes) return null;
  try {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

async function loadAtlas(files: EntryMap, imagePath: string, xmlPath: string): Promise<SparrowAtlas | null> {
  const xml = readText(files, xmlPath);
  const bytes = files.get(imagePath);
  if (!xml || !bytes) return null;

  const frames = parseSparrowXml(xml);
  if (frames.size === 0) return null;
  const image = await decodeImage(bytes);
  if (!image) return null;

  return {
    image,
    frames,
    imageWidth: image instanceof HTMLImageElement ? image.naturalWidth : 0,
    imageHeight: image instanceof HTMLImageElement ? image.naturalHeight : 0,
  };
}

async function loadCharacter(files: EntryMap, assets: CharacterAssets, side: 'player' | 'opponent'): Promise<LoadedCharacter | null> {
  const json = readText(files, assets.jsonPath);
  if (!json) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    return null;
  }

  const def = parseCharacterJson(raw);
  if (!def) return null;
  const atlas = await loadAtlas(files, assets.imagePath, assets.xmlPath);
  if (!atlas) return null;
  return { def, atlas, side };
}

export interface SceneLoadOptions {
  /** Skip image decoding entirely (used when a song has no assets). */
  skip?: boolean;
}

export async function loadScene(
  files: EntryMap,
  assets: SceneAssets,
  options: SceneLoadOptions = {},
): Promise<LoadedScene> {
  const problems: string[] = [];
  if (options.skip) {
    return { skin: null, player: null, opponent: null, stage: { background: null, front: null }, problems };
  }

  let skin: NoteSkin | null = null;
  if (assets.noteSkin) {
    const xml = readText(files, assets.noteSkin.xmlPath);
    const bytes = files.get(assets.noteSkin.imagePath);
    const image = bytes ? await decodeImage(bytes) : null;
    if (xml && image) {
      const built = createNoteSkin(assets.noteSkin.name, xml, image);
      if (Object.values(built.frames).some((frame) => frame !== null)) skin = built;
      else problems.push(`Note skin "${assets.noteSkin.name}" has no note frames this runtime recognises.`);
    } else {
      problems.push(`Note skin "${assets.noteSkin.name}" could not be decoded; using the default notes.`);
    }
  }

  const player = assets.player ? await loadCharacter(files, assets.player, 'player') : null;
  if (assets.player && !player) problems.push(`Player character assets at ${assets.player.jsonPath} could not be loaded.`);

  const opponent = assets.opponent ? await loadCharacter(files, assets.opponent, 'opponent') : null;
  if (assets.opponent && !opponent) {
    problems.push(`Opponent character assets at ${assets.opponent.jsonPath} could not be loaded.`);
  }

  let background: CanvasImageSource | null = null;
  if (assets.stage.backgroundPath) {
    const bytes = files.get(assets.stage.backgroundPath);
    background = bytes ? await decodeImage(bytes) : null;
    if (!background) problems.push(`Stage image ${assets.stage.backgroundPath} could not be decoded.`);
  }

  let front: CanvasImageSource | null = null;
  if (assets.stage.frontPath) {
    const bytes = files.get(assets.stage.frontPath);
    front = bytes ? await decodeImage(bytes) : null;
  }

  return { skin, player, opponent, stage: { background, front }, problems };
}
