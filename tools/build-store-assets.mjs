#!/usr/bin/env node
/**
 * Renders the Google Play listing assets from the real game.
 *
 * Screenshots are captured from the actual running app rather than mocked up,
 * so the listing can never drift from what players get. The feature graphic is
 * an HTML artboard rendered at Play's exact required size.
 *
 * Requires Playwright and a local server:
 *   npm start &
 *   node tools/build-store-assets.mjs
 *
 * Outputs into store/ :
 *   feature-graphic.png     1024x500, required by Play
 *   icon-512.png            copied from assets/, the listing icon
 *   screenshots/phone-*.png 1080x1920, at least two are required
 *   screenshots/tablet-*.png
 */
import { mkdir, copyFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { answerForPuzzle, puzzleNumberFor } from '../src/js/dictionary.js';

// Playwright is not a project dependency — store assets are regenerated rarely,
// and pulling a browser download into every `npm ci` is not worth it.
let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('This tool needs Playwright:\n  npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}

const BASE = process.env.PENTAWORD_URL ?? 'http://localhost:4173/index.html';
const OUT = 'store';

await mkdir(`${OUT}/screenshots`, { recursive: true });

const browser = await chromium.launch();

/* ------------------------------ feature graphic --------------------------- */

const FEATURE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: 1024px; height: 500px; overflow: hidden;
    display: flex; align-items: center; justify-content: center; gap: 56px; padding: 0 64px;
    background: radial-gradient(120% 140% at 12% 0%, #23264a 0%, #0e1015 62%);
    color: #fff;
    font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  }
  .mark { width: 152px; height: 152px; border-radius: 46px; flex: none;
          box-shadow: 0 24px 60px -18px rgba(0,0,0,.8); }
  h1 { font-size: 76px; font-weight: 700; letter-spacing: -.035em; line-height: 1; }
  p  { font-size: 27px; color: #aab2c6; margin-top: 16px; letter-spacing: -.01em; }
  .tiles { display: flex; gap: 10px; margin-top: 30px; }
  .t { width: 58px; height: 58px; border-radius: 11px; display: grid; place-items: center;
       font-size: 30px; font-weight: 700; color: #fff; background: #333a48; }
  .g { background: #17a67d; } .y { background: #c99a37; }
</style></head><body>
  <img class="mark" src="ICON_DATA_URI" alt="">
  <div>
    <h1>Pentaword</h1>
    <p>Five letters. Six tries. One word a day.</p>
    <div class="tiles">
      <div class="t g">Q</div><div class="t">U</div><div class="t y">I</div>
      <div class="t">L</div><div class="t g">T</div>
    </div>
  </div>
</body></html>`;

const iconData = `data:image/png;base64,${readFileSync('assets/icon-512.png').toString('base64')}`;

const feature = await browser.newPage({ viewport: { width: 1024, height: 500 } });
await feature.setContent(FEATURE_HTML.replace('ICON_DATA_URI', iconData));
await feature.waitForLoadState('networkidle');
await feature.screenshot({ path: `${OUT}/feature-graphic.png` });
await feature.close();
console.log(`${OUT}/feature-graphic.png  1024x500`);

/* -------------------------------- screenshots ----------------------------- */

// A staged daily has to agree with the calendar, or the app discards it as a
// leftover from another day and the capture shows an empty board. The number
// and its word therefore come from the same rotation the player sees.
const DAILY_PUZZLE = puzzleNumberFor();
const DAILY_WORD = answerForPuzzle(DAILY_PUZZLE);

/**
 * Put the game into a known state by writing a finished or part-finished board
 * into storage before the app boots, so every capture is reproducible.
 */
async function stage(page, shot) {
  const { theme } = shot;
  const mode = shot.mode;
  // Daily shots always show it solved, which is also the state that raises the
  // "come back tomorrow" panel.
  const answer = mode === 'daily' ? DAILY_WORD : shot.answer;
  const guesses = mode === 'daily' && shot.guesses
    ? [...shot.guesses.slice(0, -1), DAILY_WORD]
    : shot.guesses;
  const puzzle = DAILY_PUZZLE;

  await page.addInitScript(([theme, mode, answer, guesses, puzzle]) => {
    localStorage.setItem('pentaword:seen-intro:v1', 'true');
    localStorage.setItem('pentaword:settings:v1', JSON.stringify({
      theme, hardMode: false, highContrast: false,
    }));
    localStorage.setItem('pentaword:stats:v1', JSON.stringify({
      daily: {
        played: 34, wins: 31, currentStreak: 9, maxStreak: 14,
        distribution: [1, 4, 9, 10, 5, 2], lastPuzzle: mode === 'daily' ? puzzle : null,
      },
      practice: {
        played: 12, wins: 11, currentStreak: 4, maxStreak: 6,
        distribution: [0, 2, 4, 3, 2, 0], lastPuzzle: null,
      },
    }));
    if (answer) {
      localStorage.setItem(`pentaword:game:${mode}:v1`, JSON.stringify({
        mode, answer, puzzleNumber: mode === 'daily' ? puzzle : null,
        guesses, hardMode: false, recorded: true, hints: [],
        status: guesses.at(-1) === answer ? 'won' : 'playing',
      }));
      if (mode === 'daily' && guesses.at(-1) === answer) {
        localStorage.setItem('pentaword:daily-progress:v1',
          JSON.stringify({ highestPuzzle: puzzle, completedPuzzle: puzzle }));
      }
    }
  }, [theme, mode, answer, guesses, puzzle]);
}

const SHOTS = [
  {
    name: 'phone-1-board', device: 'phone', theme: 'light', mode: 'practice',
    answer: 'quilt', guesses: ['climb', 'moist'],
  },
  {
    name: 'phone-2-dark', device: 'phone', theme: 'dark', mode: 'practice',
    answer: 'brave', guesses: ['audio', 'stern', 'brave'],
  },
  {
    name: 'phone-3-stats', device: 'phone', theme: 'light', mode: 'daily',
    guesses: ['canoe', 'sheet'], open: '#stats-button',
  },
  {
    name: 'phone-4-daily', device: 'phone', theme: 'light', mode: 'daily',
    guesses: ['canoe', 'lodge', 'sheet'],
  },
  {
    name: 'phone-5-help', device: 'phone', theme: 'dark', mode: 'practice',
    open: '#help-button',
  },
  {
    name: 'tablet-1-board', device: 'tablet', theme: 'light', mode: 'practice',
    answer: 'quilt', guesses: ['climb', 'moist'],
  },
  {
    name: 'tablet-2-stats', device: 'tablet', theme: 'dark', mode: 'daily',
    guesses: ['canoe', 'sheet'], open: '#stats-button',
  },
];

/** Play accepts 320-3840px per side; these are the common store sizes. */
const VIEWPORTS = {
  phone: { width: 1080, height: 1920, scale: 2.5 },
  tablet: { width: 1600, height: 2560, scale: 2 },
};

for (const shot of SHOTS) {
  const { width, height, scale } = VIEWPORTS[shot.device];
  const ctx = await browser.newContext({
    viewport: { width: Math.round(width / scale), height: Math.round(height / scale) },
    deviceScaleFactor: scale,
    colorScheme: shot.theme === 'dark' ? 'dark' : 'light',
  });
  const page = await ctx.newPage();
  await stage(page, shot);
  await page.goto(BASE);
  await page.waitForSelector('#app:not([hidden])');
  if (shot.mode === 'practice') await page.click('#mode-practice');
  await page.waitForTimeout(500);
  if (shot.open) {
    await page.click(shot.open);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${OUT}/screenshots/${shot.name}.png` });
  console.log(`${OUT}/screenshots/${shot.name}.png  ${width}x${height}`);
  await ctx.close();
}

await copyFile('assets/icon-512.png', `${OUT}/icon-512.png`);
console.log(`${OUT}/icon-512.png  512x512`);

await browser.close();
