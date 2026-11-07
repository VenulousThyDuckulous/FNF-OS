import { useState } from 'react';
import { Section } from './ui';
import { RuntimeHost } from './RuntimeHost';
import { buildReferencePackage } from '../lib/lab/reference';
import type { RuntimeManifest } from '../lib/runtime/manifest';
import { installRuntimeBytes, type RuntimePackage } from '../lib/runtime/manager';

/**
 * Host self-test.
 *
 * Proves the parts of the runtime layer that can be proven today: package
 * integrity, install, sandbox handshake, heartbeat, VFS reads and shutdown. It
 * uses the reference runtime, which is not an engine and never plays a mod, so a
 * pass here is *not* a compatibility result and never assigns a level.
 */

type Stage = 'idle' | 'preparing' | 'running' | 'done' | 'failed';

const PROBE_PATH = 'lab/probe.json';
const PROBE_FILES = new Map<string, Uint8Array>([
  [PROBE_PATH, new TextEncoder().encode('{"probe":"fnf-os","purpose":"host self-test"}')],
]);

export function LabSection(): JSX.Element {
  const [stage, setStage] = useState<Stage>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<{ manifest: RuntimeManifest; entryHtml: string } | null>(null);

  const append = (line: string) => setLogs((current) => [...current, line]);

  const start = async () => {
    setStage('preparing');
    setError(null);
    setLogs([]);
    setRun(null);

    try {
      const built = await buildReferencePackage();
      const runtime: RuntimePackage = {
        id: built.manifest.id,
        engine: null,
        version: built.manifest.version,
        url: new URL('lab/reference/package.zip', document.baseURI).href,
        sha256: built.sha256,
        bytes: built.bytes.length,
        publishedAt: built.manifest.publishedAt,
      };

      const manifest = await installRuntimeBytes(runtime, built.bytes);
      append(`packaged ${built.bytes.length} bytes, sha256 ${built.sha256.slice(0, 12)}...`);
      append('checksum and manifest verified, cached for this device');
      setRun({ manifest, entryHtml: built.entryHtml });
      setStage('running');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The self-test could not start.');
      setStage('failed');
    }
  };

  return (
    <Section
      title="Host self-test"
      description="Runs the reference runtime in the sandbox to prove the host, protocol and virtual filesystem. It is not an engine and does not play mods."
    >
      <div className="card stack">
        <p className="muted">
          The reference runtime asks the shell for one file, checks it arrives intact and exits. A pass proves the
          install path, sandbox confinement, message validation and chunked reads — nothing about engine
          compatibility, which only real engine runtimes and real tests can establish.
        </p>

        <div className="row">
          <button type="button" className="btn" onClick={start} disabled={stage === 'preparing' || stage === 'running'}>
            {stage === 'preparing' ? 'Preparing...' : stage === 'running' ? 'Running...' : 'Run self-test'}
          </button>
          <span className="badge">
            {stage === 'done' ? 'completed' : stage === 'failed' ? 'failed' : stage === 'running' ? 'running' : 'idle'}
          </span>
        </div>

        {error ? <p style={{ color: 'var(--danger, #ff6b6b)' }}>{error}</p> : null}

        {run ? (
          <div
            style={{
              height: 240,
              borderRadius: 12,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: '#000',
            }}
          >
            <RuntimeHost
              manifest={run.manifest}
              entryHtml={run.entryHtml}
              files={PROBE_FILES}
              modId="self-test"
              modName="Host self-test"
              onLog={(level, message) => append(`${level}: ${message}`)}
              onExit={(reason) => {
                append(`exit: ${reason}`);
                setStage('done');
              }}
              onFatal={(message) => {
                setError(message);
                setStage('failed');
              }}
            />
          </div>
        ) : null}

        {logs.length > 0 ? (
          <pre
            className="mono"
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 10,
              background: 'var(--surface-2, rgba(255,255,255,0.04))',
              maxHeight: 200,
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              fontSize: '0.78rem',
            }}
          >
            {logs.join('\n')}
          </pre>
        ) : null}
      </div>
    </Section>
  );
}
