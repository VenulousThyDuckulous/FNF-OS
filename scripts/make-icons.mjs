/**
 * Generates the PNG app icons without any image dependency.
 *
 * Run: npm run icons
 * Output: public/icons/icon-192.png, icon-512.png, maskable-512.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');

const BG = [14, 15, 18];
const ACCENT = [107, 138, 253];
const MARK = [14, 15, 18];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(size, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size, insetRatio) {
  const pixels = Buffer.alloc(size * size * 4);

  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = 255;
  };

  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) put(x, y, BG);

  // Rounded accent plate.
  const inset = Math.round(size * insetRatio);
  const radius = Math.round((size - inset * 2) * 0.24);
  const min = inset;
  const max = size - inset;

  const insideRounded = (x, y) => {
    if (x < min || y < min || x >= max || y >= max) return false;
    const cx = Math.min(Math.max(x, min + radius), max - radius);
    const cy = Math.min(Math.max(y, min + radius), max - radius);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
  };

  for (let y = min; y < max; y += 1) {
    for (let x = min; x < max; x += 1) {
      if (insideRounded(x, y)) put(x, y, ACCENT);
    }
  }

  // Three bars, sized relative to the plate.
  const plate = max - min;
  const barWidth = Math.round(plate * 0.095);
  const gap = Math.round(plate * 0.075);
  const totalWidth = barWidth * 3 + gap * 2;
  const startX = Math.round(min + (plate - totalWidth) / 2);
  const heights = [0.42, 0.66, 0.3];

  heights.forEach((ratio, index) => {
    const height = Math.round(plate * ratio);
    const x = startX + index * (barWidth + gap);
    const y = Math.round(min + (plate - height) / 2);
    for (let dy = 0; dy < height; dy += 1) {
      for (let dx = 0; dx < barWidth; dx += 1) put(x + dx, y + dy, MARK);
    }
  });

  return encodePng(size, pixels);
}

mkdirSync(outDir, { recursive: true });

const outputs = [
  { name: 'icon-192.png', size: 192, inset: 0.2 },
  { name: 'icon-512.png', size: 512, inset: 0.2 },
  { name: 'maskable-512.png', size: 512, inset: 0.3 },
];

for (const output of outputs) {
  const png = draw(output.size, output.inset);
  writeFileSync(resolve(outDir, output.name), png);
  console.log(`wrote ${output.name} (${png.length} bytes)`);
}
