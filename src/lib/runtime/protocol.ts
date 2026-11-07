import type { EngineFeature, FeatureSupport } from '../engines/types';
import type { EngineId } from '../engines/types';

/**
 * The shell <-> runtime message protocol.
 *
 * Everything crossing the iframe boundary is validated by shape. The runtime
 * runs with an opaque origin (`sandbox` without `allow-same-origin`), so
 * `MessageEvent.origin` is the string "null" and cannot be used for
 * authentication; the host verifies `event.source` against its own iframe
 * instead, and every message from the runtime is checked here before use.
 */

export const PROTOCOL_VERSION = 1;

/** Largest slice of a file sent in a single message. */
export const MAX_FILE_CHUNK_BYTES = 8 * 1024 * 1024;

export const HANDSHAKE_TIMEOUT_MS = 15_000;
export const PING_INTERVAL_MS = 5_000;
export const MAX_MISSED_PINGS = 3;

export interface RuntimeIdentity {
  id: string;
  /** Null only for reference runtimes, which are not engine builds. */
  engine: EngineId | null;
  version: string;
}

/** Messages the shell sends into the runtime. */
export type ShellMessage =
  | {
      type: 'runtime:init';
      protocol: number;
      runtime: RuntimeIdentity;
      mod: { id: string; name: string };
      files: string[];
      features: Partial<Record<EngineFeature, FeatureSupport>>;
    }
  | {
      type: 'runtime:file-result';
      requestId: number;
      path: string;
      ok: true;
      offset: number;
      total: number;
      done: boolean;
      data: ArrayBuffer;
    }
  | { type: 'runtime:file-result'; requestId: number; path: string; ok: false; error: string }
  | { type: 'runtime:ping'; nonce: number }
  | { type: 'runtime:shutdown' };

/** Messages the runtime may send back. Anything else is ignored. */
export type RuntimeMessage =
  | { type: 'runtime:ready'; protocol: number }
  | { type: 'runtime:log'; level: 'info' | 'warn' | 'error'; message: string }
  | { type: 'runtime:pong'; nonce: number }
  | { type: 'runtime:file-request'; requestId: number; path: string; offset?: number }
  | { type: 'runtime:error'; message: string; fatal: boolean }
  | { type: 'runtime:exit'; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Strict allowlist. Unknown message types, missing fields and wrong field types
 * are rejected outright rather than coerced.
 */
export function isRuntimeMessage(value: unknown): value is RuntimeMessage {
  if (!isRecord(value)) return false;

  switch (value.type) {
    case 'runtime:ready':
      return isFiniteNumber(value.protocol);

    case 'runtime:pong':
      return isFiniteNumber(value.nonce);

    case 'runtime:log':
      return (
        (value.level === 'info' || value.level === 'warn' || value.level === 'error') &&
        typeof value.message === 'string'
      );

    case 'runtime:error':
      return typeof value.message === 'string' && typeof value.fatal === 'boolean';

    case 'runtime:exit':
      return typeof value.reason === 'string';

    case 'runtime:file-request': {
      if (!isFiniteNumber(value.requestId) || typeof value.path !== 'string') return false;
      if (value.path.length === 0 || value.path.length > 1024) return false;
      if (value.offset === undefined) return true;
      return isFiniteNumber(value.offset) && value.offset >= 0;
    }

    default:
      return false;
  }
}
