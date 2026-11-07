import { useCallback, useEffect, useRef, useState } from 'react';
import type { EntryMap } from '../lib/import/zip';
import { singAnimationForLane } from '../lib/player/characters';
import type { Lane, ParsedChart } from '../lib/player/chart';
import {
  advanceGame,
  createGame,
  pressLane,
  releaseLane,
  resultsOf,
  type GameState,
  type PlayResult,
} from '../lib/player/engine';
import { createEventRunner, unsupportedSummary, type EventRunner } from '../lib/player/events';
import { renderFrame } from '../lib/player/render';
import {
  createAnimatedCharacter,
  loadScene,
  setCharacterAnimation,
  type AnimatedCharacter,
  type LoadedScene,
  type SceneAssets,
} from '../lib/player/scene';
import { rankFor } from '../lib/scores';

/**
 * The gameplay surface.
 *
 * Audio is the clock: note times are compared against `AudioContext.currentTime`
 * so a dropped animation frame cannot desynchronise the chart. Chart events run
 * off the same clock and feed the camera, scroll speed and character animations.
 * Everything is torn down on unmount - audio nodes, context, animation frame and
 * image bitmaps - so switching mods cannot leave a song playing in the
 * background.
 */

export interface PlayerBuffers {
  instrumental: AudioBuffer;
  voices: AudioBuffer | null;
}

export interface BestScoreSummary {
  score: number;
  accuracy: number;
  rank: string;
}

export interface PlayerStageProps {
  chart: ParsedChart;
  title: string;
  subtitle: string;
  difficulty: string;
  autoPlay?: boolean;
  loadAudio: (ctx: AudioContext) => Promise<PlayerBuffers>;
  /** Mod files, needed to load skins, characters and stages. */
  files?: EntryMap | null;
  sceneAssets?: SceneAssets | null;
  bestScore?: BestScoreSummary | null;
  /** Effects the runtime will not apply, shown before the song starts. */
  warnings?: string[];
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
  files = null,
  sceneAssets = null,
  bestScore = null,
  warnings = [],
  onExit,
  onResult,
}: PlayerStageProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PlayResult | null>(null);
  const [autoplay, setAutoplay] = useState(autoPlay);
  // Lane highlight state lives in the ref the renderer reads; this state exists
  // only to schedule re-renders when a lane changes.
  const [, setPressed] = useState<boolean[]>([false, false, false, false]);
  const [sceneProblems, setSceneProblems] = useState<string[]>([]);
  const [sceneSummary, setSceneSummary] = useState<string[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<PlayerBuffers | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const gameRef = useRef<GameState | null>(null);
  const sceneRef = useRef<LoadedScene | null>(null);
  const playerCharRef = useRef<AnimatedCharacter | null>(null);
  const opponentCharRef = useRef<AnimatedCharacter | null>(null);
  const runnerRef = useRef<EventRunner | null>(null);
  const zoomRef = useRef(1);
  const speedRef = useRef(chart.speed);
  const swapRef = useRef<string | null>(null);
  const startAtRef = useRef(0);
  const phaseRef = useRef<Phase>('loading');
  const pressedRef = useRef<boolean[]>([false, false, false, false]);

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

  const setLanePressed = useCallback((lane: Lane, value: boolean) => {
    pressedRef.current = pressedRef.current.map((entry, index) => (index === lane ? value : entry));
    setPressed(pressedRef.current);
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

        if (files && sceneAssets) {
          const scene = await loadScene(files, sceneAssets);
          if (cancelled) return;
          sceneRef.current = scene;
          setSceneProblems(scene.problems);
          setSceneSummary([
            scene.skin ? 'custom notes' : 'default notes',
            scene.player ? 'player character' : 'no player character',
            scene.opponent ? 'opponent character' : 'no opponent',
            scene.stage.background ? 'stage art' : 'no stage art',
          ]);
        }

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
  }, [files, sceneAssets, loadAudio, stopSources]);

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
    runnerRef.current = createEventRunner(chart.events, { baseSpeed: chart.speed });
    zoomRef.current = 1;
    speedRef.current = chart.speed;
    swapRef.current = null;

    const scene = sceneRef.current;
    playerCharRef.current = scene?.player ? createAnimatedCharacter(scene.player, 0) : null;
    opponentCharRef.current = scene?.opponent ? createAnimatedCharacter(scene.opponent, 0) : null;

    setResult(null);
    setPressed([false, false, false, false]);
    pressedRef.current = [false, false, false, false];

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
    pressedRef.current = [false, false, false, false];
    setPressed([false, false, false, false]);
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

      const runner = runnerRef.current;
      if (runner) {
        const eventFrame = runner.apply(time);
        zoomRef.current = eventFrame.zoom;
        speedRef.current = eventFrame.scrollSpeed;

        for (const trigger of eventFrame.triggers) {
          if (trigger.kind === 'animation') {
            const target = trigger.target === 'player' ? playerCharRef.current : opponentCharRef.current;
            if (target) setCharacterAnimation(target, trigger.value, time);
          } else {
            // Character swaps need a second set of sprites, which this runtime
            // does not load yet. Recorded and shown rather than silently ignored.
            swapRef.current = trigger.value;
          }
        }
      }

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
          const scene = sceneRef.current;
          renderFrame(context, game, {
            width,
            height,
            background: null,
            downscroll: false,
            autoplay: game.autoplay,
            label: title,
            subtitle,
            skin: scene?.skin ?? null,
            pressedLanes: pressedRef.current,
            zoom: zoomRef.current,
            scrollSpeed: speedRef.current,
            scene: {
              stage: scene?.stage ?? null,
              player: playerCharRef.current,
              opponent: opponentCharRef.current,
              time,
            },
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

  // Keyboard input, with real release events so holds are scored correctly.
  useEffect(() => {
    if (phase !== 'playing') return;

    const time = (): number => {
      const ctx = audioRef.current;
      return ctx ? Math.max(0, (ctx.currentTime - startAtRef.current) * 1000) : 0;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        pause();
        return;
      }
      const lane = LANE_KEYS[key];
      if (lane === undefined) return;
      event.preventDefault();
      if (event.repeat) return;
      const game = gameRef.current;
      if (!game || game.autoplay) return;

      setLanePressed(lane, true);
      const judgement = pressLane(game, lane, time());
      if (judgement) setCharacterAnimationIfPresent(playerCharRef.current, singAnimationForLane(lane), time());
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const lane = LANE_KEYS[event.key.toLowerCase()];
      if (lane === undefined) return;
      const game = gameRef.current;
      if (!game || game.autoplay) return;
      setLanePressed(lane, false);
      releaseLane(game, lane, time());
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pause, phase, setLanePressed]);

  // Diagnostics for automated checks and for the user's own troubleshooting.
  useEffect(() => {
    const target = window as unknown as Record<string, unknown>;
    target.__fnfosPlayer = {
      getState: () => {
        const game = gameRef.current;
        const scene = sceneRef.current;
        const runner = runnerRef.current;
        if (!game) return { phase: phaseRef.current, game: null };
        return {
          phase: phaseRef.current,
          format: game.chart.format,
          time: Math.round(game.time),
          finished: game.finished,
          failed: game.failed,
          score: game.score,
          judged: game.judged,
          unitsTotal: game.unitsTotal,
          playerNotes: game.chart.playerNotes,
          holdCompletions: game.holdCompletions,
          holdDrops: game.holdDrops,
          counts: { ...game.counts },
          accuracy: Number((game.judged === 0 ? 1 : game.accuracyValue / game.judged).toFixed(4)),
          zoom: Number(zoomRef.current.toFixed(3)),
          scrollSpeed: Number(speedRef.current.toFixed(3)),
          eventsApplied: runner ? [...runner.applied] : [],
          eventsUnsupported: runner ? unsupportedSummary(runner) : [],
          characterSwappedTo: swapRef.current,
          scene: {
            skin: scene?.skin?.name ?? null,
            player: scene?.player?.def.name || (scene?.player ? 'loaded' : null),
            opponent: scene?.opponent?.def.name || (scene?.opponent ? 'loaded' : null),
            stage: scene?.stage.background ? 'loaded' : null,
            problems: scene?.problems ?? [],
          },
        };
      },
    };
    return () => {
      delete target.__fnfosPlayer;
    };
  }, []);

  const laneFromPointer = (event: React.PointerEvent<HTMLDivElement>): Lane => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / Math.max(1, rect.width);
    return Math.min(3, Math.max(0, Math.floor(ratio * 4))) as Lane;
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing' || autoplay) return;
    const game = gameRef.current;
    const ctx = audioRef.current;
    if (!game || !ctx) return;
    const lane = laneFromPointer(event);
    const time = Math.max(0, (ctx.currentTime - startAtRef.current) * 1000);
    setLanePressed(lane, true);
    const judgement = pressLane(game, lane, time);
    if (judgement) setCharacterAnimationIfPresent(playerCharRef.current, singAnimationForLane(lane), time);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (phase !== 'playing' || autoplay) return;
    const game = gameRef.current;
    const ctx = audioRef.current;
    if (!game || !ctx) return;
    const lane = laneFromPointer(event);
    setLanePressed(lane, false);
    releaseLane(game, lane, Math.max(0, (ctx.currentTime - startAtRef.current) * 1000));
  };

  const rank = result ? rankFor(result.accuracy, result.autoplay) : null;

  return (
    <div className="player-root" onPointerDown={handlePointerDown} onPointerUp={handlePointerUp}>
      <canvas ref={canvasRef} className="player-canvas" aria-label={`${title} note highway`} />

      <div className="player-overlay">
        {phase === 'loading' ? (
          <div className="player-panel">
            <h2>Preparing audio…</h2>
            <p className="muted">Decoding the instrumental and the mod's art with this browser's decoders.</p>
          </div>
        ) : null}

        {phase === 'ready' ? (
          <div className="player-panel">
            <p className="faint">{subtitle}</p>
            <h2>{title}</h2>
            <p className="muted">
              {difficulty} · {chart.format === 'vslice' ? 'V-Slice chart' : 'Psych chart'} · {chart.playerNotes} notes ·{' '}
              {Math.round(chart.length / 1000)}s · speed {chart.speed.toFixed(1)}
            </p>
            {sceneSummary.length > 0 ? <p className="faint">{sceneSummary.join(' · ')}</p> : null}
            {bestScore ? (
              <p className="faint">
                Personal best: {bestScore.score.toLocaleString()} · {(bestScore.accuracy * 100).toFixed(1)}% ·{' '}
                {bestScore.rank}
              </p>
            ) : null}
            {warnings.length > 0 ? (
              <ul className="list" style={{ textAlign: 'left', fontSize: '0.8rem' }}>
                {warnings.slice(0, 4).map((warning) => (
                  <li key={warning} className="faint">
                    {warning}
                  </li>
                ))}
              </ul>
            ) : null}
            {sceneProblems.length > 0 ? (
              <ul className="list" style={{ textAlign: 'left', fontSize: '0.8rem' }}>
                {sceneProblems.slice(0, 3).map((problem) => (
                  <li key={problem} className="faint">
                    {problem}
                  </li>
                ))}
              </ul>
            ) : null}
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
              Keys: A S D F or arrow keys. Hold the key through a sustain — releasing early drops it. Escape
              stops the song.
            </p>
          </div>
        ) : null}

        {phase === 'finished' && result ? (
          <div className="player-panel">
            <p className="faint">{subtitle}</p>
            <h2>{result.failed ? 'Health ran out' : 'Song complete'}</h2>
            <p className="muted">
              {result.notesJudged} of {result.unitsTotal} note units judged ·{' '}
              {Math.round(result.durationMs / 1000)}s
              {result.autoplay ? ' · autoplay (not ranked)' : ''}
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
                <span>Rank</span>
                <strong>{rank}</strong>
              </div>
              <div>
                <span>Misses</span>
                <strong>{result.counts.miss}</strong>
              </div>
              <div>
                <span>Holds dropped</span>
                <strong>{result.holdDrops}</strong>
              </div>
            </div>
            <p className="faint">
              {result.holdCompletions} hold{result.holdCompletions === 1 ? '' : 's'} completed
              {result.autoplay ? ' · autoplay runs are saved but never ranked' : ''}
            </p>
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

function setCharacterAnimationIfPresent(character: AnimatedCharacter | null, name: string, atMs: number): void {
  if (!character) return;
  setCharacterAnimation(character, name, atMs);
}
