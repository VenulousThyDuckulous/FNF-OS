import type { EngineId } from '../engines/types';
import { sha256Hex } from '../hash';
import type { RuntimeManifest } from './manifest';
import { openRuntimePackage, type OpenedRuntimePackage } from './package';

/**
 * Engine runtime manager.
 *
 * Runtimes are separate downloadable packages, cached in Cache Storage, pinned
 * per mod, integrity-checked with SHA-256 and never silently swapped under a
 * mod that already uses them.
 *
 * The catalogue is intentionally empty. No browser runtime has been built, and
 * publishing a placeholder package would be a lie the UI could not back up.
 * See docs/ENGINES.md for what has to exist before an entry can be added.
 */

export interface RuntimePackage {
  id: string;
  /** Null for the reference runtime, which is not an engine build. */
  engine: EngineId | null;
  /** Runtime version, pinned by mods. */
  version: string;
  /** Absolute URL, e.g. a GitHub Release asset. */
  url: string;
  /** Lowercase hex SHA-256 of the package. Required: installs are refused without it. */
  sha256: string;
  bytes: number;
  publishedAt: string;
  notes?: string;
}

export const RUNTIME_CATALOG: RuntimePackage[] = [];

export const RUNTIME_CACHE = 'fnf-os-runtimes-v1';

export interface InstalledRuntime {
  id: string;
  installedAt: string;
  bytes: number;
  /** Manifest captured at install time, so the shell can describe it offline. */
  manifest: RuntimeManifest | null;
}

const INSTALLED_KEY = 'fnf-os.installed-runtimes';

export function runtimesForEngine(engine: EngineId): RuntimePackage[] {
  return RUNTIME_CATALOG.filter((pkg) => pkg.engine === engine).sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  );
}

export function findRuntime(id: string): RuntimePackage | null {
  return RUNTIME_CATALOG.find((pkg) => pkg.id === id) ?? null;
}

export function resolveRuntime(engine: EngineId, pinnedVersion: string | null): RuntimePackage | null {
  const available = runtimesForEngine(engine);
  if (pinnedVersion) {
    const pinned = available.find((pkg) => pkg.version === pinnedVersion);
    if (pinned) return pinned;
  }
  return available[0] ?? null;
}

export function installedRuntimes(): Record<string, InstalledRuntime> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '{}') as Record<
      string,
      Partial<InstalledRuntime>
    >;
    const normalised: Record<string, InstalledRuntime> = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry.id !== 'string') continue;
      normalised[id] = {
        id: entry.id,
        installedAt: typeof entry.installedAt === 'string' ? entry.installedAt : new Date(0).toISOString(),
        bytes: typeof entry.bytes === 'number' ? entry.bytes : 0,
        manifest: entry.manifest ?? null,
      };
    }
    return normalised;
  } catch {
    return {};
  }
}

function saveInstalled(map: Record<string, InstalledRuntime>): void {
  localStorage.setItem(INSTALLED_KEY, JSON.stringify(map));
}

export function isRuntimeInstalled(id: string): boolean {
  return Boolean(installedRuntimes()[id]);
}

export async function verifyRuntime(bytes: Uint8Array, expectedSha256: string): Promise<boolean> {
  const actual = await sha256Hex(bytes);
  return actual === expectedSha256.toLowerCase();
}

function cacheKey(pkg: RuntimePackage): Request {
  return new Request(pkg.url);
}

/**
 * Download, verify, inspect and cache a runtime.
 *
 * Nothing is stored unless the checksum matches the catalogue entry and the
 * package's manifest agrees with the entry about id, engine and version.
 */
export async function installRuntime(
  pkg: RuntimePackage,
  onProgress?: (received: number, total: number) => void,
): Promise<void> {
  if (!pkg.sha256 || !/^[a-f0-9]{64}$/i.test(pkg.sha256)) {
    throw new Error('Runtime package has no valid SHA-256 checksum; refusing to install.');
  }

  const response = await fetch(pkg.url, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error(`Runtime download failed (HTTP ${response.status}).`);
  if (!response.body) throw new Error('Runtime download returned no data.');

  const total = Number(response.headers.get('content-length') ?? pkg.bytes ?? 0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onProgress?.(received, total);
    }
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  await installRuntimeBytes(pkg, bytes);
}

/**
 * Install a runtime from bytes already in memory (used by the lab self-test).
 *
 * Same guarantees as {@link installRuntime}: nothing is cached unless the
 * checksum matches and the manifest agrees with the catalogue entry.
 */
export async function installRuntimeBytes(
  pkg: RuntimePackage,
  bytes: Uint8Array,
): Promise<RuntimeManifest> {
  if (!pkg.sha256 || !/^[a-f0-9]{64}$/i.test(pkg.sha256)) {
    throw new Error('Runtime package has no valid SHA-256 checksum; refusing to install.');
  }

  const opened = await openRuntimePackage(bytes, pkg.sha256);

  if (opened.manifest.id !== pkg.id) {
    throw new Error(
      `Runtime package identifies itself as "${opened.manifest.id}" but the catalogue entry is "${pkg.id}".`,
    );
  }
  if (opened.manifest.engine !== pkg.engine) {
    throw new Error('Runtime package was built for a different engine than the catalogue entry claims.');
  }
  if (opened.manifest.version !== pkg.version) {
    throw new Error('Runtime package version does not match the catalogue entry.');
  }

  // Copy into a fresh ArrayBuffer: `Response` does not accept a possibly
  // shared-backed view, and the cached copy must not alias the caller's bytes.
  const body = new Uint8Array(bytes).buffer;
  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(
    cacheKey(pkg),
    new Response(body, { headers: { 'content-type': 'application/octet-stream' } }),
  );

  const map = installedRuntimes();
  map[pkg.id] = {
    id: pkg.id,
    installedAt: new Date().toISOString(),
    bytes: bytes.length,
    manifest: opened.manifest,
  };
  saveInstalled(map);

  return opened.manifest;
}

/** Fetch a cached runtime body. Returns null when it is not installed. */
export async function readRuntime(pkg: RuntimePackage): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(RUNTIME_CACHE);
  const response = await cache.match(cacheKey(pkg));
  if (!response) return null;
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Re-open an installed runtime: cached bytes are re-verified against the
 * catalogue checksum and re-parsed, so a corrupted cache fails loudly instead of
 * booting something unexpected.
 */
export async function readInstalledPackage(pkg: RuntimePackage): Promise<OpenedRuntimePackage | null> {
  const bytes = await readRuntime(pkg);
  if (!bytes) return null;
  return openRuntimePackage(bytes, pkg.sha256);
}

export async function removeRuntime(pkg: RuntimePackage): Promise<void> {
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.delete(cacheKey(pkg));
  }
  const map = installedRuntimes();
  delete map[pkg.id];
  saveInstalled(map);
}

/** Runtimes installed but not referenced by any mod, offered for cleanup. */
export function unusedRuntimes(
  installed: Record<string, InstalledRuntime>,
  inUse: Set<string>,
): InstalledRuntime[] {
  return Object.values(installed).filter((entry) => !inUse.has(entry.id));
}
