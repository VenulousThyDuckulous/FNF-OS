import { useEffect, useMemo, useRef, useState } from 'react';
import { getEngine } from '../lib/engines/registry';
import { formatRelative } from '../lib/format';
import { resolveRuntime } from '../lib/runtime/manager';
import { Link, useNavigate } from '../router';
import { useLibrary } from '../state/library';

/**
 * Gameplay shell.
 *
 * The browser runtime would be mounted in a sandboxed iframe here. No runtime
 * has been published, so the honest state is a blocked screen that explains
 * exactly why - never a fake player.
 */
export function PlayPage({ modId }: { modId: string }): JSX.Element {
  const { mods, patchMod } = useLibrary();
  const navigate = useNavigate();
  const mod = mods.find((entry) => entry.id === modId);

  const [leaveVisible, setLeaveVisible] = useState(false);
  const hideTimer = useRef<number | null>(null);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);

  const runtime = useMemo(
    () => (mod?.engine ? resolveRuntime(mod.engine, mod.runtimeVersion) : null),
    [mod?.engine, mod?.runtimeVersion],
  );

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
        ) : (
          <iframe
            title={`${mod.name} runtime`}
            // Runtimes are isolated: no same-origin privileges, no top navigation,
            // no popups. Never add allow-same-origin for third-party content.
            sandbox="allow-scripts allow-pointer-lock allow-gamepad"
            src={runtime.url}
            allow="autoplay; fullscreen; gamepad"
            style={{ width: '100%', height: '100%', border: 0 }}
          />
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
        Playback unavailable: {mod.compat.blockers[0] ?? 'no runtime installed'}. Last opened{' '}
        {formatRelative(mod.importedAt)}.
      </span>
    </div>
  );
}
