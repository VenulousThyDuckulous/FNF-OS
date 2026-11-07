import { createHash } from 'node:crypto';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_MANIFEST_FILE,
  isSafeRuntimePath,
  parseRuntimeManifest,
  parseRuntimeManifestJson,
} from '../src/lib/runtime/manifest';
import { openRuntimePackage } from '../src/lib/runtime/package';
import { PROTOCOL_VERSION, isRuntimeMessage } from '../src/lib/runtime/protocol';
import { createModVfs, handleFileRequest, normaliseVfsPath } from '../src/lib/runtime/vfs';

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const UP = '..';
const escapePath = [UP, 'outside.txt'].join('/');
const traversalPath = [UP, UP, 'secrets.txt'].join('/');

const manifest = {
  schemaVersion: 1,
  id: 'psych-0.7.3-web',
  engine: 'psych',
  version: '0.7.3',
  entry: 'index.html',
  publishedAt: '2026-11-07T10:00:00.000Z',
  license: 'Apache-2.0',
  features: { gameplay: 'supported', lua: 'unsupported' },
};

function buildPackage(overrides: Record<string, unknown> = {}): Uint8Array {
  return zipSync({
    [RUNTIME_MANIFEST_FILE]: strToU8(JSON.stringify({ ...manifest, ...overrides })),
    'index.html': strToU8('<!doctype html><p>runtime</p>'),
    'assets/app.js': strToU8('console.log(1)'),
  });
}

describe('parseRuntimeManifest', () => {
  it('accepts a complete manifest', () => {
    const parsed = parseRuntimeManifest(manifest);
    expect(parsed.id).toBe('psych-0.7.3-web');
    expect(parsed.features.lua).toBe('unsupported');
  });

  it('refuses a schema it does not understand', () => {
    expect(() => parseRuntimeManifest({ ...manifest, schemaVersion: 2 })).toThrow(/schema/);
  });

  it('refuses an unknown engine instead of guessing', () => {
    expect(() => parseRuntimeManifest({ ...manifest, engine: 'unity' })).toThrow(/unknown engine/);
  });

  it('refuses an entry point that escapes the package', () => {
    expect(() => parseRuntimeManifest({ ...manifest, entry: escapePath })).toThrow(/entry/);
  });

  it('refuses an entry point that is not HTML', () => {
    expect(() => parseRuntimeManifest({ ...manifest, entry: 'index.js' })).toThrow(/entry/);
  });

  it('refuses unknown feature keys and support values', () => {
    expect(() => parseRuntimeManifest({ ...manifest, features: { teleport: 'supported' } })).toThrow(
      /Unknown runtime feature/,
    );
    expect(() => parseRuntimeManifest({ ...manifest, features: { gameplay: 'mostly' } })).toThrow(
      /must be one of/,
    );
  });

  it('refuses a missing licence or an unparseable date', () => {
    expect(() => parseRuntimeManifest({ ...manifest, license: ' ' })).toThrow(/licence/);
    expect(() => parseRuntimeManifest({ ...manifest, publishedAt: 'someday' })).toThrow(/publishedAt/);
  });

  it('rejects invalid JSON with a clear message', () => {
    expect(() => parseRuntimeManifestJson('{ nope')).toThrow(/not valid JSON/);
  });
});

describe('isSafeRuntimePath', () => {
  it('allows nested relative paths', () => {
    expect(isSafeRuntimePath('assets/sprites/bf.png')).toBe(true);
  });

  it('rejects traversal, absolute paths, drive letters and control characters', () => {
    expect(isSafeRuntimePath(['a', UP, UP, 'b'].join('/'))).toBe(false);
    expect(isSafeRuntimePath('/root/file.txt')).toBe(false);
    expect(isSafeRuntimePath('C:/drive/file.dll')).toBe(false);
    expect(isSafeRuntimePath('bad' + String.fromCharCode(0) + 'name')).toBe(false);
  });
});

describe('openRuntimePackage', () => {
  it('opens a verified package and exposes its files', async () => {
    const bytes = buildPackage();
    const opened = await openRuntimePackage(bytes, sha256(bytes));

    expect(opened.manifest.id).toBe('psych-0.7.3-web');
    expect(opened.files.has('index.html')).toBe(true);
    expect(opened.files.has('assets/app.js')).toBe(true);
  });

  it('refuses a package whose bytes do not match the checksum', async () => {
    const bytes = buildPackage();
    const tampered = new Uint8Array(bytes);
    tampered[tampered.length - 1] = tampered[tampered.length - 1] ^ 0xff;

    await expect(openRuntimePackage(tampered, sha256(bytes))).rejects.toThrow(/checksum/);
  });

  it('refuses a package with no manifest', async () => {
    const bytes = zipSync({ 'index.html': strToU8('<p>no manifest</p>') });
    await expect(openRuntimePackage(bytes, sha256(bytes))).rejects.toThrow(/runtime\.json/);
  });

  it('refuses a package with unsafe entries', async () => {
    const bytes = zipSync({
      [RUNTIME_MANIFEST_FILE]: strToU8(JSON.stringify(manifest)),
      'index.html': strToU8('<p>runtime</p>'),
      [escapePath]: strToU8('nope'),
    });
    await expect(openRuntimePackage(bytes, sha256(bytes))).rejects.toThrow(/unsafe/);
  });

  it('refuses a package missing its declared entry point', async () => {
    const bytes = buildPackage({ entry: 'missing.html' });
    await expect(openRuntimePackage(bytes, sha256(bytes))).rejects.toThrow(/entry point/);
  });
});

describe('isRuntimeMessage', () => {
  it('accepts known messages', () => {
    expect(isRuntimeMessage({ type: 'runtime:ready', protocol: PROTOCOL_VERSION })).toBe(true);
    expect(isRuntimeMessage({ type: 'runtime:pong', nonce: 3 })).toBe(true);
    expect(isRuntimeMessage({ type: 'runtime:log', level: 'warn', message: 'x' })).toBe(true);
    expect(isRuntimeMessage({ type: 'runtime:exit', reason: 'closed' })).toBe(true);
    expect(isRuntimeMessage({ type: 'runtime:file-request', requestId: 1, path: 'a.json' })).toBe(true);
    expect(isRuntimeMessage({ type: 'runtime:file-request', requestId: 2, path: 'a.ogg', offset: 128 })).toBe(
      true,
    );
  });

  it('rejects unknown types, coercible numbers and malformed requests', () => {
    expect(isRuntimeMessage({ type: 'runtime:teleport' })).toBe(false);
    expect(isRuntimeMessage({ type: 'runtime:ready', protocol: '1' })).toBe(false);
    expect(isRuntimeMessage({ type: 'runtime:log', level: 'debug', message: 'x' })).toBe(false);
    expect(isRuntimeMessage({ type: 'runtime:file-request', requestId: 1 })).toBe(false);
    expect(isRuntimeMessage({ type: 'runtime:file-request', requestId: 1, path: '', offset: 0 })).toBe(false);
    expect(isRuntimeMessage({ type: 'runtime:file-request', requestId: 1, path: 'a.json', offset: -1 })).toBe(
      false,
    );
    expect(isRuntimeMessage({ type: 'runtime:file-result', ok: true, data: new ArrayBuffer(4) })).toBe(false);
    expect(isRuntimeMessage(null)).toBe(false);
    expect(isRuntimeMessage('runtime:ready')).toBe(false);
  });
});

describe('mod virtual filesystem', () => {
  const files = new Map<string, Uint8Array>([
    ['pack.json', strToU8('{}')],
    ['charts/bopeebo.json', strToU8('[]')],
    ['songs/bopeebo/Inst.ogg', new Uint8Array([1, 2, 3, 4])],
  ]);

  it('lists only paths that exist in the mod', () => {
    const vfs = createModVfs(files);
    expect(vfs.paths()).toContain('charts/bopeebo.json');
    expect(vfs.list('songs')).toEqual(['songs/bopeebo/Inst.ogg']);
    expect(vfs.exists('songs/bopeebo/Inst.ogg')).toBe(true);
  });

  it('normalises separators and refuses traversal', () => {
    expect(normaliseVfsPath('charts\\bopeebo.json')).toBe('charts/bopeebo.json');
    expect(normaliseVfsPath(traversalPath)).toBeNull();
  });

  it('answers a file request with the whole file when it fits', () => {
    const vfs = createModVfs(files);
    const result = handleFileRequest(vfs, 'charts/bopeebo.json', 7);

    expect(result.type).toBe('runtime:file-result');
    if (result.type !== 'runtime:file-result' || !result.ok) throw new Error('expected an ok file result');
    expect(result.total).toBe(2);
    expect(result.done).toBe(true);
    expect(new Uint8Array(result.data)).toEqual(strToU8('[]'));
  });

  it('supports chunk offsets so large files can be streamed', () => {
    const vfs = createModVfs(files);
    const result = handleFileRequest(vfs, 'songs/bopeebo/Inst.ogg', 8, 2);

    if (result.type !== 'runtime:file-result' || !result.ok) throw new Error('expected an ok file result');
    expect(new Uint8Array(result.data)).toEqual(new Uint8Array([3, 4]));
    expect(result.offset).toBe(2);
    expect(result.done).toBe(true);
  });

  it('reports a missing file instead of inventing one', () => {
    const vfs = createModVfs(files);
    const result = handleFileRequest(vfs, 'charts/missing.json', 9);

    if (result.type !== 'runtime:file-result' || result.ok) throw new Error('expected a failed file result');
    expect(result.error).toMatch(/not found/i);
  });

  it('refuses a traversal request', () => {
    const vfs = createModVfs(files);
    const result = handleFileRequest(vfs, traversalPath, 10);

    if (result.type !== 'runtime:file-result' || result.ok) throw new Error('expected a failed file result');
    expect(result.error).toMatch(/not valid/i);
  });
});
