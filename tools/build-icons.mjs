#!/usr/bin/env node
/**
 * Renders the Pentaword mark to every raster icon the project needs.
 *
 * The mark is simple enough — a rounded letter tile with a diagonal gradient
 * and a geometric "P" — to rasterise directly, so the project needs no image
 * dependency and the icons stay in sync with assets/logo.svg.
 *
 * Outputs:
 *   assets/icon-{192,512}.png    web app manifest icons and the Play listing icon
 *   ic_launcher.png              legacy square launcher icon, every density
 *   ic_launcher_round.png        legacy round launcher icon, every density
 *   ic_launcher_foreground.png   adaptive-icon foreground layer, every density
 *
 * Usage: node tools/build-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/* ----------------------------- the mark itself ---------------------------- */

/** The design is authored on a 40x40 grid, matching assets/logo.svg. */
const VIEW = 40;
const CORNER = 11.5;

/*
 * The mark is a letter tile bearing a "P" — the visual language every word
 * game shares, drawn geometrically so the icons need no font or image library.
 * The glyph is a rounded stem plus a half-annulus bowl.
 */
const STEM = { x0: 14.8, x1: 18.8, y0: 10.5, y1: 29.5, r: 1.6 };
const BOWL = { cx: 18.8, cy: 16.8, outer: 6.4, inner: 2.4 };

const STOPS = [
  { at: 0.0, rgb: [0x7b, 0x6e, 0xf6] },
  { at: 0.55, rgb: [0x4f, 0x7e, 0xf0] },
  { at: 1.0, rgb: [0x10, 0xa3, 0x7b] },
];

const SS = 4; // supersampling factor per axis

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

const insideRoundedRect = (x, y) => {
  if (x < 0 || y < 0 || x > VIEW || y > VIEW) return false;
  const cx = Math.min(Math.max(x, CORNER), VIEW - CORNER);
  const cy = Math.min(Math.max(y, CORNER), VIEW - CORNER);
  return (x - cx) ** 2 + (y - cy) ** 2 <= CORNER * CORNER;
};

const insideCircle = (x, y) => {
  const r = VIEW / 2;
  return (x - r) ** 2 + (y - r) ** 2 <= r * r;
};

/** The stem of the P: a rounded rectangle. */
function insideStem(x, y) {
  const { x0, x1, y0, y1, r } = STEM;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** The bowl of the P: the right half of a ring. */
function insideBowl(x, y) {
  if (x < BOWL.cx) return false;
  const d = Math.hypot(x - BOWL.cx, y - BOWL.cy);
  return d <= BOWL.outer && d >= BOWL.inner;
}

const insideGlyph = (x, y) => insideStem(x, y) || insideBowl(x, y);

/**
 * @param {number} size pixel size of the square output
 * @param {{shape?: 'rounded'|'circle'|'none', inset?: number}} options
 *   `shape` is the silhouette the gradient fills; 'none' draws only the dots on
 *   transparency, which is what an adaptive icon foreground layer needs.
 *   `inset` shrinks the artwork within the canvas, as a fraction of the canvas —
 *   adaptive icons need the art to sit inside the central safe zone.
 */
function render(size, { shape = 'rounded', inset = 0 } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  const art = size * (1 - 2 * inset);
  const origin = size * inset;
  const scale = VIEW / art;
  const silhouette = shape === 'circle' ? insideCircle : insideRoundedRect;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let body = 0;
      let dot = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = ((px + (sx + 0.5) / SS) - origin) * scale;
          const y = ((py + (sy + 0.5) / SS) - origin) * scale;
          const inDot = insideGlyph(x, y);
          if (shape === 'none') {
            if (inDot) dot += 1;
          } else if (silhouette(x, y)) {
            body += 1;
            if (inDot) dot += 1;
          }
        }
      }

      const samples = SS * SS;
      const offset = (py * size + px) * 4;

      if (shape === 'none') {
        // White glyph on transparency.
        const alpha = dot / samples;
        pixels[offset] = 255;
        pixels[offset + 1] = 255;
        pixels[offset + 2] = 255;
        pixels[offset + 3] = Math.round(alpha * 255);
        continue;
      }

      const alpha = body / samples;
      const x = ((px + 0.5) - origin) * scale;
      const y = ((py + 0.5) - origin) * scale;
      const base = gradientAt((x / VIEW + y / VIEW) / 2);
      // Blend the glyph towards white in proportion to its coverage.
      const mix = alpha ? Math.min(1, dot / samples / alpha) : 0;
      const rgb = base.map((c) => Math.round(c + (255 - c) * mix));
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
  ihdr[9] = 6; // colour type: RGBA

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

function write(file, size, options) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, encodePng(render(size, options), size));
  return file;
}

/* --------------------------------- outputs -------------------------------- */

const RES = 'android/app/src/main/res';

/** Launcher icon sizes in px, per density bucket. */
const LEGACY = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
/** Adaptive icons are authored on a 108dp canvas regardless of density. */
const ADAPTIVE = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

/**
 * Adaptive-icon sizing.
 *
 * The canvas is 108dp but only its central 72dp is guaranteed to survive the
 * launcher's mask, and a circular mask trims the corners of even that. The
 * glyph is therefore sized directly: 46dp tall, centred, which fills the safe
 * zone confidently while staying clear of every mask shape.
 */
const ADAPTIVE_CANVAS_DP = 108;
const CLUSTER_TARGET_DP = 46;
/** The glyph's own extent on the 40-unit grid, taken from its tallest axis. */
const GLYPH_SPAN = STEM.y1 - STEM.y0;
const ADAPTIVE_ART_DP = (CLUSTER_TARGET_DP * VIEW) / GLYPH_SPAN;
const ADAPTIVE_INSET = (ADAPTIVE_CANVAS_DP - ADAPTIVE_ART_DP) / 2 / ADAPTIVE_CANVAS_DP;

const written = [];

for (const size of [192, 512]) {
  written.push(write(`assets/icon-${size}.png`, size, { shape: 'rounded' }));
}

for (const [density, size] of Object.entries(LEGACY)) {
  written.push(write(`${RES}/mipmap-${density}/ic_launcher.png`, size, { shape: 'rounded' }));
  written.push(write(`${RES}/mipmap-${density}/ic_launcher_round.png`, size, { shape: 'circle' }));
}

for (const [density, size] of Object.entries(ADAPTIVE)) {
  written.push(write(`${RES}/mipmap-${density}/ic_launcher_foreground.png`, size, {
    shape: 'none',
    inset: ADAPTIVE_INSET,
  }));
}

console.log(`${written.length} icons written:`);
for (const file of written) console.log(`  ${file}`);
