/**
 * Application controller.
 *
 * This is the only module that knows about both the game model and the DOM.
 * It owns the session state (settings, statistics, one Game per mode), routes
 * input from the physical and on-screen keyboards into the model, and asks the
 * view layer to render or animate the result.
 */
import {
  BRAND, MODE, STATUS, STORAGE_KEYS,
} from './config.js';
import {
  dailyAnswer, msUntilNextPuzzle, puzzleNumberFor, randomAnswer, validWordCount,
} from './dictionary.js';
import { Game, reviveGame } from './game.js';
import { applyResult, loadStats, saveStats } from './stats.js';
import { buildShareText, shareText } from './share.js';
import { applySettings, isDark, loadSettings, nextTheme, saveSettings, THEME } from './settings.js';
import * as storage from './storage.js';
import { applyNativeTheme, hideSplash, isNative, onBackButton } from './native.js';
import { Board } from './ui/board.js';
import { Keyboard } from './ui/keyboard.js';
import { Modal } from './ui/modal.js';
import { formatCountdown, renderStats } from './ui/stats-view.js';
import { announce, toast } from './ui/toast.js';

const $ = (id) => document.getElementById(id);

const state = {
  settings: loadSettings(),
  stats: loadStats(),
  mode: MODE.DAILY,
  games: { [MODE.DAILY]: null, [MODE.PRACTICE]: null },
  statsScope: MODE.DAILY,
  /** True while a reveal animation is playing; input is ignored meanwhile. */
  busy: false,
  puzzleNumber: puzzleNumberFor(),
  countdownTimer: null,
};

let board;
let keyboard;
let modals;

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

function boot() {
  applySettings(state.settings);
  applyNativeTheme(isDark(state.settings));

  board = new Board($('board'));
  keyboard = new Keyboard($('keyboard'), handleAction);
  modals = {
    help: new Modal($('help-modal')),
    stats: new Modal($('stats-modal')),
    settings: new Modal($('settings-modal')),
  };

  state.games[MODE.DAILY] = loadDailyGame();
  state.games[MODE.PRACTICE] = loadPracticeGame();
  // Write both back immediately so a freshly generated practice word survives
  // a reload even if the player never gets round to guessing.
  for (const game of Object.values(state.games)) persist(game);

  wireChrome();
  wireSettings();
  wireKeyboardEvents();

  $('dictionary-note').textContent =
    `${validWordCount.toLocaleString('en-US')} words in the dictionary.`;
  $('storage-note').hidden = storage.isPersistent();

  setMode(state.mode, { animate: false });

  $('app').hidden = false;
  window.__pentawordBooted = true;
  document.documentElement.dataset.platform = isNative() ? 'native' : 'web';
  hideSplash();
  wireBackButton();

  if (!hasPlayedBefore()) {
    modals.help.open();
    markPlayed();
  }

  // If the tab is left open overnight, roll over to the new puzzle.
  setInterval(checkDailyRollover, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkDailyRollover();
  });
}

/**
 * On Android, the back gesture should dismiss whatever is on top before it
 * leaves the game — closing a dialog first, and only exiting from the board.
 */
function wireBackButton() {
  onBackButton(() => {
    const open = document.querySelector('dialog[open]');
    if (!open) return false;
    for (const modal of Object.values(modals)) {
      if (modal.dialog === open) {
        modal.close();
        return true;
      }
    }
    open.close();
    return true;
  });
}

const SEEN_KEY = 'pentaword:seen-intro:v1';
const hasPlayedBefore = () => storage.read(SEEN_KEY, (v) => (v === true ? true : null), false);
const markPlayed = () => storage.write(SEEN_KEY, true);

/* -------------------------------------------------------------------------- */
/* Game lifecycle                                                             */
/* -------------------------------------------------------------------------- */

function loadDailyGame() {
  const puzzleNumber = state.puzzleNumber;
  const answer = dailyAnswer();
  const restored = storage.read(
    STORAGE_KEYS.daily,
    (raw) => reviveGame(raw, {
      mode: MODE.DAILY,
      expectedAnswer: answer,
      expectedPuzzle: puzzleNumber,
    }),
    null,
  );
  if (restored) {
    // Honour a hard-mode change made between sessions, but never retroactively
    // invalidate guesses that were already legal when they were played.
    restored.hardMode = state.settings.hardMode;
    return restored;
  }
  return new Game({
    mode: MODE.DAILY,
    answer,
    puzzleNumber,
    hardMode: state.settings.hardMode,
  });
}

function loadPracticeGame() {
  const restored = storage.read(
    STORAGE_KEYS.practice,
    (raw) => reviveGame(raw, { mode: MODE.PRACTICE }),
    null,
  );
  if (restored) {
    restored.hardMode = state.settings.hardMode;
    return restored;
  }
  return newPracticeGame();
}

function newPracticeGame() {
  return new Game({
    mode: MODE.PRACTICE,
    answer: randomAnswer(state.games[MODE.PRACTICE]?.answer),
    hardMode: state.settings.hardMode,
  });
}

const currentGame = () => state.games[state.mode];

function persist(game) {
  storage.write(game.mode === MODE.DAILY ? STORAGE_KEYS.daily : STORAGE_KEYS.practice, game);
}

function checkDailyRollover() {
  const puzzleNumber = puzzleNumberFor();
  if (puzzleNumber === state.puzzleNumber) return;
  state.puzzleNumber = puzzleNumber;
  state.games[MODE.DAILY] = loadDailyGame();
  if (state.mode === MODE.DAILY) {
    board.reset();
    keyboard.reset();
    renderAll();
    toast('A new daily puzzle is ready');
  }
  updateModeCaption();
}

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

function handleAction(action) {
  const game = currentGame();
  if (state.busy) return;

  if (game.isOver) {
    // The board is finished — nudge the player towards what happens next.
    if (action.type === 'enter') openStats();
    return;
  }

  if (action.type === 'letter') {
    if (game.addLetter(action.letter)) render();
    return;
  }
  if (action.type === 'backspace') {
    if (game.deleteLetter()) render();
    return;
  }
  if (action.type === 'enter') submitGuess();
}

function wireKeyboardEvents() {
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // A dialog owns its own keys while it is open.
    if (document.querySelector('dialog[open]')) return;
    // Never steal keys from a real text field.
    const target = event.target;
    if (target instanceof HTMLElement
      && target.closest('input, textarea, select, [contenteditable="true"]')) return;

    if (event.key === 'Enter') {
      // preventDefault also stops Enter from re-activating whichever button the
      // player last clicked, so play continues after using the mode switch.
      event.preventDefault();
      handleAction({ type: 'enter' });
    } else if (event.key === 'Backspace') {
      event.preventDefault();
      handleAction({ type: 'backspace' });
    } else if (/^[a-zA-Z]$/.test(event.key)) {
      handleAction({ type: 'letter', letter: event.key.toLowerCase() });
    }
  });
}

/**
 * Drop focus after a pointer click so the next Space or Enter reaches the game
 * instead of re-triggering the button. Keyboard activations (detail === 0) keep
 * their focus ring.
 */
function blurOnPointerClick(event) {
  if (event.detail !== 0 && event.currentTarget instanceof HTMLElement) {
    event.currentTarget.blur();
  }
}

async function submitGuess() {
  const game = currentGame();
  const row = game.rowIndex;
  const result = game.submit();

  if (!result.ok) {
    toast(result.reason);
    announce(result.reason);
    board.shake(row);
    return;
  }

  state.busy = true;
  keyboard.setEnabled(false);
  persist(game);

  await board.reveal(result.row, result.guess, result.states);
  keyboard.update(game.letterHints);
  announce(describeRow(result.guess, result.states));

  if (result.status === STATUS.WON) {
    await board.celebrate(result.row);
    finishGame(game, true);
  } else if (result.status === STATUS.LOST) {
    finishGame(game, false);
  } else {
    state.busy = false;
    keyboard.setEnabled(true);
    render();
  }
}

function describeRow(guess, states) {
  return [...guess]
    .map((letter, i) => `${letter.toUpperCase()} ${states[i]}`)
    .join(', ');
}

function finishGame(game, won) {
  if (!game.recorded) {
    game.recorded = true;
    state.stats[game.mode] = applyResult(state.stats[game.mode], {
      won,
      guessCount: game.guessCount,
      puzzleNumber: game.mode === MODE.DAILY ? game.puzzleNumber : null,
    });
    saveStats(state.stats);
  }
  persist(game);

  const message = won ? WIN_WORDS[game.guessCount - 1] : `The word was ${game.answer.toUpperCase()}`;
  toast(message, { tone: won ? 'success' : 'neutral', duration: won ? 1800 : 2600 });
  announce(won ? `${message}. Solved in ${game.guessCount} guesses.` : message);

  state.busy = false;
  keyboard.setEnabled(true);
  render();
  setTimeout(() => openStats({ scope: game.mode }), won ? 1500 : 2200);
}

const WIN_WORDS = ['Unbelievable!', 'Superb!', 'Impressive!', 'Nice one!', 'Got it!', 'Phew!'];

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function render() {
  board.render(currentGame());
}

function renderAll() {
  const game = currentGame();
  board.render(game);
  keyboard.update(game.letterHints);
  keyboard.setEnabled(true);
  updateModeCaption();
}

function updateModeCaption() {
  const game = currentGame();
  const caption = $('mode-caption');
  if (state.mode === MODE.DAILY) {
    const done = game.isOver ? ' · solved' : '';
    caption.textContent = `Puzzle #${game.puzzleNumber}${game.isOver ? (game.status === STATUS.WON ? done : ' · complete') : ''}`;
  } else {
    caption.textContent = game.isOver ? 'Practice · tap New word' : 'Practice · unlimited rounds';
  }
}

function setMode(mode, { animate = true } = {}) {
  if (state.busy) return;
  state.mode = mode;
  state.statsScope = mode;

  for (const tab of document.querySelectorAll('.modes__tab')) {
    const active = tab.dataset.mode === mode;
    tab.setAttribute('aria-pressed', String(active));
    tab.classList.toggle('modes__tab--active', active);
  }
  document.querySelector('.modes__switch').dataset.active = mode;

  board.reset();
  keyboard.reset();
  renderAll();
  if (animate) $('board').classList.add('board--enter');
  setTimeout(() => $('board').classList.remove('board--enter'), 320);
}

/* -------------------------------------------------------------------------- */
/* Chrome: header buttons, modals, stats, sharing                             */
/* -------------------------------------------------------------------------- */

function wireChrome() {
  for (const button of document.querySelectorAll('.topbar .icon-button')) {
    button.addEventListener('click', blurOnPointerClick);
  }

  $('help-button').addEventListener('click', () => modals.help.open());
  $('stats-button').addEventListener('click', () => openStats());
  $('settings-button').addEventListener('click', () => modals.settings.open());
  $('theme-button').addEventListener('click', toggleTheme);

  for (const tab of document.querySelectorAll('.modes__tab')) {
    tab.addEventListener('click', (event) => {
      blurOnPointerClick(event);
      setMode(tab.dataset.mode);
    });
  }

  for (const chip of document.querySelectorAll('.stats__scope .chip')) {
    chip.addEventListener('click', () => {
      state.statsScope = chip.dataset.scope;
      paintStats();
    });
  }

  $('new-game-button').addEventListener('click', () => {
    state.games[MODE.PRACTICE] = newPracticeGame();
    persist(state.games[MODE.PRACTICE]);
    modals.stats.close();
    if (state.mode !== MODE.PRACTICE) setMode(MODE.PRACTICE);
    else {
      board.reset();
      keyboard.reset();
      renderAll();
      $('board').classList.add('board--enter');
      setTimeout(() => $('board').classList.remove('board--enter'), 320);
    }
    announce('New practice word ready');
  });

  $('share-button').addEventListener('click', async () => {
    const game = state.games[state.statsScope];
    if (!game?.isOver) return;
    const text = buildShareText(game, {
      highContrast: state.settings.highContrast,
      darkMode: isDark(state.settings),
    });
    const outcome = await shareText(text);
    if (outcome === 'copied') toast('Result copied to clipboard', { tone: 'success' });
    else if (outcome === 'failed') toast('Could not access the clipboard');
  });

  modals.stats.onClose(stopCountdown);

  // Keep the theme in sync with the OS while the player is on "system".
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (state.settings.theme === THEME.SYSTEM) {
      applySettings(state.settings);
      applyNativeTheme(isDark(state.settings));
      syncThemeControls();
    }
  });
}

function openStats({ scope = state.mode } = {}) {
  state.statsScope = scope;
  paintStats();
  modals.stats.open();
  startCountdown();
}

function paintStats() {
  const scope = state.statsScope;
  const game = state.games[scope];
  const stats = state.stats[scope];

  for (const chip of document.querySelectorAll('.stats__scope .chip')) {
    chip.classList.toggle('chip--active', chip.dataset.scope === scope);
  }

  const highlight = game?.isOver && game.status === STATUS.WON ? game.guessCount : null;
  renderStats($('stats-panel'), stats, { mode: scope, highlightRow: highlight });

  const banner = $('result-banner');
  if (game?.isOver) {
    banner.hidden = false;
    banner.dataset.tone = game.status === STATUS.WON ? 'win' : 'loss';
    banner.textContent = game.status === STATUS.WON
      ? `Solved in ${game.guessCount} ${game.guessCount === 1 ? 'guess' : 'guesses'} — ${game.answer.toUpperCase()}`
      : `The word was ${game.answer.toUpperCase()}`;
  } else {
    banner.hidden = true;
  }

  $('share-button').hidden = !game?.isOver;

  // The daily word is deliberately once-a-day, so "play again" after finishing
  // it means starting a practice round instead.
  const newGameButton = $('new-game-button');
  newGameButton.hidden = !game?.isOver;
  newGameButton.textContent = scope === MODE.PRACTICE ? 'New word' : 'Practice';

  $('countdown').hidden = scope !== MODE.DAILY;
}

function startCountdown() {
  stopCountdown();
  const tick = () => {
    $('countdown-value').textContent = formatCountdown(msUntilNextPuzzle());
  };
  tick();
  state.countdownTimer = setInterval(() => {
    tick();
    checkDailyRollover();
  }, 1000);
}

function stopCountdown() {
  if (state.countdownTimer) clearInterval(state.countdownTimer);
  state.countdownTimer = null;
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

function wireSettings() {
  bindSwitch('toggle-dark', () => isDark(state.settings), () => {
    state.settings.theme = nextTheme(state.settings);
    commitSettings();
  });
  bindSwitch('toggle-hard', () => state.settings.hardMode, () => {
    const game = currentGame();
    if (!state.settings.hardMode && game.guessCount > 0 && !game.isOver) {
      toast('Hard mode can only be turned on before the first guess');
      return;
    }
    state.settings.hardMode = !state.settings.hardMode;
    for (const g of Object.values(state.games)) g.hardMode = state.settings.hardMode;
    commitSettings();
  });
  bindSwitch('toggle-contrast', () => state.settings.highContrast, () => {
    state.settings.highContrast = !state.settings.highContrast;
    commitSettings();
  });
  syncThemeControls();
}

function bindSwitch(id, read, onToggle) {
  const el = $(id);
  el.addEventListener('click', () => {
    onToggle();
    el.setAttribute('aria-checked', String(read()));
  });
  el.setAttribute('aria-checked', String(read()));
}

function commitSettings() {
  applySettings(state.settings);
  applyNativeTheme(isDark(state.settings));
  saveSettings(state.settings);
  syncThemeControls();
  for (const game of Object.values(state.games)) persist(game);
}

function toggleTheme() {
  state.settings.theme = nextTheme(state.settings);
  commitSettings();
}

function syncThemeControls() {
  const dark = isDark(state.settings);
  $('theme-button').setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  $('toggle-dark').setAttribute('aria-checked', String(dark));
  $('toggle-hard').setAttribute('aria-checked', String(state.settings.hardMode));
  $('toggle-contrast').setAttribute('aria-checked', String(state.settings.highContrast));
}

/* -------------------------------------------------------------------------- */

try {
  boot();
} catch (error) {
  console.error(`${BRAND.name} failed to start`, error);
  $('app').hidden = true;
  const fallback = $('boot-error');
  if (fallback) {
    fallback.hidden = false;
    $('boot-error-detail').textContent = String(error?.message ?? error);
  }
}
