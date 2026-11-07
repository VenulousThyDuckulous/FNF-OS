import type { EngineId } from '../engines/types';
import { sha256Hex } from '../hash';

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
  engine: EngineId;
  /** Runtime version, pinned by mods. */
  version: string;
  /** Absolute URL, e.g. a GitHub Release asset. */
  url: string;
  /** Lowercase hex SHA-256 of the package. Required - installs are refused without it. */
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
    return JSON.parse(localStorage.getItem(INSTALLED_KEY) ?? '{}') as Record<string, InstalledRuntime>;
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

/**
 * Download, verify and cache a runtime. Refuses to store anything whose hash
 * does not match, so a tampered or truncated download cannot be installed.
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

  if (!(await verifyRuntime(bytes, pkg.sha256))) {
    throw new Error('Runtime package failed its checksum check and was discarded.');
  }

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(new Request(pkg.url), new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } }));

  const map = installedRuntimes();
  map[pkg.id] = { id: pkg.id, installedAt: new Date().toISOString(), bytes: received };
  saveInstalled(map);
}

/** Fetch a cached runtime body. Returns null when it is not installed. */
export async function readRuntime(pkg: RuntimePackage): Promise<Uint8Array | null> {
  if (typeof caches === 'undefined') return null;
  const cache = await caches.open(RUNTIME_CACHE);
  const response = await cache.match(new Request(pkg.url));
  if (!response) return null;
  return new Uint8Array(await response.arrayBuffer());
}

export async function removeRuntime(pkg: RuntimePackage): Promise<void> {
  if (typeof caches !== 'undefined') {
    const cache = await caches.open(RUNTIME_CACHE);
    await cache.delete(new Request(pkg.url));
  }
  const map = installedRuntimes();
  delete map[pkg.id];
  saveInstalled(map);
}

/** Runtimes installed but not referenced by any mod, offered for cleanup. */
export function unusedRuntimes(installed: Record<string, InstalledRuntime>, inUse: Set<string>): InstalledRuntime[] {
  return Object.values(installed).filter((entry) => !inUse.has(entry.id));
}
