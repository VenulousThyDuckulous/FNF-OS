import { describe, expect, it } from 'vitest';
import { analyzeMod, canLaunch, detectedFeatureCount } from '../src/lib/compat/analyze';

const psychPaths = [
  'pack.json',
  'data/song/song.json',
  'scripts/song.lua',
  'songs/song/Inst.ogg',
  'characters/bf.xml',
];

describe('analyzeMod', () => {
  it('never assigns a compatibility level from static analysis', () => {
    const report = analyzeMod({ engine: 'psych', engineVersion: '0.7.3', paths: psychPaths });
    expect(report.level).toBeNull();
    expect(report.verified).toBe(false);
    expect(report.levelReason).toMatch(/no .* runtime has been published/i);
    expect(canLaunch(report)).toBe(false);
  });

  it('reports the features a mod actually depends on', () => {
    const report = analyzeMod({ engine: 'psych', engineVersion: null, paths: psychPaths });
    const ids = report.findings.filter((f) => f.detected).map((f) => f.id);
    expect(ids).toContain('lua');
    expect(ids).toContain('charts');
    expect(ids).toContain('audio');
    expect(detectedFeatureCount(report)).toBeGreaterThanOrEqual(3);
  });

  it('blocks archives containing native executables', () => {
    const report = analyzeMod({ engine: 'psych', engineVersion: null, paths: [...psychPaths, 'game.exe'] });
    expect(report.blockers.join(' ')).toMatch(/never executes/i);
    expect(canLaunch(report)).toBe(false);
  });

  it('blocks unknown engines with an actionable message', () => {
    const report = analyzeMod({ engine: null, engineVersion: null, paths: ['data/x.json'] });
    expect(report.blockers.join(' ')).toMatch(/could not be identified/i);
  });

  it('warns about video cutscenes on Psych', () => {
    const report = analyzeMod({
      engine: 'psych',
      engineVersion: null,
      paths: [...psychPaths, 'videos/intro.mp4'],
    });
    expect(report.warnings.join(' ')).toMatch(/hxvlc|video/i);
  });

  it('warns when a mod has no chart', () => {
    const report = analyzeMod({
      engine: 'psych',
      engineVersion: null,
      paths: ['pack.json', 'songs/x/Inst.ogg'],
    });
    expect(report.warnings.join(' ')).toMatch(/no chart/i);
  });
});
