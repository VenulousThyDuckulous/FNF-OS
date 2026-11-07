import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMITS,
  checkEntryPath,
  formatBytes,
  sanitizePath,
  scanEntries,
} from '../src/lib/import/safety';

const BACKSLASH = String.fromCharCode(92);
const NUL = String.fromCharCode(0);

describe('checkEntryPath', () => {
  it('accepts ordinary relative paths', () => {
    expect(checkEntryPath('mods/cool/data/song.json')).toBeNull();
    expect(checkEntryPath('pack.json')).toBeNull();
  });

  it('rejects path traversal', () => {
    const issue = checkEntryPath(['..', '..', 'secret.txt'].join('/'));
    expect(issue?.code).toBe('path-traversal');
    expect(issue?.severity).toBe('error');
  });

  it('rejects traversal hidden behind backslashes', () => {
    expect(checkEntryPath(['..', '..', 'x.dll'].join(BACKSLASH))?.code).toBe('path-traversal');
  });

  it('rejects absolute paths and drive letters', () => {
    expect(checkEntryPath('/root/file.txt')?.code).toBe('absolute-path');
    expect(checkEntryPath('C:/drive/file.dll')?.code).toBe('absolute-path');
  });

  it('rejects control characters', () => {
    expect(checkEntryPath('bad' + NUL + 'name')?.code).toBe('control-characters');
  });

  it('rejects absurdly long paths', () => {
    expect(checkEntryPath('a'.repeat(DEFAULT_LIMITS.maxPathLength + 1))?.code).toBe('path-too-long');
  });
});

describe('sanitizePath', () => {
  it('normalises separators and strips leading noise', () => {
    expect(sanitizePath('./mods//cool//x.json')).toBe('mods/cool/x.json');
    expect(sanitizePath('/leading/slash')).toBe('leading/slash');
  });
});

describe('scanEntries', () => {
  it('accepts a small archive', () => {
    const result = scanEntries([{ name: 'a.txt', size: 10, compressedSize: 10 }]);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('flags too many entries', () => {
    const entries = Array.from({ length: 3 }, (_, i) => ({
      name: 'f' + i + '.txt',
      size: 1,
      compressedSize: 1,
    }));
    const result = scanEntries(entries, { ...DEFAULT_LIMITS, maxEntries: 2 });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'too-many-entries')).toBe(true);
  });

  it('flags a decompression bomb by ratio', () => {
    const result = scanEntries(
      [{ name: 'bomb.bin', size: 900 * 1024 * 1024, compressedSize: 1024 }],
      DEFAULT_LIMITS,
    );
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'suspicious-ratio')).toBe(true);
  });

  it('flags a single oversized entry', () => {
    const result = scanEntries([
      { name: 'huge.bin', size: 900 * 1024 * 1024, compressedSize: 900 * 1024 * 1024 },
    ]);
    expect(result.issues.some((issue) => issue.code === 'entry-too-large')).toBe(true);
  });
});

describe('formatBytes', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
