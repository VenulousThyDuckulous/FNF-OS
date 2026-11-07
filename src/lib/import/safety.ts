/**
 * Import safety.
 *
 * Everything here runs before a single byte is written to storage. The rules
 * exist because a ZIP is attacker-controlled input: entry names are arbitrary
 * strings that a naive extractor would happily treat as paths.
 */

export interface SafetyLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  maxPathLength: number;
  /** Uncompressed / compressed ratio above which an archive is suspicious. */
  maxCompressionRatio: number;
  /** Ratio checks only apply above this size, to avoid flagging tiny text files. */
  ratioCheckThresholdBytes: number;
}

export const DEFAULT_LIMITS: SafetyLimits = {
  maxEntries: 20_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxPathLength: 512,
  maxCompressionRatio: 400,
  ratioCheckThresholdBytes: 100 * 1024 * 1024,
};

export type IssueSeverity = 'error' | 'warning';

export interface SafetyIssue {
  code: string;
  message: string;
  path?: string;
  severity: IssueSeverity;
}

/**
 * Normalise an archive entry name into a relative POSIX path.
 * Backslashes are separators (Windows-created archives), leading "./" is noise,
 * repeated separators collapse.
 */
export function sanitizePath(name: string): string {
  return name
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '');
}

/**
 * Validate an entry path. Returns null when the path is safe.
 *
 * Rejected: empty names, absolute paths, drive letters, any `..` segment,
 * control characters, and over-long paths. These are the classic zip-slip and
 * misleading-name vectors.
 */
export function checkEntryPath(rawName: string, limits: SafetyLimits = DEFAULT_LIMITS): SafetyIssue | null {
  if (!rawName || rawName.trim().length === 0) {
    return { code: 'empty-name', message: 'Archive contains an entry with no name.', severity: 'error' };
  }
  if (/[\u0000-\u001f]/.test(rawName)) {
    return {
      code: 'control-characters',
      message: 'Entry name contains control characters.',
      path: rawName.slice(0, 120),
      severity: 'error',
    };
  }
  if (rawName.length > limits.maxPathLength) {
    return {
      code: 'path-too-long',
      message: `Entry path exceeds ${limits.maxPathLength} characters.`,
      path: rawName.slice(0, 120),
      severity: 'error',
    };
  }

  const name = rawName.replace(/\\/g, '/');

  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) {
    return {
      code: 'absolute-path',
      message: 'Entry uses an absolute path or drive letter.',
      path: rawName,
      severity: 'error',
    };
  }

  const segments = name.split('/');
  if (segments.some((segment) => segment === '..')) {
    return {
      code: 'path-traversal',
      message: 'Entry attempts to escape the destination directory ("..").',
      path: rawName,
      severity: 'error',
    };
  }

  return null;
}

export interface EntryInfo {
  name: string;
  size: number;
  compressedSize: number;
}

export interface ScanResult {
  ok: boolean;
  issues: SafetyIssue[];
  totals: { entries: number; bytes: number; compressedBytes: number };
}

/** Archive-level checks: entry count, declared sizes, compression ratio. */
export function scanEntries(entries: EntryInfo[], limits: SafetyLimits = DEFAULT_LIMITS): ScanResult {
  const issues: SafetyIssue[] = [];
  let bytes = 0;
  let compressedBytes = 0;

  for (const entry of entries) {
    const pathIssue = checkEntryPath(entry.name, limits);
    if (pathIssue) issues.push(pathIssue);

    if (entry.size > limits.maxEntryBytes) {
      issues.push({
        code: 'entry-too-large',
        message: `A single file is larger than the ${formatBytes(limits.maxEntryBytes)} per-file limit.`,
        path: entry.name,
        severity: 'error',
      });
    }

    bytes += entry.size;
    compressedBytes += entry.compressedSize;

    if (bytes > limits.maxTotalBytes) {
      issues.push({
        code: 'archive-too-large',
        message: `Archive expands beyond the ${formatBytes(limits.maxTotalBytes)} limit.`,
        severity: 'error',
      });
      break;
    }
  }

  if (entries.length > limits.maxEntries) {
    issues.push({
      code: 'too-many-entries',
      message: `Archive has more than ${limits.maxEntries.toLocaleString()} entries.`,
      severity: 'error',
    });
  }

  if (
    bytes > limits.ratioCheckThresholdBytes &&
    compressedBytes > 0 &&
    bytes / compressedBytes > limits.maxCompressionRatio
  ) {
    issues.push({
      code: 'suspicious-ratio',
      message: 'Archive expands far beyond its compressed size, which suggests a decompression bomb.',
      severity: 'error',
    });
  }

  return {
    ok: !issues.some((i) => i.severity === 'error'),
    issues,
    totals: { entries: entries.length, bytes, compressedBytes },
  };
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  const rounded = value >= 10 || index === 0 ? Math.round(value) : Number(value.toFixed(1));
  return `${rounded} ${units[index]}`;
}
