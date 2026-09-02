import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * The palette is CSS, so nothing else in the suite can see it — and a colour
 * pair can drift into uselessness without breaking a single behaviour test.
 * That is exactly what happened once: in dark mode a spent keyboard key and an
 * untouched one sat 1.13:1 apart, so the game silently stopped telling players
 * which letters they had ruled out. These assertions read the real tokens and
 * fail if any pair a player must tell apart collapses again.
 */

const css = readFileSync('src/styles/base.css', 'utf8');

/** Pull the custom properties declared inside one selector's block. */
function tokensFor(selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `${selector} not found in base.css`);
  const open = css.indexOf('{', start);
  const end = css.indexOf('}', open);
  const block = css.slice(open + 1, end);
  const tokens = {};
  for (const [, name, value] of block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[name] = value.trim();
  }
  return tokens;
}

const LIGHT = tokensFor(':root');
const DARK = { ...LIGHT, ...tokensFor("[data-theme='dark']") };
const HIGH_CONTRAST_LIGHT = { ...LIGHT, ...tokensFor("[data-contrast='high']") };
const HIGH_CONTRAST_DARK = {
  ...DARK,
  ...tokensFor("[data-contrast='high'][data-theme='dark']"),
};

const THEMES = {
  light: LIGHT,
  dark: DARK,
  'light + high contrast': HIGH_CONTRAST_LIGHT,
  'dark + high contrast': HIGH_CONTRAST_DARK,
};

/** WCAG relative luminance of a #rrggbb colour. */
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `${hex} is not a plain hex colour`);
  const channels = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/**
 * HSL saturation, 0 (pure grey) to 1 (fully saturated).
 *
 * Luminance contrast is only meaningful between two surfaces of the same hue.
 * A green tile and a grey one can sit at the same lightness and still be
 * unmistakable, so what has to be asserted for those pairs is that one is
 * coloured and the other is not.
 */
function saturation(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const lightness = (max + min) / 2;
  return (max - min) / (lightness > 0.5 ? 2 - max - min : max + min);
}

/** WCAG contrast ratio, 1:1 (identical) to 21:1 (black on white). */
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function ratio(theme, tokenA, tokenB) {
  const a = theme[tokenA];
  const b = theme[tokenB];
  assert.ok(a, `${tokenA} is not defined`);
  assert.ok(b, `${tokenB} is not defined`);
  return contrast(a, b);
}

function assertAtLeast(name, theme, tokenA, tokenB, minimum) {
  const actual = ratio(THEMES[theme], tokenA, tokenB);
  assert.ok(
    actual >= minimum,
    `${theme}: ${name} — ${tokenA} vs ${tokenB} is ${actual.toFixed(2)}:1, want ${minimum}:1`,
  );
}

/* ------------------------------ the keyboard ------------------------------ */

test('a spent key is clearly darker than one still worth pressing', () => {
  // The regression this file exists for. 2:1 is the floor at which the two read
  // as different surfaces rather than the same one under a different light.
  for (const theme of Object.keys(THEMES)) {
    assertAtLeast('spent vs untouched key', theme, '--key-bg', '--key-absent', 2);
  }
});

test('a spent key is still a legible key', () => {
  for (const theme of Object.keys(THEMES)) {
    assertAtLeast('label on a spent key', theme, '--key-absent-text', '--key-absent', 4.5);
    assertAtLeast('label on an untouched key', theme, '--key-text', '--key-bg', 4.5);
  }
});

test('a spent key stays visible against the page', () => {
  // It recedes; it must not disappear.
  for (const theme of Object.keys(THEMES)) {
    assertAtLeast('spent key vs page', theme, '--key-absent', '--bg', 1.15);
  }
});

/* -------------------------------- the board ------------------------------- */

test('a ruled-out tile is grey and a scoring tile is not', () => {
  // This is what separates the three states. Comparing them on luminance would
  // be the wrong test and an actively harmful one: green and grey already sit
  // at the same lightness in the light palette, and forcing the amber apart
  // from the grey would drag it down into the grey instead.
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const scoring of ['--tile-correct', '--tile-present']) {
      const s = saturation(theme[scoring]);
      assert.ok(s >= 0.4, `${name}: ${scoring} is ${s.toFixed(2)} saturated, want a real colour`);
    }
    const absent = saturation(theme['--tile-absent']);
    assert.ok(absent <= 0.2,
      `${name}: --tile-absent is ${absent.toFixed(2)} saturated, want near-grey`);
  }
});

test('an absent tile reads as a filled tile, not an empty one', () => {
  // An empty tile is page background inside a thin outline. If the absent fill
  // matches the page, a ruled-out letter looks unplayed.
  for (const theme of Object.keys(THEMES)) {
    assertAtLeast('absent tile vs page', theme, '--tile-absent', '--bg', 2);
  }
});

test('letters on a correct or absent tile are readable', () => {
  // 3:1 is WCAG AA for large text, which a bold 32px glyph is.
  for (const theme of Object.keys(THEMES)) {
    for (const tile of ['--tile-correct', '--tile-absent']) {
      assertAtLeast(`text on ${tile}`, theme, '--tile-filled-text', tile, 3);
    }
  }
});

test('the known-weak amber tile does not get weaker', () => {
  // White on the amber "present" tile sits at roughly 2.4:1 — below AA large
  // text, and a real if minor legibility gap. It is pinned rather than fixed
  // because the two available fixes both cost more than they gain: darkening
  // the amber collapses it into the grey absent tile (the test above), and
  // dark-on-amber text breaks the white-on-filled rule the other two tiles
  // follow. Raising this floor is a deliberate design change, not a tweak.
  for (const theme of Object.keys(THEMES)) {
    assertAtLeast('text on --tile-present', theme, '--tile-filled-text', '--tile-present', 2.3);
  }
});

/* ------------------------------ general text ------------------------------ */

test('body and muted text meet WCAG AA against the page', () => {
  for (const theme of Object.keys(THEMES)) {
    assertAtLeast('body text', theme, '--text', '--bg', 4.5);
    assertAtLeast('muted text', theme, '--text-muted', '--bg', 4.5);
  }
});

test('high contrast really is higher contrast', () => {
  // The setting exists for colour-vision deficiency: its correct/present pair
  // must separate further than the default palette's, not merely differ.
  for (const [plain, high] of [['light', 'light + high contrast'], ['dark', 'dark + high contrast']]) {
    const before = ratio(THEMES[plain], '--tile-correct', '--tile-present');
    const after = ratio(THEMES[high], '--tile-correct', '--tile-present');
    assert.ok(after > before,
      `${high}: correct vs present is ${after.toFixed(2)}:1, no better than ${before.toFixed(2)}:1`);
  }
});
