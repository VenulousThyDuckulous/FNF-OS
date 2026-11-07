import { isSafeRuntimePath } from './manifest';
import { MAX_FILE_CHUNK_BYTES, type ShellMessage } from './protocol';

/**
 * Virtual filesystem handed to a runtime.
 *
 * The runtime never sees a real filesystem and never gets a directory handle;
 * it can only ask for paths that exist inside the mod it was launched for. Every
 * request is normalised and validated, and reads are chunked so a large audio
 * file cannot blow up a single `postMessage` call.
 */

export interface ModVfs {
  paths(): string[];
  exists(path: string): boolean;
  read(path: string): Uint8Array | null;
  list(prefix: string): string[];
}

export function normaliseVfsPath(path: string): string | null {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return isSafeRuntimePath(normalised) ? normalised : null;
}

export function createModVfs(files: Map<string, Uint8Array>): ModVfs {
  const table = new Map<string, Uint8Array>();

  for (const [path, data] of files) {
    const key = normaliseVfsPath(path);
    if (key) table.set(key, data);
  }

  const ordered = [...table.keys()].sort((a, b) => a.localeCompare(b));

  return {
    paths: () => [...ordered],
    exists: (path) => {
      const key = normaliseVfsPath(path);
      return key ? table.has(key) : false;
    },
    read: (path) => {
      const key = normaliseVfsPath(path);
      return key ? table.get(key) ?? null : null;
    },
    list: (prefix) => {
      const base = prefix.replace(/\\/g, '/').replace(/\/+$/, '');
      if (base === '') return [...ordered];
      return ordered.filter((path) => path === base || path.startsWith(`${base}/`));
    },
  };
}

/** Reply to one `runtime:file-request`, including its offset for chunking. */
export function handleFileRequest(
  vfs: ModVfs,
  path: string,
  requestId: number,
  offset = 0,
): ShellMessage {
  const key = normaliseVfsPath(path);
  if (!key) {
    return { type: 'runtime:file-result', requestId, path, ok: false, error: 'Path is not valid inside this mod.' };
  }

  const bytes = vfs.read(key);
  if (!bytes) {
    return { type: 'runtime:file-result', requestId, path: key, ok: false, error: 'File not found in this mod.' };
  }

  const start = Math.max(0, Math.min(Math.trunc(offset), bytes.length));
  const end = Math.min(bytes.length, start + MAX_FILE_CHUNK_BYTES);
  const slice = bytes.slice(start, end);
  const data = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength) as ArrayBuffer;

  return {
    type: 'runtime:file-result',
    requestId,
    path: key,
    ok: true,
    offset: start,
    total: bytes.length,
    done: end >= bytes.length,
    data,
  };
}
