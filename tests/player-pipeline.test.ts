import { describe, expect, it } from 'vitest';
import type { EntryMap } from '../src/lib/import/zip';
import { listSongs, prepareSong } from '../src/lib/player/pipeline';

const encoder = new TextEncoder();

function chart(song: string, sectionNotes: Array<Array<number | string>> = [[1000, 4, 0], [1500, 5, 0]]) {
  return {
    song: {
      song,
      bpm: 120,
      speed: 2,
      notes: [{ sectionNotes, mustHitSection: false, lengthInSteps: 16 }],
    },
  };
}

function modFiles(entries: Record<string, string | Uint8Array>): EntryMap {
  const map: EntryMap = new Map();
  for (const [path, value] of Object.entries(entries)) {
    map.set(path, typeof value === 'string' ? encoder.encode(value) : value);
  }
  return map;
}

const audio = (): Uint8Array => new Uint8Array([79, 103, 103, 83, 0, 2, 0, 0]);

describe('song discovery', () => {
  it('finds charts under data/ and reports their difficulties', () => {
    const files = modFiles({
      'data/bopeebo/bopeebo.json': JSON.stringify(chart('Bopeebo')),
      'data/bopeebo/bopeebo-hard.json': JSON.stringify(chart('Bopeebo')),
    });
    const { songs, problems } = listSongs(files);
    expect(problems).toEqual([]);
    expect(songs.map((song) => song.difficulty)).toEqual(['normal', 'hard']);
    expect(songs[0]?.title).toBe('Bopeebo');
  });

  it('ignores config files and non-chart JSON', () => {
    const files = modFiles({
      'data/config.json': JSON.stringify({ autoUpdate: true }),
      'data/bopeebo/bopeebo.json': JSON.stringify(chart('Bopeebo')),
      'pack.json': JSON.stringify({ name: 'Mod' }),
    });
    const { songs } = listSongs(files);
    expect(songs).toHaveLength(1);
  });

  it('reports an unreadable chart instead of dropping it silently', () => {
    const files = modFiles({
      'data/broken/broken.json': '{not json',
      'data/empty/empty.json': JSON.stringify({ song: { notes: [] } }),
    });
    const { songs, problems } = listSongs(files);
    expect(songs).toHaveLength(0);
    expect(problems).toHaveLength(2);
    expect(problems.join(' ')).toMatch(/not valid JSON/);
    expect(problems.join(' ')).toMatch(/no usable sections/i);
  });
});

describe('song preparation', () => {
  it('resolves charts and audio inside a mod that has a wrapping folder', () => {
    const files = modFiles({
      'MyMod/data/bopeebo/bopeebo.json': JSON.stringify(chart('Bopeebo')),
      'MyMod/songs/bopeebo/Inst.ogg': audio(),
      'MyMod/songs/bopeebo/Voices.ogg': audio(),
    });

    const result = prepareSong(files, 'MyMod/data/bopeebo/bopeebo.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.audio.instrumental).toBe('MyMod/songs/bopeebo/Inst.ogg');
    expect(result.song.audio.voices).toBe('MyMod/songs/bopeebo/Voices.ogg');
    // With no art in the archive the runtime warns rather than failing the song.
    expect(result.song.warnings.join(' ')).toMatch(/No character sprites/);
    expect(result.song.warnings.join(' ')).not.toMatch(/Lua|HScript/);
  });

  it('accepts case differences in audio file names', () => {
    const files = modFiles({
      'data/test/test.json': JSON.stringify(chart('Test')),
      'songs/inst.OGG': audio(),
    });
    const result = prepareSong(files, 'data/test/test.json');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.song.audio.instrumental).toBe('songs/inst.OGG');
  });

  it('explains a missing instrumental with the paths it looked for', () => {
    const files = modFiles({
      'data/test/test.json': JSON.stringify(chart('Test')),
      'README.txt': 'no audio here',
    });
    const result = prepareSong(files, 'data/test/test.json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('missing-audio');
    expect(result.failure.detail).toMatch(/songs\/test\/Inst\.ogg/);
  });

  it('refuses a chart with only opponent notes', () => {
    const files = modFiles({
      'data/test/test.json': JSON.stringify(chart('Test', [[1000, 0, 0]])),
      'songs/inst.ogg': audio(),
    });
    const result = prepareSong(files, 'data/test/test.json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.reason).toBe('no-player-notes');
  });

  it('warns about scripts, custom note types and events that it does not run', () => {
    const files = modFiles({
      'data/test/test.json': JSON.stringify(
        chart('Test', [
          [1000, 4, 0, 'mine'],
          [1500, 5, 250],
        ]),
      ),
      'songs/inst.ogg': audio(),
      'scripts/song.lua': 'function onCreate() end',
      'scripts/stage.hx': 'class Stage {}',
    });
    const withEvents = new Map(files);
    withEvents.set(
      'data/test/test.json',
      encoder.encode(
        JSON.stringify({
          ...chart('Test', [
            [1000, 4, 0, 'mine'],
            [1500, 5, 250],
          ]),
          song: {
            ...chart('Test', [
              [1000, 4, 0, 'mine'],
              [1500, 5, 250],
            ]).song,
            events: [[900, [['Set GF Speed', 2, 1]]]],
          },
        }),
      ),
    );

    const result = prepareSong(withEvents, 'data/test/test.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.warnings.join(' ')).toMatch(/Lua script/);
    expect(result.song.warnings.join(' ')).toMatch(/HScript/);
    expect(result.song.warnings.join(' ')).toMatch(/Custom note types/);
    expect(result.song.warnings.join(' ')).toMatch(/event/);
  });

  it('defaults missing vocals to a warning rather than a failure', () => {
    const files = modFiles({
      'data/test/test.json': JSON.stringify(chart('Test')),
      'songs/test/Inst.ogg': audio(),
    });
    const result = prepareSong(files, 'data/test/test.json');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.song.audio.voices).toBeNull();
    expect(result.song.warnings.join(' ')).toMatch(/vocals/i);
  });
});
