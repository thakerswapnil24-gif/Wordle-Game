/**
 * Spoiler-free result sharing.
 *
 * The share text contains only the shape of the solve — coloured squares, the
 * puzzle number and the score. The answer itself never appears, and neither do
 * the letters that were guessed.
 */
import { BRAND, MAX_GUESSES, MODE, STATUS, TILE } from './config.js';
import { shareViaNative } from './native.js';

const SQUARES = {
  standard: {
    [TILE.CORRECT]: '\u{1F7E9}', // green square
    [TILE.PRESENT]: '\u{1F7E8}', // yellow square
    [TILE.ABSENT]: '\u{2B1C}', // white square
    absentDark: '\u{2B1B}', // black square
  },
  highContrast: {
    [TILE.CORRECT]: '\u{1F7E6}', // blue square
    [TILE.PRESENT]: '\u{1F7E7}', // orange square
    [TILE.ABSENT]: '\u{2B1C}',
    absentDark: '\u{2B1B}',
  },
};

/**
 * @param {Game} game finished game
 * @param {{highContrast?: boolean, darkMode?: boolean}} [options]
 * @returns {string} the emoji grid, one row per guess
 */
export function buildGrid(game, { highContrast = false, darkMode = false } = {}) {
  const palette = highContrast ? SQUARES.highContrast : SQUARES.standard;
  const absent = darkMode ? palette.absentDark : palette[TILE.ABSENT];
  return game.evaluations
    .map((row) => row.map((state) => (state === TILE.ABSENT ? absent : palette[state])).join(''))
    .join('\n');
}

/**
 * The full shareable message.
 * @param {Game} game
 * @param {{highContrast?: boolean, darkMode?: boolean}} [options]
 */
export function buildShareText(game, options = {}) {
  const score = game.status === STATUS.WON ? `${game.guessCount}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const label = game.mode === MODE.DAILY ? `#${game.puzzleNumber}` : 'Practice';
  const hard = game.hardMode ? '*' : '';
  // A revealed letter is marked so a shared result is never quietly flattering.
  // It says a hint was used, not which letter — the grid stays spoiler-free.
  const hint = game.usedHint ? ' \u{1F4A1}' : '';
  return `${BRAND.name} ${label} ${score}${hard}${hint}\n\n${buildGrid(game, options)}`;
}

/**
 * Copy text to the clipboard, or hand it to the native share sheet on mobile.
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function shareText(text) {
  // Inside the Android app, go straight to the system share sheet.
  const native = await shareViaNative(text, `${BRAND.name} result`);
  if (native === 'shared') return 'shared';

  const canNativeShare = typeof navigator !== 'undefined'
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ text });

  if (canNativeShare) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      // A cancelled share sheet is not a failure — fall through to copying.
      if (error?.name === 'AbortError') return 'shared';
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return legacyCopy(text) ? 'copied' : 'failed';
  }
}

/** Clipboard API needs a secure context; this keeps sharing working over http. */
function legacyCopy(text) {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
