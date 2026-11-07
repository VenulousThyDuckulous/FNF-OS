import { useEffect, useMemo, useRef, useState } from 'react';
import type { RuntimeManifest } from '../lib/runtime/manifest';
import {
  HANDSHAKE_TIMEOUT_MS,
  MAX_MISSED_PINGS,
  PING_INTERVAL_MS,
  PROTOCOL_VERSION,
  isRuntimeMessage,
  type ShellMessage,
} from '../lib/runtime/protocol';
import { createModVfs, handleFileRequest } from '../lib/runtime/vfs';

/**
 * Sandboxed runtime host.
 *
 * The runtime is mounted in an iframe with `allow-scripts` but *not*
 * `allow-same-origin`, so it runs in an opaque origin and cannot reach
 * IndexedDB, cookies, localStorage or this document. It therefore cannot fetch
 * its assets by URL: it announces readiness, and the shell answers file requests
 * from the mod's virtual filesystem.
 *
 * Because the origin is opaque, `MessageEvent.origin` is the string "null" and
 * is useless for authentication. The host checks `event.source` against its own
 * frame and validates every message shape instead.
 */

export type HostState = 'booting' | 'ready' | 'unresponsive' | 'crashed' | 'exited';

export interface RuntimeHostProps {
  manifest: RuntimeManifest;
  entryHtml: string;
  files: Map<string, Uint8Array>;
  modId: string;
  modName: string;
  onExit: (reason: string) => void;
  onFatal: (message: string) => void;
}

export function RuntimeHost({
  manifest,
  entryHtml,
  files,
  modId,
  modName,
  onExit,
  onFatal,
}: RuntimeHostProps): JSX.Element {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const callbacks = useRef({ onExit, onFatal });
  callbacks.current = { onExit, onFatal };

  const [state, setState] = useState<HostState>('booting');

  const vfs = useMemo(() => createModVfs(files), [files]);
  const entryUrl = useMemo(
    () => URL.createObjectURL(new Blob([entryHtml], { type: 'text/html' })),
    [entryHtml],
  );

  useEffect(() => () => URL.revokeObjectURL(entryUrl), [entryUrl]);

  useEffect(() => {
    const frameWindow = (): Window | null => frame.current?.contentWindow ?? null;
    const post = (message: ShellMessage): void => {
      frameWindow()?.postMessage(message, '*');
    };

    let ready = false;
    let misses = 0;
    let nonce = 1;

    const handshake = window.setTimeout(() => {
      if (ready) return;
      setState('unresponsive');
      callbacks.current.onFatal('The runtime did not announce itself within 15 seconds, so it was stopped.');
    }, HANDSHAKE_TIMEOUT_MS);

    const heartbeat = window.setInterval(() => {
      if (!ready) return;
      misses += 1;
      if (misses > MAX_MISSED_PINGS) {
        window.clearInterval(heartbeat);
        setState('unresponsive');
        callbacks.current.onFatal('The runtime stopped responding to heartbeats and was stopped.');
        return;
      }
      post({ type: 'runtime:ping', nonce: nonce++ });
    }, PING_INTERVAL_MS);

    const onMessage = (event: MessageEvent): void => {
      if (event.source !== frameWindow()) return;

      const data: unknown = event.data;
      if (!isRuntimeMessage(data)) return;

      switch (data.type) {
        case 'runtime:ready':
          ready = true;
          misses = 0;
          window.clearTimeout(handshake);
          setState('ready');
          post({
            type: 'runtime:init',
            protocol: PROTOCOL_VERSION,
            runtime: { id: manifest.id, engine: manifest.engine, version: manifest.version },
            mod: { id: modId, name: modName },
            files: vfs.paths(),
            features: manifest.features,
          });
          break;

        case 'runtime:pong':
          misses = 0;
          break;

        case 'runtime:file-request':
          post(handleFileRequest(vfs, data.path, data.requestId, data.offset ?? 0));
          break;

        case 'runtime:error':
          if (data.fatal) {
            setState('crashed');
            callbacks.current.onFatal(data.message);
          }
          break;

        case 'runtime:exit':
          setState('exited');
          callbacks.current.onExit(data.reason);
          break;

        default:
          // `runtime:log` and anything else the guard allows but the shell does not
          // act on. Logs are deliberately not forwarded to the console: runtime
          // output is untrusted and can spam.
          break;
      }
    };

    window.addEventListener('message', onMessage);

    return () => {
      window.clearTimeout(handshake);
      window.clearInterval(heartbeat);
      window.removeEventListener('message', onMessage);
      post({ type: 'runtime:shutdown' });
    };
  }, [entryUrl, manifest, modId, modName, vfs]);

  return (
    <iframe
      ref={frame}
      title={`${modName} runtime`}
      src={entryUrl}
      sandbox="allow-scripts allow-pointer-lock allow-gamepad"
      allow="autoplay; fullscreen; gamepad"
      data-state={state}
      style={{ width: '100%', height: '100%', border: 0, background: '#000' }}
    />
  );
}
