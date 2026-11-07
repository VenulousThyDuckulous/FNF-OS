import { LANE_COUNT } from './chart';
import { accuracyOf, type GameState } from './engine';

/**
 * Canvas renderer for the compatibility runtime.
 *
 * It draws the note highway, receptors, sustains, health, score and accuracy.
 * It does not draw characters or stages: those art systems are not implemented,
 * so pretending otherwise would be worse than a plain highway.
 */

export interface RenderOptions {
  width: number;
  height: number;
  background: CanvasImageSource | null;
  downscroll: boolean;
  autoplay: boolean;
  label: string;
  /** Extra line shown under the title, e.g. the built-in runtime name. */
  subtitle?: string;
}

const LANE_COLOURS = ['#c084fc', '#7dd3fc', '#86efac', '#fca5a5'];
const JUDGEMENT_COLOURS: Record<string, string> = {
  sick: '#7dd3fc',
  good: '#86efac',
  bad: '#fde68a',
  shit: '#fca5a5',
  miss: '#f87171',
};

export function renderFrame(ctx: CanvasRenderingContext2D, game: GameState, options: RenderOptions): void {
  const { width, height } = options;
  const speed = Math.max(0.5, game.chart.speed);
  const laneWidth = Math.max(46, Math.min(width / 7, 96));
  const centre = width / 2;
  const hitY = options.downscroll ? height * 0.3 : height * 0.74;
  const travelMs = 1150 / (speed / 2);
  const travelPx = options.downscroll ? hitY : height - hitY;
  const pxPerMs = travelPx / travelMs;

  drawBackground(ctx, options);

  // Lane guides.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const x = centre + (lane - (LANE_COUNT - 1) / 2) * laneWidth;
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fillRect(x - laneWidth / 2, 0, laneWidth, height);
  }

  // Sustain tails first so note heads sit on top.
  for (const note of game.notes) {
    if (note.state === 'missed' || !note.player) continue;
    if (note.sustain <= 0) continue;
    const delta = note.time - game.time;
    if (delta > travelMs || delta + note.sustain < -200) continue;

    const x = centre + (note.lane - (LANE_COUNT - 1) / 2) * laneWidth;
    const headY = options.downscroll ? hitY + delta * pxPerMs : hitY - delta * pxPerMs;
    const tailY = options.downscroll ? headY + note.sustain * pxPerMs : headY - note.sustain * pxPerMs;
    ctx.fillStyle = withAlpha(LANE_COLOURS[note.lane] ?? '#c084fc', 0.35);
    ctx.fillRect(x - 9, Math.min(headY, tailY), 18, Math.abs(tailY - headY));
  }

  // Notes.
  for (const note of game.notes) {
    if (note.state === 'missed') continue;
    const delta = note.time - game.time;
    if (delta > travelMs || delta < -220) continue;

    const laneX = centre + (note.lane - (LANE_COUNT - 1) / 2) * laneWidth;
    const y = options.downscroll ? hitY + delta * pxPerMs : hitY - delta * pxPerMs;
    const colour = LANE_COLOURS[note.lane] ?? '#c084fc';
    const alpha = note.state === 'hit' ? 0.28 : note.player ? 1 : 0.55;

    ctx.globalAlpha = alpha;
    drawNoteHead(ctx, laneX, y, laneWidth * 0.42, colour, note.type !== null);
    ctx.globalAlpha = 1;
  }

  // Receptors.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const laneX = centre + (lane - (LANE_COUNT - 1) / 2) * laneWidth;
    drawNoteHead(ctx, laneX, hitY, laneWidth * 0.46, 'rgba(255,255,255,0.22)', false, true);
  }

  drawHud(ctx, game, options, hitY);
}

function drawBackground(ctx: CanvasRenderingContext2D, options: RenderOptions): void {
  const { width, height } = options;
  ctx.fillStyle = '#080a0f';
  ctx.fillRect(0, 0, width, height);

  const gradient = ctx.createRadialGradient(width / 2, height * 0.35, 10, width / 2, height * 0.5, height);
  gradient.addColorStop(0, 'rgba(99,102,241,0.28)');
  gradient.addColorStop(1, 'rgba(8,10,15,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (!options.background) return;
  ctx.globalAlpha = 0.25;
  ctx.drawImage(options.background, 0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(8,10,15,0.55)';
  ctx.fillRect(0, 0, width, height);
}

function drawNoteHead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  colour: string,
  custom: boolean,
  outline = false,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  const half = size / 2;
  ctx.moveTo(0, -half);
  ctx.lineTo(half, 0);
  ctx.lineTo(0, half);
  ctx.lineTo(-half, 0);
  ctx.closePath();
  if (outline) {
    ctx.strokeStyle = colour;
    ctx.lineWidth = 3;
    ctx.stroke();
  } else {
    ctx.fillStyle = colour;
    ctx.fill();
    if (custom) {
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHud(ctx: CanvasRenderingContext2D, game: GameState, options: RenderOptions, hitY: number): void {
  const { width, height } = options;

  // Health bar.
  const healthRatio = Math.max(0, Math.min(1, game.health / game.maxHealth));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, width, 8);
  ctx.fillStyle = healthRatio > 0.5 ? '#4ade80' : healthRatio > 0.25 ? '#fbbf24' : '#f87171';
  ctx.fillRect(0, 0, width * healthRatio, 8);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 18px system-ui, sans-serif';
  ctx.fillText(options.label, 18, 22);

  if (options.subtitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(options.subtitle, 18, 46);
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 16px ui-monospace, monospace';
  ctx.fillText(`Score ${game.score.toLocaleString()}`, width - 18, 22);
  ctx.fillText(`Accuracy ${(accuracyOf(game) * 100).toFixed(1)}%`, width - 18, 44);
  ctx.fillText(`Misses ${game.counts.miss}`, width - 18, 66);

  if (game.combo > 2) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(String(game.combo), width / 2, hitY - (options.downscroll ? -70 : 90));
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('COMBO', width / 2, hitY - (options.downscroll ? -112 : 132));
  }

  const last = game.lastJudgement;
  if (last && game.time - last.at < 480) {
    const progress = (game.time - last.at) / 480;
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.fillStyle = JUDGEMENT_COLOURS[last.judgement] ?? '#fff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(last.judgement.toUpperCase(), width / 2, hitY + (options.downscroll ? 70 : -100));
    ctx.globalAlpha = 1;
  }

  if (options.autoplay) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(125,211,252,0.8)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('AUTOPLAY', 18, height - 26);
  }

  // Progress.
  const total = Math.max(1, game.chart.length);
  const progress = Math.max(0, Math.min(1, game.time / total));
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, height - 4, width, 4);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(0, height - 4, width * progress, 4);
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
