import { describe, expect, it } from 'vitest';
import { FEATURE_ORDER, supportMatrix } from '../src/lib/engines/support';
import { ENGINE_IDS } from '../src/lib/engines/types';
import { parseRuntimeManifest } from '../src/lib/runtime/manifest';

const engineRuntime = (overrides: Record<string, unknown> = {}) =>
  parseRuntimeManifest({
    schemaVersion: 1,
    kind: 'engine',
    id: 'psych-0.7.3-web',
    engine: 'psych',
    version: '0.7.3',
    entry: 'index.html',
    publishedAt: '2026-11-07T10:00:00.000Z',
    license: 'Apache-2.0',
    features: { gameplay: 'supported', lua: 'partial' },
    ...overrides,
  });

describe('runtime kinds', () => {
  it('treats a manifest without a kind as an engine runtime', () => {
    const manifest = parseRuntimeManifest({
      schemaVersion: 1,
      id: 'kade-1.0.0-web',
      engine: 'kade',
      version: '1.0.0',
      entry: 'index.html',
      publishedAt: '2026-11-07T10:00:00.000Z',
      license: 'Apache-2.0',
      features: {},
    });
    expect(manifest.kind).toBe('engine');
    expect(manifest.engine).toBe('kade');
  });

  it('accepts a reference runtime with no engine and no features', () => {
    const manifest = parseRuntimeManifest({
      schemaVersion: 1,
      kind: 'reference',
      id: 'reference-host-selftest',
      version: '1.0.0',
      entry: 'index.html',
      publishedAt: '2026-11-07T00:00:00.000Z',
      license: 'MIT',
      features: {},
    });
    expect(manifest.kind).toBe('reference');
    expect(manifest.engine).toBeNull();
  });

  it('refuses a reference runtime that claims an engine', () => {
    expect(() =>
      parseRuntimeManifest({
        schemaVersion: 1,
        kind: 'reference',
        id: 'reference-host-selftest',
        engine: 'psych',
        version: '1.0.0',
        entry: 'index.html',
        publishedAt: '2026-11-07T00:00:00.000Z',
        license: 'MIT',
        features: {},
      }),
    ).toThrow(/must not claim an engine/);
  });

  it('refuses a reference runtime that declares engine features', () => {
    expect(() =>
      parseRuntimeManifest({
        schemaVersion: 1,
        kind: 'reference',
        id: 'reference-host-selftest',
        version: '1.0.0',
        entry: 'index.html',
        publishedAt: '2026-11-07T00:00:00.000Z',
        license: 'MIT',
        features: { gameplay: 'supported' },
      }),
    ).toThrow(/must not declare engine feature support/);
  });

  it('requires an engine for engine runtimes', () => {
    expect(() => parseRuntimeManifest({ ...engineRuntime(), engine: undefined })).toThrow(/unknown engine/);
  });
});

describe('engine support matrix', () => {
  it('reports every feature as unknown when nothing is published', () => {
    const matrix = supportMatrix([]);
    expect(matrix.map((entry) => entry.engine)).toEqual(ENGINE_IDS);
    for (const entry of matrix) {
      expect(entry.manifest).toBeNull();
      expect(entry.rows).toHaveLength(FEATURE_ORDER.length);
      expect(entry.rows.every((row) => row.support === 'unknown')).toBe(true);
    }
  });

  it('reports declared support and leaves undeclared features unknown', () => {
    const matrix = supportMatrix([engineRuntime()]);
    const psych = matrix.find((entry) => entry.engine === 'psych');
    if (!psych) throw new Error('expected a psych row');

    expect(psych.manifest?.version).toBe('0.7.3');
    expect(psych.rows.find((row) => row.feature === 'gameplay')?.support).toBe('supported');
    expect(psych.rows.find((row) => row.feature === 'lua')?.support).toBe('partial');
    expect(psych.rows.find((row) => row.feature === 'shaders')?.support).toBe('unknown');
  });

  it('uses the newest runtime for an engine', () => {
    const matrix = supportMatrix([
      engineRuntime({ id: 'psych-0.7.3-web', version: '0.7.3', features: { lua: 'unsupported' } }),
      engineRuntime({ id: 'psych-0.7.4-web', version: '0.7.4', features: { lua: 'supported' } }),
    ]);
    const psych = matrix.find((entry) => entry.engine === 'psych');
    if (!psych) throw new Error('expected a psych row');

    expect(psych.manifest?.version).toBe('0.7.4');
    expect(psych.rows.find((row) => row.feature === 'lua')?.support).toBe('supported');
  });

  it('ignores reference runtimes entirely', () => {
    const reference = parseRuntimeManifest({
      schemaVersion: 1,
      kind: 'reference',
      id: 'reference-host-selftest',
      version: '1.0.0',
      entry: 'index.html',
      publishedAt: '2026-11-07T00:00:00.000Z',
      license: 'MIT',
      features: {},
    });

    const matrix = supportMatrix([reference]);
    expect(matrix.every((entry) => entry.manifest === null)).toBe(true);
    expect(matrix.every((entry) => entry.rows.every((row) => row.support === 'unknown'))).toBe(true);
  });
});
