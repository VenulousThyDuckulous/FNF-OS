import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lane, ParsedChart } from '../lib/player/chart';
import { advanceGame, createGame, pressLane, resultsOf, type PlayResult } from '../lib/player/engine';
import { renderFrame } from '../lib/player/render';

/**
 * The gameplay surface.
 *
 * Audio is the clock: note times are compared against `AudioContext.currentTime`
 * so a dropped animation frame cannot desynchronise the chart. Everything is
 * torn down on unmount - audio nodes, context and animation frame - so switching
 * mods cannot leave a song playing in the background.
 */

export interface PlayerBuffers {
  instrumental: AudioBuffer;
  voices: AudioBuffer | null;
}

export interface PlayerStageProps {
  chart: ParsedChart;
  title: string;
  subtitle: string;
  difficulty: string;
  autoPlay?: boolean;
  loadAudio: (ctx: AudioContext) => Promise<PlayerBuffers>;
  onExit: () => void;
  onResult?: (result: PlayResult) => void;
}

type Phase = 'loading' | 'ready' | 'playing' | 'finished' | 'error';

const LANE_KEYS: Record<string, Lane> = {
  a: 0,
  s: 1,
  d: 2,
  f: 3,
  arrowleft: 0,
  arrowdown: 1,
  arrowup: 2,
  arrowright: 3,
};

export function PlayerStage({
  chart,
  title,
  subtitle,
  difficulty,
  autoPlay = false,
  loadAudio,
  onExit,
  onResult,
}: PlayerStageProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [autoplay, setAutoplay] = useState(autoPlay);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<PlayerBuffers | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const gameRef = useRef<ReturnType<typeof createGame> | null>(null);
  const startAtRef = useRef(0);
  const phaseRef = useRef<Phase>('loading');

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const stopSources = useCallback(() => {
    for (const source of sourcesRef.current) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Already stopped; nothing to do.
      }
    }
    sourcesRef.current = [];
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ctx = new AudioContext();
    audioRef.current = ctx;

    (async () => {
      try {
        const buffers = await loadAudio(ctx);
        if (cancelled) return;
        buffersRef.current = buffers;
        setPhase('ready');
      } catch (cause) {
        if (cancelled) return;
        setError(
          cause instanceof Error
            ? `Audio could not be decoded: ${cause.message}`
            : 'Audio could not be decoded by this browser.',
        );
        setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      stopSources();
      void ctx.close().catch(() => undefined);
      audioRef.current = null;
    };
  }, [loadAudio, stopSources]);

  const start = useCallback(async () => {
    const ctx = audioRef.current;
    const buffers = buffersRef.current;
    if (!ctx || !buffers) return;

    try {
      await ctx.resume();
    } catch {
      // Some browsers refuse; playback still runs silently rather than failing.
    }

    stopSources();
    const game = createGame(chart, { autoplay });
    gameRef.current = game;
    setResult(null);

    const startAt = ctx.currentTime + 0.12;
    startAtRef.current = startAt;

    const instrumental = ctx.createBufferSource();
    instrumental.buffer = buffers.instrumental;
    instrumental.connect(ctx.destination);
    instrumental.start(startAt);
    sourcesRef.current.push(instrumental);

    if (buffers.voices) {
      const voices = ctx.createBufferSource();
      voices.buffer = buffers.voices;
      voices.connect(ctx.destination);
      voices.start(startAt);
      sourcesRef.current.push(voices);
    }

    setPhase('playing');
  }, [autoplay, chart, stopSources]);

  const pause = useCallback(() => {
    stopSources();
    setPhase('ready');
  }, [stopSources]);

  // Render/game loop.
  useEffect(() => {
    if (phase !== 'playing') return;
    let frame = 0;

    const tick = () => {
      const ctx = audioRef.current;
      const game = gameRef.current;
      if (!ctx || !game) return;

      const time = Math.max(0, (ctx.currentTime - startAtRef.current) * 1000);
      advanceGame(game, time);

      const canvas = canvasRef.current;
      if (canvas) {
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        if (canvas.width !== Math.floor(width * ratio) || canvas.height !== Math.floor(height * ratio)) {
          canvas.width = Math.floor(width * ratio);
          canvas.height = Math.floor(height * ratio);
        }
        const context = canvas.getContext('2d');
        if (context) {
          context.setTransform(ratio, 0, 0, ratio, 0, 0);
          renderFrame(context, game, {
            width,
            height,
            background: null,
            downscroll: false,
            autoplay: game.autoplay,
            label: title,
            subtitle,
          });
        }
      }

      if (game.finished) {
        const final = resultsOf(game);
        stopSources();
        setResult(final);
        setPhase('finished');
        onResult?.(final);
        return;
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, title, subtitle, onResult, stopSources]);

  // Keyboard input.
  useEffect(() => {
    if (phase !== 'playing') return;

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        pause();
        return;
      }
      const lane = LANE_KEYS[key];
      if (lane === undefined) return;
      event.preventDefault();
      const ctx = audioRef.current;
      const game = gameRef.current;
      if (!ctx || !game || game.autoplay) return;
      pressLane(game, lane, Math.max(0, (ctx.currentTime - startAtRef.current) * 1000));
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [phase, pause]);

  // Diagnostics for automated checks and for the user's own troubleshooting.
  useEffect(() => {
    const target = window as unknown as Record<string, unknown>;
    target.__fnfosPlayer = {
      getState: () => {
        const game = gameRef.current;
        if (!game) return { phase: phaseRef.current, game: null };
        return {
          phase: phaseRef.current,
          time: Math.round(game.time),
          finished: game.finished,
          failed: game.failed,
          score: game.score,
          judged: game.judged,
          playerNotes: game.chart.playerNotes,
          counts: { ...game.counts },
          accuracy: Number((game.judged === 0 ? 1 : game.accuracyValue / game.judged).toFixed(4)),
        };
      },
    };
    return () => {
      delete target.__fnfosPlayer;
    };
  }, []);

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing' || autoplay) return;
    const game = gameRef.current;
    const ctx = audioRef.current;
    if (!game || !ctx) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    const lane = Math.min(3, Math.max(0, Math.floor(ratio * 4))) as Lane;
    pressLane(game, lane, Math.max(0, (ctx.currentTime - startAtRef.current) * 1000));
  };

  return (
    <div className="player-root" onPointerDown={handlePointer}>
      <canvas ref={canvasRef} className="player-canvas" aria-label={`${title} note highway`} />

      <div className="player-overlay">
        {phase === 'loading' ? (
          <div className="player-panel">
            <h2>Preparing audio…</h2>
            <p className="muted">Decoding the instrumental with this browser's audio decoder.</p>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <div className="player-panel">
            <p className="faint">{subtitle}</p>
            <h2>{title}</h2>
            <p className="muted">
              {difficulty} · {chart.playerNotes} notes · {Math.round(chart.length / 1000)}s · speed{' '}
              {chart.speed.toFixed(1)}
            </p>
            <label className="player-toggle">
              <input
                type="checkbox"
                checked={autoplay}
                onChange={(event) => setAutoplay(event.target.checked)}
              />
              Autoplay (let the runtime hit every note)
            </label>
            <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 6 }}>
              <button type="button" className="btn btn-primary" onClick={() => void start()}>
                Start
              </button>
              <button type="button" className="btn btn-ghost" onClick={onExit}>
                Back
              </button>
            </div>
            <p className="faint">
              Keys: A S D F or arrow keys. Escape stops the song and returns here.
            </p>
          </div>
        ) : null}

        {phase === 'finished' && result ? (
          <div className="player-panel">
            <p className="faint">{subtitle}</p>
            <h2>{result.failed ? 'Health ran out' : 'Song complete'}</h2>
            <p className="muted">
              {result.notesJudged} of {result.playerNotes} notes judged · {Math.round(result.durationMs / 1000)}s
            </p>
            <div className="player-results">
              <div>
                <span>Score</span>
                <strong>{result.score.toLocaleString()}</strong>
              </div>
              <div>
                <span>Accuracy</span>
                <strong>{(result.accuracy * 100).toFixed(2)}%</strong>
              </div>
              <div>
                <span>Max combo</span>
                <strong>{result.maxCombo}</strong>
              </div>
              <div>
                <span>Misses</span>
                <strong>{result.counts.miss}</strong>
              </div>
            </div>
            <div className="row" style={{ justifyContent: 'center', gap: 10, marginTop: 14 }}>
              <button type="button" className="btn btn-primary" onClick={() => void start()}>
                Play again
              </button>
              <button type="button" className="btn btn-ghost" onClick={onExit}>
                Leave
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'error' ? (
          <div className="player-panel">
            <h2>This song could not be played</h2>
            <p className="muted">{error}</p>
            <div className="row" style={{ justifyContent: 'center' }}>
              <button type="button" className="btn" onClick={onExit}>
                Back to the mod
              </button>
            </div>
          </div>
        ) : null}

        {phase === 'playing' ? (
          <div className="player-controls">
            <button type="button" className="btn btn-sm" onClick={pause}>
              Stop
            </button>
            <span className="faint">Escape also stops the song</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
