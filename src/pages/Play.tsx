import { useEffect, useMemo, useRef, useState } from 'react';
import { RuntimeHost } from '../components/RuntimeHost';
import { getEngine } from '../lib/engines/registry';
import { formatRelative } from '../lib/format';
import type { RuntimeManifest } from '../lib/runtime/manifest';
import { readInstalledPackage, resolveRuntime } from '../lib/runtime/manager';
import { Link, useNavigate } from '../router';
import { useLibrary } from '../state/library';

interface BootedRuntime {
  manifest: RuntimeManifest;
  entryHtml: string;
  files: Map<string, Uint8Array>;
}

/**
 * Gameplay shell.
 *
 * A runtime is only mounted when a package is installed *and* re-verifies
 * against its catalogue checksum. With no runtime in the catalogue, the honest
 * state is the blocked screen below - never a fake player.
 */
export function PlayPage({ modId }: { modId: string }): JSX.Element {
  const { mods, patchMod } = useLibrary();
  const navigate = useNavigate();
  const mod = mods.find((entry) => entry.id === modId);

  const [leaveVisible, setLeaveVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [booted, setBooted] = useState<BootedRuntime | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const runtime = useMemo(
    () => (mod?.engine ? resolveRuntime(mod.engine, mod.runtimeVersion) : null),
    [mod?.engine, mod?.runtimeVersion],
  );

  useEffect(() => {
    if (!runtime) {
      setBooted(null);
      return;
    }

    let active = true;
    setBootError(null);

    readInstalledPackage(runtime)
      .then((pkg) => {
        if (!active || !pkg) return;
        const entry = pkg.files.get(pkg.manifest.entry);
        if (!entry) {
          setBootError(`The installed runtime package is missing its entry point "${pkg.manifest.entry}".`);
          return;
        }
        setBooted({
          manifest: pkg.manifest,
          entryHtml: new TextDecoder().decode(entry),
          files: pkg.files,
        });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setBootError(cause instanceof Error ? cause.message : 'The installed runtime could not be read.');
      });

    return () => {
      active = false;
    };
  }, [runtime]);

  const reveal = () => {
    setLeaveVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setLeaveVisible(false), 3200);
  };

  useEffect(() => {
    reveal();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  // Keep the page from scrolling behind the gameplay surface.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const requestFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      setFullscreenError('Fullscreen was refused by the browser; using the largest available area instead.');
    }
  };

  useEffect(() => {
    void requestFullscreen();
  }, []);

  const leave = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (mod) void patchMod(mod.id, { lastPlayedAt: new Date().toISOString() });
    navigate(mod ? `/mod/${mod.id}` : '/library');
  };

  if (!mod) {
    return (
      <div className="play-root">
        <div className="play-stage">
          <div>
            <h2 style={{ marginBottom: 10 }}>Mod not found</h2>
            <button type="button" className="btn" onClick={() => navigate('/library')}>
              Back to library
            </button>
          </div>
        </div>
      </div>
    );
  }

  const engine = getEngine(mod.engine);
  const blocked = !runtime || mod.compat.blockers.length > 0;

  return (
    <div
      className="play-root"
      onMouseMove={(event) => {
        if (event.clientY > window.innerHeight - 96) reveal();
      }}
      onTouchStart={reveal}
    >
      <div className="play-stage">
        {blocked ? (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ marginBottom: 10, color: '#fff' }}>Cannot launch this mod yet</h2>
            <p style={{ color: '#a8b0bd', marginBottom: 14 }}>
              {engine ? `${engine.name} has no published browser runtime. ` : ''}
              FNF OS will not fake gameplay: a mod is only launched when a verified runtime is installed and
              its compatibility has been tested.
            </p>
            {mod.compat.blockers.length > 0 ? (
              <ul className="list" style={{ textAlign: 'left', color: '#c3c9d3', marginBottom: 18 }}>
                {mod.compat.blockers.map((blocker, index) => (
                  <li key={index}>{blocker}</li>
                ))}
              </ul>
            ) : null}
            {fullscreenError ? <p className="faint">{fullscreenError}</p> : null}
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={leave}>
                Back to mod page
              </button>
              <Link to="/settings" className="btn btn-ghost" style={{ color: '#c3c9d3' }}>
                Engine status
              </Link>
            </div>
          </div>
        ) : booted ? (
          <RuntimeHost
            manifest={booted.manifest}
            entryHtml={booted.entryHtml}
            files={booted.files}
            modId={mod.id}
            modName={mod.name}
            onExit={() => {
              void patchMod(mod.id, { lastPlayedAt: new Date().toISOString() });
              navigate(`/mod/${mod.id}`);
            }}
            onFatal={(message) => {
              setBooted(null);
              setBootError(message);
            }}
          />
        ) : bootError ? (
          <div style={{ maxWidth: 520 }}>
            <h2 style={{ marginBottom: 10, color: '#fff' }}>The runtime could not start</h2>
            <p style={{ color: '#a8b0bd', marginBottom: 14 }}>{bootError}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={leave}>
                Back to mod page
              </button>
            </div>
          </div>
        ) : (
          <p style={{ color: '#a8b0bd' }}>Verifying the installed runtime package...</p>
        )}
      </div>

      <div className="leave-bar" data-visible={leaveVisible} aria-hidden={!leaveVisible}>
        <span className="leave-grip" />
        <span className="faint" style={{ color: '#d7dbe2', padding: '0 4px', fontSize: '0.72rem' }}>
          {mod.name}
        </span>
        <button type="button" className="btn" onClick={leave} tabIndex={leaveVisible ? 0 : -1}>
          Leave
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        Playback unavailable: {(mod.compat.blockers[0] ?? 'no runtime installed').replace(/\.$/, '')}. Last
        opened {formatRelative(mod.lastPlayedAt)}.
      </span>
    </div>
  );
}
