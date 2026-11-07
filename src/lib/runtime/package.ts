import { unzipSync } from 'fflate';
import { sha256Hex } from '../hash';
import { checkEntryPath } from '../import/safety';
import {
  RUNTIME_LIMITS,
  RUNTIME_MANIFEST_FILE,
  parseRuntimeManifestJson,
  type RuntimeManifest,
} from './manifest';

/**
 * Opening a runtime package: checksum, archive safety, manifest and entry point.
 *
 * The order matters. The checksum is verified against the *downloaded bytes*
 * before the archive is even opened, so a tampered or truncated package never
 * reaches the unzip stage. Limits are then applied while unpacking, using the
 * same path and size rules as mod imports.
 */

export interface OpenedRuntimePackage {
  manifest: RuntimeManifest;
  files: Map<string, Uint8Array>;
}

export async function openRuntimePackage(
  bytes: Uint8Array,
  expectedSha256: string,
): Promise<OpenedRuntimePackage> {
  const expected = expectedSha256.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expected)) {
    throw new Error('No valid SHA-256 checksum was supplied for this runtime; refusing to open it.');
  }

  const actual = await sha256Hex(bytes);
  if (actual !== expected) {
    throw new Error(
      `Runtime package failed its checksum check (expected ${expected.slice(0, 12)}..., got ${actual.slice(0, 12)}...) and was discarded.`,
    );
  }

  let seen = 0;
  const rejected: string[] = [];
  let unpacked: Record<string, Uint8Array>;

  try {
    unpacked = unzipSync(bytes, {
      filter: (file) => {
        const info = file as { name: string; originalSize?: number; size?: number };
        if (info.name.endsWith('/')) return false;

        seen += 1;
        if (seen > RUNTIME_LIMITS.maxEntries) return false;

        if (checkEntryPath(info.name)) {
          rejected.push(info.name);
          return false;
        }

        const declared = info.originalSize ?? info.size ?? 0;
        if (declared > RUNTIME_LIMITS.maxEntryBytes) {
          rejected.push(info.name);
          return false;
        }

        return true;
      },
    });
  } catch {
    throw new Error('Runtime package is not a readable ZIP archive.');
  }

  const files = new Map<string, Uint8Array>();
  let total = 0;

  for (const [name, data] of Object.entries(unpacked)) {
    if (name.endsWith('/')) continue;
    total += data.length;
    if (total > RUNTIME_LIMITS.maxTotalBytes) {
      throw new Error('Runtime package expands beyond the allowed size and was rejected.');
    }
    files.set(name.replace(/\\/g, '/'), data);
  }

  if (rejected.length > 0) {
    throw new Error(
      `Runtime package contains ${rejected.length} unsafe entr${rejected.length === 1 ? 'y' : 'ies'} and was rejected.`,
    );
  }

  const manifestBytes = files.get(RUNTIME_MANIFEST_FILE);
  if (!manifestBytes) {
    throw new Error(`Runtime package has no ${RUNTIME_MANIFEST_FILE} at its root.`);
  }

  const manifest = parseRuntimeManifestJson(new TextDecoder().decode(manifestBytes));

  const entry = files.get(manifest.entry);
  if (!entry || entry.length === 0) {
    throw new Error(`Runtime package is missing its entry point "${manifest.entry}".`);
  }

  return { manifest, files };
}
