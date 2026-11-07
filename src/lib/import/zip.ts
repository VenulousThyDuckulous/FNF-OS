import { Unzip, UnzipInflate, zipSync } from 'fflate';
import {
  DEFAULT_LIMITS,
  checkEntryPath,
  formatBytes,
  sanitizePath,
  type SafetyIssue,
  type SafetyLimits,
} from './safety';

/**
 * ZIP reading and writing.
 *
 * Reads are streamed through fflate's Unzip so that limits are enforced *while*
 * decompressing: a 2 KB bomb that would expand to 4 GB is stopped at the cap
 * instead of being allocated first.
 */

export type EntryMap = Map<string, Uint8Array>;

export interface ReadZipResult {
  files: EntryMap;
  directories: string[];
  issues: SafetyIssue[];
  totals: { entries: number; bytes: number; compressedBytes: number };
  /** Non-fatal notes, e.g. skipped unsafe entries. */
  notes: string[];
}

export interface ReadZipOptions {
  limits?: SafetyLimits;
  onProgress?: (processed: number, total: number) => void;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

function dedupeIssues(list: SafetyIssue[]): SafetyIssue[] {
  const seen = new Set<string>();
  const output: SafetyIssue[] = [];
  for (const issue of list) {
    const key = `${issue.code}:${issue.path ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(issue);
  }
  return output;
}

export async function readZip(data: Uint8Array, options: ReadZipOptions = {}): Promise<ReadZipResult> {
  const limits = options.limits ?? DEFAULT_LIMITS;
  const files: EntryMap = new Map();
  const directories: string[] = [];
  const issues: SafetyIssue[] = [];
  const notes: string[] = [];
  const declared: Array<{ name: string; size: number }> = [];

  let total = 0;
  let fatal: string | null = null;
  let entryCount = 0;

  return new Promise<ReadZipResult>((resolve, reject) => {
    const unzip = new Unzip((file) => {
      entryCount += 1;

      if (entryCount > limits.maxEntries) {
        fatal = `Archive has more than ${limits.maxEntries.toLocaleString()} entries.`;
        return;
      }

      const rawName = file.name;
      const path = sanitizePath(rawName);
      const pathIssue = checkEntryPath(rawName, limits);

      declared.push({ name: rawName, size: file.originalSize ?? 0 });

      if (pathIssue) {
        issues.push(pathIssue);
        // Consume and discard so the stream stays in sync, but never store it.
        file.ondata = () => undefined;
        file.start();
        return;
      }

      if ((file.originalSize ?? 0) > limits.maxEntryBytes) {
        issues.push({
          code: 'entry-too-large',
          message: `Skipped a file larger than the ${formatBytes(limits.maxEntryBytes)} per-file limit.`,
          path: rawName,
          severity: 'warning',
        });
        file.ondata = () => undefined;
        file.start();
        return;
      }

      // Directory entries end with "/" and carry no data.
      if (path.endsWith('/')) {
        directories.push(path.replace(/\/+$/, ''));
        file.ondata = () => undefined;
        file.start();
        return;
      }

      const chunks: Uint8Array[] = [];
      let size = 0;

      file.ondata = (err, chunk, final) => {
        if (err) {
          fatal = `Could not decompress "${rawName}": ${err.message}`;
          return;
        }
        if (fatal) return;

        if (chunk) {
          size += chunk.length;
          total += chunk.length;

          if (total > limits.maxTotalBytes) {
            fatal = `Archive expands beyond the ${formatBytes(limits.maxTotalBytes)} limit.`;
            return;
          }
          chunks.push(chunk);
        }

        if (final) {
          if (size > limits.maxEntryBytes) {
            notes.push(`Skipped oversized file "${rawName}".`);
            return;
          }
          files.set(path, concat(chunks, size));
          if (files.size % 200 === 0 && options.onProgress) {
            options.onProgress(total, declared.reduce((sum, d) => sum + d.size, 0));
          }
        }
      };

      file.start();
    });

    unzip.register(UnzipInflate);

    try {
      unzip.push(data, true);
    } catch (error) {
      reject(new ZipError(error instanceof Error ? error.message : 'Archive could not be read.'));
      return;
    }

    if (fatal) {
      reject(new ZipError(fatal));
      return;
    }

    // Archive-level bomb heuristic. `data.length` is the compressed archive size,
    // which is exactly the ratio a decompression bomb distorts.
    if (
      total > limits.ratioCheckThresholdBytes &&
      data.length > 0 &&
      total / data.length > limits.maxCompressionRatio
    ) {
      issues.push({
        code: 'suspicious-ratio',
        message: 'Archive expands far beyond its compressed size, which suggests a decompression bomb.',
        severity: 'error',
      });
    }

    resolve({
      files,
      directories,
      issues: dedupeIssues(issues),
      totals: { entries: declared.length, bytes: total, compressedBytes: data.length },
      notes,
    });
  });
}

function concat(chunks: Uint8Array[], size: number): Uint8Array {
  const output = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

/** Build a ZIP from an entry map. Used by "Export as ZIP". */
export function writeZip(files: EntryMap): Uint8Array {
  const plain: Record<string, Uint8Array> = {};
  for (const [path, bytes] of files) {
    plain[path] = bytes;
  }
  return zipSync(plain, { level: 6 });
}

export function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

export function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const index = base.lastIndexOf('.');
  return index === -1 ? '' : base.slice(index + 1).toLowerCase();
}
