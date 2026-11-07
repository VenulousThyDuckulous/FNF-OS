import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerStage } from '../components/PlayerStage';
import { RuntimeHost } from '../components/RuntimeHost';
import { getEngine } from '../lib/engines/registry';
import { formatRelative } from '../lib/format';
import type { EntryMap } from '../lib/import/zip';
import type { PlayResult } from '../lib/player/engine';
import { listSongs, prepareSong, type PrepareResult, type SongListing } from '../lib/player/pipeline';
import { COMPAT_RUNTIME } from '../lib/player/profile';
import type { RuntimeManifest } from '../lib/runtime/manifest';
import { readInstalledPackage, resolveRuntime } from '../lib/runtime/manager';
import { Link, useNavigate } from '../router';
import { useLibrary } from '../state/library';

interface BootedRuntime {
  manifest: RuntimeManifest;
  entryHtml: string;
  files: Map<string, Uint8Array>;
}

interface ModPlayback {
  files: EntryMap;
  songs: SongListing[];
  problems: string[];
  prepared: PrepareResult[];
}

/**
 * Gameplay shell.
 *
 * Two paths, in this order:
 *
 * 1. a published runtime package for the mod's engine, checksum-verified, if one
 *    is installed;
 * 2. the built-in compatibility runtime, which reads the mod's own chart and
 *    audio in the browser.
 *
 * If neither can start, the screen says exactly what was missing. It never shows
 * a player that cannot play anything.
 */
export function PlayPage({ modId }: { modId: string }): JSX.Element {
  const { mods, patchMod, readFiles } = useLibrary();
  const navigate = useNavigate();
  const mod = mods.find((entry) => entry.id === modId);

  const [leaveVisible, setLeaveVisible] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [booted, setBooted] = useState<BootedRuntime | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const [playback, setPlayback] = useState<ModPlayback | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [lastResult, setLastResult] = useState<PlayResult | null>(null);

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

  // Read the mod's own files and work out what can be played.
  useEffect(() => {
    if (!mod) return;
    let active = true;
    setPlaybackError(null);
    setPlayback(null);

    readFiles(mod.id)
      .then((files) => {
        if (!active) return;
        if (!files) {
          setPlaybackError('No stored files were found for this mod. Re-import it to play.');
          return;
        }
        const { songs, problems } = listSongs(files);
        const prepared = songs.map((song) => prepareSong(files, song.chartPath));
        if (!active) return;
        setPlayback({ files, songs, problems, prepared });
        setSelected(0);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setPlaybackError(cause instanceof Error ? cause.message : 'This mod could not be read from storage.');
      });

    return () => {
      active = false;
    };
  }, [mod?.id]);

  const leave = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    if (mod) void patchMod(mod.id, { lastPlayedAt: new Date().toISOString() });
    navigate(mod ? `/mod/${mod.id}` : '/library');
  }, [mod, navigate, patchMod]);

  const current = playback?.prepared[selected];
  const currentSong = current?.ok ? current.song : null;

  const loadAudio = useCallback(
    async (ctx: AudioContext) => {
      if (!playback || !currentSong) throw new Error('No song is selected.');
      const bytes = playback.files.get(currentSong.audio.instrumental);
      if (!bytes) throw new Error(`The instrumental "${currentSong.audio.instrumental}" is no longer in this mod.`);

      const instrumental = await ctx.decodeAudioData(bytes.slice().buffer as ArrayBuffer);

      let voices: AudioBuffer | null = null;
      if (currentSong.audio.voices) {
        const voiceBytes = playback.files.get(currentSong.audio.voices);
        if (voiceBytes) {
          try {
            voices = await ctx.decodeAudioData(voiceBytes.slice().buffer as ArrayBuffer);
          } catch {
            // Missing or unsupported vocals must not stop the instrumental.
            voices = null;
          }
        }
      }

      return { instrumental, voices };
    },
    [playback, currentSong],
  );

  const reveal = () => {
    setLeaveVisible(true);
    window.setTimeout(() => setLeaveVisible(false), 3200);
  };

  useEffect(() => {
    reveal();
  }, []);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const request = async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      } catch {
        setFullscreenError('Fullscreen was refused by the browser; using the largest available area instead.');
      }
    };
    void request();
  }, []);

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

  const surface = (() => {
    if (booted) {
      return (
        <RuntimeHost
          manifest={booted.manifest}
          entryHtml={booted.entryHtml}
          files={booted.files}
          modId={mod.id}
          modName={mod.name}
          onExit={leave}
          onFatal={(message) => {
            setBooted(null);
            setBootError(message);
          }}
        />
      );
    }

    if (bootError) {
      return (
        <FailurePanel
          title="The installed runtime could not start"
          detail={bootError}
          onLeave={leave}
          onRetry={() => setBootError(null)}
        />
      );
    }

    if (playbackError) {
      return <FailurePanel title="This mod could not be read" detail={playbackError} onLeave={leave} />;
    }

    if (!playback) {
      return <p style={{ color: '#a8b0bd' }}>Reading the mod's charts and audio…</p>;
    }

    if (currentSong) {
      return (
        <PlayerStage
          key={currentSong.id}
          chart={currentSong.chart}
          title={currentSong.title}
          subtitle={`${COMPAT_RUNTIME.name} · ${COMPAT_RUNTIME.statusLabel.toLowerCase()}`}
          difficulty={currentSong.difficulty}
          loadAudio={loadAudio}
          onExit={leave}
          onResult={setLastResult}
        />
      );
    }

    const failure = current && !current.ok ? current.failure : null;

    return (
      <FailurePanel
        title={failure ? 'This song cannot be played yet' : 'Nothing playable was found in this mod'}
        detail={
          failure
            ? failure.detail
            : playback.problems.length > 0
              ? playback.problems[0] ?? 'No chart files were found.'
              : `No chart JSON was found under data/ in this mod. ${engine ? `${engine.shortName} mods that only replace assets cannot be played on their own.` : ''}`
        }
        onLeave={leave}
      >
        {playback.songs.length > 1 ? (
          <div className="stack" style={{ gap: 8, marginTop: 12 }}>
            <p className="faint" style={{ color: '#8b93a1' }}>Songs in this mod</p>
            {playback.songs.map((song, index) => {
              const prepared = playback.prepared[index];
              return (
                <button
                  key={song.id}
                  type="button"
                  className="badge"
                  style={{ cursor: 'pointer', justifyContent: 'space-between', width: '100%', display: 'flex' }}
                  onClick={() => setSelected(index)}
                  aria-pressed={index === selected}
                >
                  <span>
                    {song.title} · {song.difficulty}
                  </span>
                  <span className="faint">{prepared?.ok ? 'ready' : 'blocked'}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {playback.problems.length > 0 ? (
          <ul className="list" style={{ textAlign: 'left', color: '#c3c9d3', marginTop: 12 }}>
            {playback.problems.slice(0, 4).map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
      </FailurePanel>
    );
  })();

  return (
    <div
      className="play-root"
      onMouseMove={(event) => {
        if (event.clientY > window.innerHeight - 96) reveal();
      }}
      onTouchStart={reveal}
    >
      <div className="play-stage">{surface}</div>

      {currentSong && !booted ? null : (
        <div className="leave-bar" data-visible={leaveVisible} aria-hidden={!leaveVisible}>
          <span className="leave-grip" />
          <span className="faint" style={{ color: '#d7dbe2', padding: '0 4px', fontSize: '0.72rem' }}>
            {mod.name}
          </span>
          <button type="button" className="btn" onClick={leave} tabIndex={leaveVisible ? 0 : -1}>
            Leave
          </button>
        </div>
      )}

      <span className="sr-only" aria-live="polite">
        {currentSong && !booted
          ? `Playing ${currentSong.title} with the ${COMPAT_RUNTIME.name}.`
          : `Playback unavailable: ${(current && !current.ok ? current.failure.detail : mod.compat.blockers[0] ?? 'no playable song found').replace(/\.$/, '')}.`}
        {lastResult ? ` Last run scored ${lastResult.score} with ${(lastResult.accuracy * 100).toFixed(1)}% accuracy.` : ''}
        {' '}Last opened {formatRelative(mod.lastPlayedAt)}.
      </span>

      {fullscreenError ? (
        <p className="faint" style={{ position: 'absolute', bottom: 8, left: 12, color: '#8b93a1' }}>
          {fullscreenError}
        </p>
      ) : null}

      {!booted && !currentSong ? (
        <div style={{ position: 'absolute', bottom: 10, right: 12 }}>
          <Link to="/settings" className="btn btn-sm btn-ghost" style={{ color: '#c3c9d3' }}>
            Runtime status
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FailurePanel({
  title,
  detail,
  onLeave,
  onRetry,
  children,
}: {
  title: string;
  detail: string;
  onLeave: () => void;
  onRetry?: () => void;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ maxWidth: 560, color: '#eef1f6' }}>
      <h2 style={{ marginBottom: 10, color: '#ffffff' }}>{title}</h2>
      <p style={{ color: '#a8b0bd', marginBottom: 14 }}>{detail}</p>
      {children}
      <div className="row" style={{ justifyContent: 'center', marginTop: 16, gap: 10 }}>
        {onRetry ? (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onLeave}>
          Back to mod page
        </button>
      </div>
      <p className="faint" style={{ color: '#7d8593', marginTop: 12 }}>
        FNF OS never fakes a launch. If a chart, its audio or a required feature is missing, this screen names it.
      </p>
    </div>
  );
}
