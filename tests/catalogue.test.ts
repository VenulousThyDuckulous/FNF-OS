import { describe, expect, it } from 'vitest';
import {
  RUNTIME_CANDIDATES,
  RUNTIME_CATALOGUE,
  isPublishable,
  publishBlockers,
  type CatalogueRuntime,
} from '../src/lib/runtime/catalogue';

const entry = (overrides: Partial<CatalogueRuntime> = {}): CatalogueRuntime => ({
  id: 'psych-0.7.3-web',
  engine: 'psych',
  version: '0.7.3',
  url: 'https://example.invalid/psych-0.7.3-web.zip',
  sha256: 'a'.repeat(64),
  bytes: 1024,
  publishedAt: '2026-11-07T00:00:00.000Z',
  kind: 'engine-port',
  upstream: 'https://example.invalid/upstream',
  license: 'Apache-2.0',
  licenseNote: 'Reviewed for this build.',
  distribution: 'permitted',
  selfHostable: true,
  hostedOnly: false,
  engineVersions: ['0.7.3'],
  modFormats: ['psych-pack'],
  capabilities: { gameplay: 'supported' },
  testRuns: [
    {
      ranAt: '2026-11-07T00:00:00.000Z',
      modName: 'Example Mod',
      modFormat: 'psych-pack',
      outcome: 'passed',
      level: 4,
      device: 'desktop',
      notes: 'Chart, audio, characters and stage loaded.',
    },
  ],
  ...overrides,
});

describe('runtime catalogue', () => {
  it('stays empty until an entry passes every check', () => {
    expect(RUNTIME_CATALOGUE).toHaveLength(0);
  });

  it('accepts an entry with a reviewed build and a real passed test run', () => {
    const candidate = entry();
    expect(publishBlockers(candidate)).toEqual([]);
    expect(isPublishable(candidate)).toBe(true);
  });

  it('refuses an entry with no test run', () => {
    const blockers = publishBlockers(entry({ testRuns: [] }));
    expect(blockers.join(' ')).toMatch(/No real mod has passed a test run/);
  });

  it('refuses a passed run that assigns no level', () => {
    const blockers = publishBlockers(
      entry({
        testRuns: [
          {
            ranAt: '2026-11-07T00:00:00.000Z',
            modName: 'Example Mod',
            modFormat: 'psych-pack',
            outcome: 'passed',
            level: null,
            device: 'desktop',
            notes: 'Runs, but the level was never measured.',
          },
        ],
      }),
    );
    expect(blockers.join(' ')).toMatch(/no compatibility level exists/);
  });

  it('refuses unreviewed or restricted distribution', () => {
    expect(publishBlockers(entry({ distribution: 'unreviewed' })).join(' ')).toMatch(/not been reviewed/);
    expect(publishBlockers(entry({ distribution: 'restricted' })).join(' ')).toMatch(/restricts redistributing/);
  });

  it('refuses a hosted-only build', () => {
    expect(publishBlockers(entry({ hostedOnly: true })).join(' ')).toMatch(/cannot be self-hosted/);
  });

  it('refuses an entry with no verified mod format', () => {
    expect(publishBlockers(entry({ modFormats: [] })).join(' ')).toMatch(/No mod format/);
  });

  it('refuses a conversion runtime that borrows engine features', () => {
    const blockers = publishBlockers(entry({ kind: 'conversion', engine: null }));
    expect(blockers.join(' ')).toMatch(/own profile/);
  });

  it('refuses an entry with no checksum', () => {
    expect(publishBlockers(entry({ sha256: 'not-a-hash' })).join(' ')).toMatch(/SHA-256/);
  });
});

describe('researched candidates', () => {
  it('records every project that was investigated', () => {
    expect(RUNTIME_CANDIDATES.map((candidate) => candidate.id)).toEqual([
      'psych-html5-star-studios',
      'psych-html5-itch-hosted',
      'h-slice',
      'kade-browser-port',
      'codename-engine',
    ]);
  });

  it('keeps Psych HTML5 as unintegrated: the web build has no mod loading', () => {
    const psych = RUNTIME_CANDIDATES.find((candidate) => candidate.id === 'psych-html5-star-studios');
    expect(psych?.status).toBe('untested');
    expect(psych?.buildStatus).toBe('no-browser-build');
  });

  it('treats H-Slice as a conversion runtime, not Psych or V-Slice support', () => {
    const hslice = RUNTIME_CANDIDATES.find((candidate) => candidate.id === 'h-slice');
    expect(hslice?.kind).toBe('conversion');
    expect(hslice?.summary).toMatch(/not a port/);
    expect(hslice?.missing.join(' ')).toMatch(/not “Psych support”/);
  });

  it('keeps the Kade port unverifiable rather than usable', () => {
    const kade = RUNTIME_CANDIDATES.find((candidate) => candidate.id === 'kade-browser-port');
    expect(kade?.status).toBe('unverifiable');
    expect(kade?.buildStatus).toBe('source-unavailable');
    expect(kade?.distribution).toBe('unreviewed');
  });

  it('keeps Codename blocked on licensing', () => {
    const codename = RUNTIME_CANDIDATES.find((candidate) => candidate.id === 'codename-engine');
    expect(codename?.status).toBe('blocked-licence');
    expect(codename?.distribution).toBe('restricted');
  });

  it('never treats a researched project as an available runtime', () => {
    for (const candidate of RUNTIME_CANDIDATES) {
      expect(candidate.missing.length).toBeGreaterThan(0);
      expect(RUNTIME_CATALOGUE.some((entry) => entry.id === candidate.id)).toBe(false);
    }
    expect(
      RUNTIME_CANDIDATES.filter((candidate) => candidate.status === 'candidate').map((candidate) => candidate.id),
    ).toEqual(['h-slice']);
  });
});
