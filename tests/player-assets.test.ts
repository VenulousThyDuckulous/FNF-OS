import { describe, expect, it } from 'vitest';
import {
  characterFrame,
  parseCharacterJson,
  pickAnimation,
  resolveCharacterAssets,
  resolveStageAssets,
  singAnimationForLane,
} from '../src/lib/player/characters';
import { createNoteSkin, resolveNoteSkin, skinCoverage, skinFrame, skinFrameName } from '../src/lib/player/skins';
import { frameForAnimation, framesWithPrefix, parseSparrowXml, type SparrowAtlas } from '../src/lib/player/sparrow';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<TextureAtlas imagePath="NOTE_assets.png">
  <SubTexture name="purple0" x="0" y="0" width="157" height="157" frameX="-10" frameY="-10" frameWidth="180" frameHeight="180"/>
  <SubTexture name="blue0" x="160" y="0" width="157" height="157"/>
  <SubTexture name="green0" x="320" y="0" width="157" height="157"/>
  <SubTexture name="red0" x="480" y="0" width="157" height="157"/>
  <SubTexture name="purple press" x="0" y="160" width="157" height="157"/>
  <SubTexture name="blue hold piece" x="160" y="160" width="30" height="60"/>
  <SubTexture name="blue hold end" x="200" y="160" width="30" height="60"/>
</TextureAtlas>`;

const IMAGE = {} as unknown as CanvasImageSource;

function files(entries: string[]): Map<string, Uint8Array> {
  return new Map(entries.map((path) => [path, new Uint8Array([1, 2, 3])]));
}

describe('Sparrow atlases', () => {
  it('parses frames and trimming data', () => {
    const frames = parseSparrowXml(XML);
    expect(frames.size).toBe(7);
    expect(frames.get('purple0')).toMatchObject({
      x: 0,
      y: 0,
      width: 157,
      height: 157,
      frameWidth: 180,
      frameHeight: 180,
      frameX: -10,
      frameY: -10,
    });
    expect(frames.get('blue0')?.frameWidth).toBeNull();
  });

  it('finds frames by animation prefix', () => {
    const frames = parseSparrowXml(`
      <SubTexture name="BF idle dance0000" x="0" y="0" width="10" height="10"/>
      <SubTexture name="BF idle dance0001" x="10" y="0" width="10" height="10"/>
      <SubTexture name="BF singLEFT0000" x="20" y="0" width="10" height="10"/>
    `);
    expect(framesWithPrefix(frames, 'bf idle dance')).toHaveLength(2);
    expect(framesWithPrefix(frames, 'nothing')).toHaveLength(0);
  });

  it('loops and clamps animation frames by fps', () => {
    const list = framesWithPrefix(
      parseSparrowXml(`
        <SubTexture name="a0000" x="0" y="0" width="4" height="4"/>
        <SubTexture name="a0001" x="4" y="0" width="4" height="4"/>
      `),
      'a',
    );
    expect(frameForAnimation(list, 0, 10, true)?.name).toBe('a0000');
    expect(frameForAnimation(list, 150, 10, true)?.name).toBe('a0001');
    expect(frameForAnimation(list, 1000, 10, true)?.name).toBe('a0000');
    expect(frameForAnimation(list, 1000, 10, false)?.name).toBe('a0001');
    expect(frameForAnimation([], 0, 10, true)).toBeNull();
  });
});

describe('note skins', () => {
  it('names frames per lane and variant', () => {
    expect(skinFrameName(0, 'note')).toBe('purple0');
    expect(skinFrameName(1, 'press')).toBe('blue press');
    expect(skinFrameName(2, 'holdPiece')).toBe('green hold piece');
    expect(skinFrameName(3, 'holdEnd')).toBe('red hold end');
  });

  it('resolves the frames a skin actually provides', () => {
    const skin = createNoteSkin('NOTE_assets', XML, IMAGE);
    expect(skinFrame(skin, 0, 'note')?.name).toBe('purple0');
    expect(skinFrame(skin, 0, 'press')?.name).toBe('purple press');
    expect(skinFrame(skin, 0, 'holdPiece')).toBeNull();
    expect(skinFrame(skin, 1, 'holdPiece')?.name).toBe('blue hold piece');
    expect(skinFrame(skin, 3, 'note')?.name).toBe('red0');

    const coverage = skinCoverage(skin);
    expect(coverage.expected).toBe(16);
    // Four note frames plus three press/hold pieces are defined in the fixture.
    expect(coverage.present).toBe(7);
  });

  it('returns null frames for a missing skin', () => {
    expect(skinFrame(null, 0, 'note')).toBeNull();
  });

  it('finds a Sparrow skin pair in a mod', () => {
    const found = resolveNoteSkin(files(['images/noteSkins/NOTE_assets.png', 'images/noteSkins/NOTE_assets.xml']));
    expect(found).toMatchObject({ name: 'note_assets' });
  });

  it('ignores a skin image with no XML', () => {
    expect(resolveNoteSkin(files(['images/noteSkins/NOTE_assets.png']))).toBeNull();
  });
});

describe('characters', () => {
  const character = {
    animations: [
      { anim: 'idle', name: 'BF idle dance', fps: 24, loop: true, offsets: [0, 0] },
      { anim: 'singLEFT', name: 'BF NOTE LEFT0', fps: 24, loop: false, offsets: [-10, 10] },
      { anim: 'hey', name: 'BF HEY!!', fps: 24, loop: false, offsets: [0, 0] },
    ],
    position: [0, 0],
    camera_position: [0, 20],
    flip_x: false,
    scale: 1,
  };

  it('parses a character definition', () => {
    const def = parseCharacterJson(character);
    expect(def).not.toBeNull();
    expect(def?.animations).toHaveLength(3);
    expect(def?.animations[1]).toMatchObject({ name: 'singLEFT', prefix: 'BF NOTE LEFT0', offsets: [-10, 10] });
    expect(def?.cameraPosition).toEqual([0, 20]);
    expect(def?.flipX).toBe(false);
  });

  it('rejects a character with no animations', () => {
    expect(parseCharacterJson({ animations: [] })).toBeNull();
    expect(parseCharacterJson(null)).toBeNull();
  });

  it('picks animations case-insensitively and falls back to idle', () => {
    const def = parseCharacterJson(character)!;
    expect(pickAnimation(def, 'singleft')?.name).toBe('singLEFT');
    expect(pickAnimation(def, 'singUP')?.name).toBe('idle');
    expect(pickAnimation(def, 'unknown')?.name).toBe('idle');
  });

  it('selects a character frame for the elapsed time', () => {
    const atlas: SparrowAtlas = {
      image: IMAGE,
      frames: parseSparrowXml(`
        <SubTexture name="BF idle dance0000" x="0" y="0" width="10" height="10"/>
        <SubTexture name="BF idle dance0001" x="10" y="0" width="10" height="10"/>
      `),
      imageWidth: 20,
      imageHeight: 10,
    };
    const def = parseCharacterJson(character)!;
    const idle = pickAnimation(def, 'idle')!;
    expect(characterFrame(atlas, idle, 0)?.name).toBe('BF idle dance0000');
    // 24 fps: the second frame starts at ~42 ms.
    expect(characterFrame(atlas, idle, 60)?.name).toBe('BF idle dance0001');
  });

  it('maps lanes to sing animations', () => {
    expect(singAnimationForLane(0)).toBe('singLEFT');
    expect(singAnimationForLane(1)).toBe('singDOWN');
    expect(singAnimationForLane(2)).toBe('singUP');
    expect(singAnimationForLane(3)).toBe('singRIGHT');
  });

  it('resolves character and stage files from a mod', () => {
    const map = files([
      'characters/bf.json',
      'characters/bf.png',
      'characters/bf.xml',
      'images/stage.png',
      'images/stageFront.png',
    ]);

    expect(resolveCharacterAssets(map, 'bf')).toMatchObject({
      jsonPath: 'characters/bf.json',
      imagePath: 'characters/bf.png',
      xmlPath: 'characters/bf.xml',
    });
    expect(resolveCharacterAssets(map, 'missing')).toBeNull();

    expect(resolveStageAssets(map, 'stage')).toMatchObject({
      backgroundPath: 'images/stage.png',
      frontPath: 'images/stageFront.png',
    });
    // A stage name with no art of its own falls back to the mod's generic stage image.
    expect(resolveStageAssets(map, 'other').backgroundPath).toBe('images/stage.png');
  });
});
