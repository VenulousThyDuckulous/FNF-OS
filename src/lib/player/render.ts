import { LANE_COUNT, type Lane } from './chart';
import type { LoadedStage } from './scene';
import type { AnimatedCharacter } from './scene';
import { characterCurrentFrame } from './scene';
import { accuracyOf, type GameState } from './engine';
import { skinFrame, type NoteSkin } from './skins';
import { drawSparrowFrame, type SparrowFrame } from './sparrow';

/**
 * Canvas renderer for the compatibility runtime.
 *
 * Draws, in order: the stage background, the two characters, the stage's front
 * layer, the note highway, and the HUD. Every optional asset is optional at the
 * draw site too - if a mod gave us no skin, character or stage, the built-in
 * shapes are used, so a missing asset degrades instead of blanking the screen.
 */

export interface RenderScene {
  stage: LoadedStage | null;
  player: AnimatedCharacter | null;
  opponent: AnimatedCharacter | null;
  /** Song clock in ms, used to advance idle animations. */
  time: number;
}

export interface RenderOptions {
  width: number;
  height: number;
  /** Legacy single backdrop; used when the scene has no stage image. */
  background: CanvasImageSource | null;
  downscroll: boolean;
  autoplay: boolean;
  label: string;
  subtitle?: string;
  skin?: NoteSkin | null;
  scene?: RenderScene | null;
  pressedLanes?: boolean[];
  /** Camera zoom from chart events, 1 = none. */
  zoom?: number;
  /** Scroll speed from chart events, in chart-speed units. */
  scrollSpeed?: number;
  /** Received hits, for the result summary strip. */
  hitFlash?: Lane | null;
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
  const zoom = Math.min(2.5, Math.max(0.5, options.zoom ?? 1));
  const speed = Math.max(0.2, options.scrollSpeed ?? game.chart.speed);
  const laneWidth = Math.max(46, Math.min(width / 7, 96));
  const centre = width / 2;
  const hitY = options.downscroll ? height * 0.3 : height * 0.74;
  const travelMs = 1150 / (speed / 2);
  const travelPx = options.downscroll ? hitY : height - hitY;
  const pxPerMs = travelPx / travelMs;

  drawBackground(ctx, options, zoom);

  // Highway band behind the lanes keeps notes readable over busy stage art.
  const bandWidth = laneWidth * LANE_COUNT + 36;
  const band = ctx.createLinearGradient(centre - bandWidth / 2, 0, centre + bandWidth / 2, 0);
  band.addColorStop(0, 'rgba(6,8,13,0)');
  band.addColorStop(0.5, 'rgba(6,8,13,0.62)');
  band.addColorStop(1, 'rgba(6,8,13,0)');
  ctx.fillStyle = band;
  ctx.fillRect(centre - bandWidth / 2, 0, bandWidth, height);

  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const x = centre + (lane - (LANE_COUNT - 1) / 2) * laneWidth;
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.fillRect(x - laneWidth / 2, 0, laneWidth, height);
  }

  const laneX = (lane: number): number => centre + (lane - (LANE_COUNT - 1) / 2) * laneWidth;

  // Sustain tails first so note heads sit on top.
  for (const note of game.notes) {
    if (note.state === 'missed' || !note.player) continue;
    if (note.sustain <= 0) continue;
    const delta = note.time - game.time;
    if (delta > travelMs || delta + note.sustain < -200) continue;

    const x = laneX(note.lane);
    const headY = options.downscroll ? hitY + delta * pxPerMs : hitY - delta * pxPerMs;
    const tailY = options.downscroll ? headY + note.sustain * pxPerMs : headY - note.sustain * pxPerMs;

    const piece = skinFrame(options.skin ?? null, note.lane, 'holdPiece');
    if (piece && options.skin) {
      drawSkinHold(ctx, options.skin, piece, x, headY, tailY, laneWidth * 0.55);
    } else {
      ctx.fillStyle = withAlpha(LANE_COLOURS[note.lane] ?? '#c084fc', 0.35);
      ctx.fillRect(x - 9, Math.min(headY, tailY), 18, Math.abs(tailY - headY));
    }
  }

  // Notes.
  for (const note of game.notes) {
    if (note.state === 'missed') continue;
    const delta = note.time - game.time;
    if (delta > travelMs || delta < -220) continue;

    const x = laneX(note.lane);
    const y = options.downscroll ? hitY + delta * pxPerMs : hitY - delta * pxPerMs;
    const colour = LANE_COLOURS[note.lane] ?? '#c084fc';
    const alpha = note.state === 'hit' ? 0.28 : note.player ? 1 : 0.55;
    const frame = skinFrame(options.skin ?? null, note.lane, 'note');

    ctx.globalAlpha = alpha;
    if (frame && options.skin) {
      drawSkinFrame(ctx, options.skin, frame, x, y, laneWidth * 0.82);
    } else {
      drawNoteHead(ctx, x, y, laneWidth * 0.42, colour, note.type !== null);
    }
    ctx.globalAlpha = 1;
  }

  // Receptors, lit while the lane is held or autoplaying.
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    const x = laneX(lane);
    const pressed = options.pressedLanes?.[lane] ?? false;
    const pressFrame = skinFrame(options.skin ?? null, lane as Lane, 'press');
    if (pressFrame && options.skin) {
      ctx.globalAlpha = pressed ? 1 : 0.55;
      drawSkinFrame(ctx, options.skin, pressFrame, x, hitY, laneWidth * 0.86);
      ctx.globalAlpha = 1;
    } else {
      drawNoteHead(
        ctx,
        x,
        hitY,
        laneWidth * 0.46,
        pressed ? withAlpha(LANE_COLOURS[lane] ?? '#fff', 0.55) : 'rgba(255,255,255,0.22)',
        false,
        true,
      );
    }
  }

  drawHud(ctx, game, options, hitY);
}

function drawBackground(ctx: CanvasRenderingContext2D, options: RenderOptions, zoom: number): void {
  const { width, height } = options;

  ctx.fillStyle = '#080a0f';
  ctx.fillRect(0, 0, width, height);

  const stage = options.scene?.stage ?? null;
  if (stage?.background) {
    drawCover(ctx, stage.background, width, height);
    ctx.fillStyle = 'rgba(6,8,13,0.35)';
    ctx.fillRect(0, 0, width, height);
  } else if (options.background) {
    ctx.globalAlpha = 0.25;
    ctx.drawImage(options.background, 0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(8,10,15,0.55)';
    ctx.fillRect(0, 0, width, height);
  } else {
    const gradient = ctx.createRadialGradient(width / 2, height * 0.35, 10, width / 2, height * 0.5, height);
    gradient.addColorStop(0, 'rgba(99,102,241,0.28)');
    gradient.addColorStop(1, 'rgba(8,10,15,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  if (!options.scene) return;

  ctx.save();
  // Camera zoom is applied around the centre of the stage, like the engine's camera.
  ctx.translate(width / 2, height * 0.5);
  ctx.scale(zoom, zoom);
  ctx.translate(-width / 2, -height * 0.5);

  const stageAssets = options.scene.stage;
  drawCharacter(ctx, options.scene.opponent, width * 0.26, height * 0.56, height / 720, options.scene.time);
  drawCharacter(ctx, options.scene.player, width * 0.74, height * 0.56, height / 720, options.scene.time);

  if (stageAssets?.front) {
    ctx.globalAlpha = 0.9;
    drawCover(ctx, stageAssets.front, width, height);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: AnimatedCharacter | null,
  x: number,
  y: number,
  baseScale: number,
  time: number,
): void {
  if (!character) return;
  const frame = characterCurrentFrame(character, time);
  if (!frame) return;

  const [offsetX, offsetY] = character.animation.offsets;
  const scale = baseScale * character.def.scale * 0.9;
  drawSparrowFrame(
    ctx,
    character.atlas,
    frame,
    x + offsetX * baseScale,
    y + offsetY * baseScale,
    scale,
    character.def.flipX,
  );
}

function drawSkinFrame(
  ctx: CanvasRenderingContext2D,
  skin: NoteSkin,
  frame: SparrowFrame,
  x: number,
  y: number,
  size: number,
): void {
  const aspect = frame.height / Math.max(1, frame.width);
  const width = size * 1.15;
  const height = width * aspect;
  ctx.drawImage(skin.atlas.image, frame.x, frame.y, frame.width, frame.height, x - width / 2, y - height / 2, width, height);
}

function drawSkinHold(
  ctx: CanvasRenderingContext2D,
  skin: NoteSkin,
  frame: SparrowFrame,
  x: number,
  headY: number,
  tailY: number,
  width: number,
): void {
  const top = Math.min(headY, tailY);
  const height = Math.max(4, Math.abs(tailY - headY));
  ctx.globalAlpha = 0.6;
  ctx.drawImage(skin.atlas.image, frame.x, frame.y, frame.width, frame.height, x - width / 2, top, width, height);
  ctx.globalAlpha = 1;
}

/** Draw an image scaled to cover the canvas, cropping the overflow. */
function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource, width: number, height: number): void {
  const size = imageSize(image);
  if (!size) {
    ctx.drawImage(image, 0, 0, width, height);
    return;
  }
  const scale = Math.max(width / size.width, height / size.height);
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function imageSize(image: CanvasImageSource): { width: number; height: number } | null {
  if (image instanceof HTMLImageElement) {
    return image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  }
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
    return { width: image.width, height: image.height };
  }
  return null;
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
  if (game.holdDrops > 0) {
    ctx.fillStyle = 'rgba(248,113,113,0.9)';
    ctx.fillText(`Dropped holds ${game.holdDrops}`, width - 18, 88);
  }

  const comboY = hitY + (options.downscroll ? 96 : -96);
  const comboLabelY = hitY + (options.downscroll ? 138 : -138);
  const judgementY = hitY + (options.downscroll ? 176 : -176);

  if (game.combo > 2) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '700 40px system-ui, sans-serif';
    ctx.fillText(String(game.combo), width / 2, comboY);
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('COMBO', width / 2, comboLabelY);
  }

  const last = game.lastJudgement;
  if (last && game.time - last.at < 480) {
    const progress = (game.time - last.at) / 480;
    ctx.textAlign = 'center';
    ctx.globalAlpha = Math.max(0, 1 - progress);
    ctx.fillStyle = JUDGEMENT_COLOURS[last.judgement] ?? '#fff';
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.fillText(last.judgement.toUpperCase(), width / 2, judgementY);
    ctx.globalAlpha = 1;
  }

  if (options.autoplay) {
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(125,211,252,0.8)';
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.fillText('AUTOPLAY', 18, height - 26);
  }

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
