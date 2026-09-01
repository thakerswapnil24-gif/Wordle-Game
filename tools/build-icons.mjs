#!/usr/bin/env node
/**
 * Renders the Quintle mark to PNG app icons.
 *
 * Browsers happily use `assets/favicon.svg`, but iOS home-screen icons and some
 * PWA installers still require raster files. Rather than pull in a rendering
 * dependency, the mark is simple enough (a rounded square with a gradient and
 * five dots) to rasterise directly and encode with Node's built-in zlib.
 *
 * Usage: node tools/build-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const STOPS = [
  { at: 0.0, rgb: [0x7b, 0x6e, 0xf6] },
  { at: 0.55, rgb: [0x4f, 0x7e, 0xf0] },
  { at: 1.0, rgb: [0x10, 0xa3, 0x7b] },
];

const DOTS = [[13, 13], [27, 13], [20, 20], [13, 27], [27, 27]];
const DOT_R = 3.1;
const CORNER = 11.5;
const VIEW = 40;
const SS = 4; // supersampling factor for smooth edges

function gradientAt(t) {
  const clamped = Math.min(1, Math.max(0, t));
  for (let i = 1; i < STOPS.length; i += 1) {
    const a = STOPS[i - 1];
    const b = STOPS[i];
    if (clamped <= b.at) {
      const k = (clamped - a.at) / (b.at - a.at);
      return a.rgb.map((c, j) => Math.round(c + (b.rgb[j] - c) * k));
    }
  }
  return STOPS.at(-1).rgb;
}

/** Signed test: is (x, y) inside the rounded square? */
function insideRoundedRect(x, y) {
  const min = 0;
  const max = VIEW;
  if (x < min || y < min || x > max || y > max) return false;
  const cx = Math.min(Math.max(x, min + CORNER), max - CORNER);
  const cy = Math.min(Math.max(y, min + CORNER), max - CORNER);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= CORNER * CORNER;
}

function insideDots(x, y) {
  return DOTS.some(([dx, dy]) => (x - dx) ** 2 + (y - dy) ** 2 <= DOT_R * DOT_R);
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const scale = VIEW / size;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let inside = 0;
      let dot = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = (px + (sx + 0.5) / SS) * scale;
          const y = (py + (sy + 0.5) / SS) * scale;
          if (insideRoundedRect(x, y)) {
            inside += 1;
            if (insideDots(x, y)) dot += 1;
          }
        }
      }
      const samples = SS * SS;
      const alpha = inside / samples;
      const dotMix = dot / samples;
      const x = (px + 0.5) * scale;
      const y = (py + 0.5) * scale;
      const base = gradientAt((x / VIEW + y / VIEW) / 2);
      const rgb = base.map((c) => Math.round(c + (255 - c) * (alpha ? dotMix / alpha : 0)));
      const offset = (py * size + px) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
}

/* ------------------------------- PNG encoding ----------------------------- */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // filter method 0, no interlace — remaining bytes stay zero.

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type "none"
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const file = `assets/icon-${size}.png`;
  writeFileSync(file, encodePng(render(size), size));
  console.log(`wrote ${file}`);
}
