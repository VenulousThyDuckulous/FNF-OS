/**
 * Sparrow texture-atlas support.
 *
 * Sparrow v2 is the atlas format every FNF engine uses for notes, characters and
 * stage pieces: a PNG plus an XML file listing `<SubTexture>` rectangles. The XML
 * is parsed with a small attribute reader rather than DOMParser so the same code
 * runs in tests (no DOM) and in the browser.
 */

export interface SparrowFrame {
  name: string;
  /** Source rectangle inside the atlas image. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Untrimmed frame size, when the packer trimmed transparent edges. */
  frameWidth: number | null;
  frameHeight: number | null;
  /** Where the trimmed pixels sit inside the untrimmed frame. */
  frameX: number;
  frameY: number;
}

export interface SparrowAtlas {
  image: CanvasImageSource;
  frames: Map<string, SparrowFrame>;
  imageWidth: number;
  imageHeight: number;
}

function attribute(tag: string, key: string): string | null {
  const match = new RegExp(`\\b${key}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match ? match[1] ?? null : null;
}

function numberAttribute(tag: string, key: string, fallback: number): number {
  const raw = attribute(tag, key);
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** Read every `<SubTexture>` in a Sparrow XML document. */
export function parseSparrowXml(text: string): Map<string, SparrowFrame> {
  const frames = new Map<string, SparrowFrame>();
  const pattern = /<SubTexture\b[^>]*>/gi;

  for (const match of text.matchAll(pattern)) {
    const tag = match[0];
    const name = attribute(tag, 'name');
    if (!name) continue;

    const width = numberAttribute(tag, 'width', 0);
    const height = numberAttribute(tag, 'height', 0);
    if (width <= 0 || height <= 0) continue;

    const frameWidth = attribute(tag, 'frameWidth');
    const frameHeight = attribute(tag, 'frameHeight');

    frames.set(name, {
      name,
      x: numberAttribute(tag, 'x', 0),
      y: numberAttribute(tag, 'y', 0),
      width,
      height,
      frameWidth: frameWidth === null ? null : Number(frameWidth),
      frameHeight: frameHeight === null ? null : Number(frameHeight),
      frameX: numberAttribute(tag, 'frameX', 0),
      frameY: numberAttribute(tag, 'frameY', 0),
    });
  }

  return frames;
}

/** All frames whose name starts with `prefix`, in atlas order. */
export function framesWithPrefix(frames: Map<string, SparrowFrame>, prefix: string): SparrowFrame[] {
  const wanted = prefix.toLowerCase();
  return [...frames.values()].filter((frame) => frame.name.toLowerCase().startsWith(wanted));
}

/**
 * Pick the frame for an animation at a point in time. `fps` is the animation's
 * frame rate; a non-looping animation holds its last frame.
 */
export function frameForAnimation(
  frames: SparrowFrame[],
  elapsedMs: number,
  fps: number,
  loop: boolean,
): SparrowFrame | null {
  if (frames.length === 0) return null;
  const rate = fps > 0 ? fps : 24;
  const index = Math.max(0, Math.floor((elapsedMs / 1000) * rate));
  if (!loop) return frames[Math.min(index, frames.length - 1)] ?? null;
  return frames[index % frames.length] ?? null;
}

/**
 * Draw an atlas frame with its centre at (x, y). Trimming offsets are applied so
 * a sprite keeps its authored pivot instead of jumping when frames differ.
 */
export function drawSparrowFrame(
  ctx: CanvasRenderingContext2D,
  atlas: SparrowAtlas,
  frame: SparrowFrame,
  x: number,
  y: number,
  scale: number,
  flipX = false,
): void {
  const destWidth = frame.width * scale;
  const destHeight = frame.height * scale;
  const offsetX = frame.frameX * scale;
  const offsetY = frame.frameY * scale;

  ctx.save();
  if (flipX) {
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(atlas.image, frame.x, frame.y, frame.width, frame.height, -destWidth / 2 + offsetX, -destHeight / 2 + offsetY, destWidth, destHeight);
  } else {
    ctx.drawImage(
      atlas.image,
      frame.x,
      frame.y,
      frame.width,
      frame.height,
      x - destWidth / 2 + offsetX,
      y - destHeight / 2 + offsetY,
      destWidth,
      destHeight,
    );
  }
  ctx.restore();
}
