import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readZip, writeZip } from '../src/lib/import/zip';
import { DEFAULT_LIMITS } from '../src/lib/import/safety';

describe('readZip', () => {
  it('reads a normal archive', async () => {
    const archive = zipSync({
      'mods/cool/pack.json': strToU8('{"name":"Cool"}'),
      'mods/cool/data/song.json': strToU8('{}'),
    });

    const result = await readZip(archive);
    expect(result.files.size).toBe(2);
    expect(new TextDecoder().decode(result.files.get('mods/cool/pack.json')!)).toContain('Cool');
    expect(result.issues).toHaveLength(0);
  });

  it('refuses entries that escape the destination', async () => {
    const archive = zipSync({ '../evil.txt': strToU8('nope') });
    const result = await readZip(archive);

    expect(result.files.has('../evil.txt')).toBe(false);
    expect(result.files.size).toBe(0);
    expect(result.issues.some((issue) => issue.code === 'path-traversal')).toBe(true);
  });

  it('skips entries above the per-file limit', async () => {
    const archive = zipSync({ 'big.bin': new Uint8Array(2048) });
    const result = await readZip(archive, { limits: { ...DEFAULT_LIMITS, maxEntryBytes: 1024 } });

    expect(result.files.has('big.bin')).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'entry-too-large')).toBe(true);
  });

  it('aborts an archive that expands past the total limit', async () => {
    const archive = zipSync({
      'a.bin': new Uint8Array(4096),
      'b.bin': new Uint8Array(4096),
    });

    await expect(
      readZip(archive, { limits: { ...DEFAULT_LIMITS, maxTotalBytes: 5000 } }),
    ).rejects.toThrow(/expands beyond/i);
  });
});

describe('writeZip', () => {
  it('round-trips an entry map', async () => {
    const files = new Map<string, Uint8Array>([
      ['pack.json', strToU8('{"name":"Roundtrip"}')],
      ['data/song.json', strToU8('{"song":"test"}')],
    ]);

    const zip = writeZip(files);
    const result = await readZip(zip);

    expect([...result.files.keys()].sort()).toEqual(['data/song.json', 'pack.json']);
  });
});
