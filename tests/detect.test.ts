import { describe, expect, it } from 'vitest';
import { detectEngine, normalizePath, type DetectionInput } from '../src/lib/engines/detect';

const psych: DetectionInput = {
  root: 'my-psych-mod',
  paths: ['pack.json', 'data/bopeebo/bopeebo.json', 'scripts/bopeebo.lua', 'songs/bopeebo/Inst.ogg'],
  metadata: { pack: { name: 'My Mod', description: 'A Psych mod', restartSong: true } },
};

const vslice: DetectionInput = {
  root: 'vslice-mod',
  paths: ['_polymod_meta.json', 'mod.json', 'data/songs/bopeebo/chart.json', 'songs/bopeebo/Inst.ogg'],
  metadata: { mod: { api_version: '0.5.0' }, polymod: {} },
};

const codename: DetectionInput = {
  root: 'codename-mod',
  paths: ['mod.json', 'scripts/main.hx', 'data/charts/song.json', 'assets/images/icon.png'],
  metadata: { mod: { name: 'Thing', codename: '0.4' } },
};

const kade: DetectionInput = {
  root: 'kade-mod',
  paths: ['assetsMods/images/menuBG.png', 'ModCore/data/song.json'],
};

describe('detectEngine', () => {
  it('identifies a Psych mod from pack.json and Lua scripts', () => {
    const result = detectEngine(psych);
    expect(result.engine).toBe('psych');
    expect(result.confidence).toBe('high');
    expect(result.evidence).toContain('pack.json present');
  });

  it('identifies a V-Slice mod from _polymod_meta.json', () => {
    const result = detectEngine(vslice);
    expect(result.engine).toBe('vslice');
    expect(result.confidence).toBe('high');
  });

  it('identifies a Codename mod from its mod.json key and Haxe scripts', () => {
    const result = detectEngine(codename);
    expect(result.engine).toBe('codename');
  });

  it('identifies a Kade mod from assetsMods/', () => {
    const result = detectEngine(kade);
    expect(result.engine).toBe('kade');
  });

  it('returns no engine for unrelated files instead of guessing', () => {
    const result = detectEngine({ root: 'random', paths: ['notes.txt', 'photo.jpg'] });
    expect(result.engine).toBeNull();
    expect(result.confidence).toBe('none');
  });

  it('reports runners-up so the UI can offer an override', () => {
    const result = detectEngine({
      root: 'ambiguous',
      paths: ['pack.json', 'mod.json'],
      metadata: { pack: { name: 'x' }, mod: { api_version: '1' } },
    });
    expect(result.engine).toBe('vslice');
    expect(result.alternatives.length).toBeGreaterThan(0);
  });
});

describe('normalizePath', () => {
  it('normalises separators and case', () => {
    const windowsPath = ['Mods', 'Cool', 'Pack.JSON'].join(String.fromCharCode(92));
    expect(normalizePath(windowsPath)).toBe('mods/cool/pack.json');
  });
});
