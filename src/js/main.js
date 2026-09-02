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
  answerForPuzzle, msUntilNextPuzzle, puzzleNumberFor, randomAnswer, validWordCount,
} from './dictionary.js';
import {
  loadProgress, noteCompleted, noteReached, resolveDaily, saveProgress,
} from './progress.js';
import { Game, reviveGame } from './game.js';
import { applyResult, loadStats, saveStats } from './stats.js';
import { buildShareText, shareText } from './share.js';
import { applySettings, isDark, loadSettings, nextTheme, saveSettings, THEME } from './settings.js';
import * as storage from './storage.js';
import { applyNativeTheme, hideSplash, isNative, onBackButton } from './native.js';
import {
  initAds, maybeShowInterstitial, noteGameCompleted, onAdsChanged, privacyOptionsAvailable,
  rewardedAvailable, showPrivacyOptions, showRewardedAd, syncBanner,
} from './ads/ads.js';
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
  /** Durable record of the furthest daily reached and the last one completed. */
  progress: loadProgress(),
  /** The daily currently in play — usually today's, see syncDaily(). */
  puzzleNumber: 1,
  /** True once today's daily is finished; it cannot be replayed. */
  dailyLocked: false,
  /** True when the device clock reads earlier than a day already played. */
  clockBehind: false,
  countdownTimer: null,
  lockTimer: null,
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

  syncDaily();
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

  // Ad availability changes on its own as ads load and are consumed, so the
  // controls that offer them follow it rather than being refreshed by hand.
  onAdsChanged(refreshAdControls);

  // Deliberately not awaited: the game is playable before the ads stack is, and
  // must stay playable if it never becomes ready at all.
  initAds().then((ready) => {
    if (!ready) return;
    syncBanner(state.mode);
    refreshAdControls();
  });

  if (state.clockBehind) {
    toast('Your device clock is behind — showing the latest daily puzzle', { duration: 3400 });
  }

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

/**
 * Offer a hint in exchange for a rewarded ad.
 *
 * The ad is the price, so nothing is revealed unless the reward was actually
 * earned — but a failure to show one costs the player nothing either, and says
 * so rather than failing silently.
 */
async function requestHint() {
  const game = currentGame();
  if (state.busy || !game.canHint) return;

  const button = $('hint-button');
  button.disabled = true;
  try {
    const earned = await showRewardedAd();
    if (!earned) {
      toast('No hint this time — the ad was not completed');
      return;
    }
    const hint = game.revealHint();
    if (!hint) return;
    persist(game);
    renderHints();
    const position = ['1st', '2nd', '3rd', '4th', '5th'][hint.index];
    toast(`${position} letter is ${hint.letter.toUpperCase()}`, { tone: 'success' });
    announce(`Hint: the ${position} letter is ${hint.letter.toUpperCase()}`);
  } finally {
    button.disabled = false;
    refreshAdControls();
  }
}

/** Paint the revealed-letter strip. */
function renderHints() {
  const game = currentGame();
  const strip = $('hint-strip');
  strip.hidden = !game.usedHint;
  if (strip.hidden) return;

  strip.textContent = '';
  game.hintRow.forEach((letter, i) => {
    const cell = document.createElement('span');
    cell.className = letter ? 'hints__cell hints__cell--revealed' : 'hints__cell';
    cell.textContent = letter ? letter.toUpperCase() : '·';
    cell.setAttribute('aria-label', letter
      ? `Revealed: letter ${i + 1} is ${letter.toUpperCase()}`
      : `Letter ${i + 1} not revealed`);
    strip.append(cell);
  });
}

/**
 * Show the hint button only when it can actually do something: an ad is loaded,
 * the game is running, and there is a letter left worth revealing.
 */
function refreshAdControls() {
  const game = currentGame();
  const button = $('hint-button');
  button.hidden = dailyIsLocked() || !(rewardedAvailable() && game.canHint);
  const privacy = $('privacy-setting');
  if (privacy) privacy.hidden = !privacyOptionsAvailable();
}

const SEEN_KEY = 'pentaword:seen-intro:v1';
const hasPlayedBefore = () => storage.read(SEEN_KEY, (v) => (v === true ? true : null), false);
const markPlayed = () => storage.write(SEEN_KEY, true);

/* -------------------------------------------------------------------------- */
/* Game lifecycle                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Decide which daily puzzle is in play and remember that it was reached.
 *
 * Normally that is simply today's. It differs only when the device clock has
 * gone backwards, in which case the furthest puzzle already reached is served
 * again rather than an earlier day's word — see `progress.js`.
 *
 * @returns {boolean} true when the puzzle number changed
 */
function syncDaily() {
  const resolved = resolveDaily(puzzleNumberFor(), state.progress);
  const changed = resolved.puzzleNumber !== state.puzzleNumber;
  state.puzzleNumber = resolved.puzzleNumber;
  state.clockBehind = resolved.clockBehind;

  const advanced = noteReached(state.progress, resolved.puzzleNumber);
  if (advanced !== state.progress) {
    state.progress = advanced;
    saveProgress(state.progress);
  }
  return changed;
}

function loadDailyGame() {
  const puzzleNumber = state.puzzleNumber;
  const answer = answerForPuzzle(puzzleNumber);
  const restored = storage.read(
    STORAGE_KEYS.daily,
    (raw) => reviveGame(raw, {
      mode: MODE.DAILY,
      expectedAnswer: answer,
      expectedPuzzle: puzzleNumber,
    }),
    null,
  );
  // Honour a hard-mode change made between sessions, but never retroactively
  // invalidate guesses that were already legal when they were played.
  if (restored) restored.hardMode = state.settings.hardMode;

  const game = restored ?? new Game({
    mode: MODE.DAILY,
    answer,
    puzzleNumber,
    hardMode: state.settings.hardMode,
  });

  // The finished board is what normally prevents a replay; the completion
  // record is what prevents one when that board has been lost.
  state.dailyLocked = game.isOver || state.progress.completedPuzzle >= puzzleNumber;
  return game;
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
  if (!syncDaily()) return;
  state.games[MODE.DAILY] = loadDailyGame();
  persist(state.games[MODE.DAILY]);
  if (state.mode === MODE.DAILY) {
    board.reset();
    keyboard.reset();
    renderAll();
    toast('A new daily puzzle is ready');
  }
  updateModeCaption();
}

/** True when the board on screen is a finished daily and must stay finished. */
const dailyIsLocked = () => state.mode === MODE.DAILY && state.dailyLocked;

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

function handleAction(action) {
  const game = currentGame();
  if (state.busy) return;

  if (dailyIsLocked() || game.isOver) {
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
      usedHint: game.usedHint,
    });
    saveStats(state.stats);
  }
  if (game.mode === MODE.DAILY) {
    // One daily, once. Recorded durably so it survives losing the board.
    state.dailyLocked = true;
    const next = noteCompleted(state.progress, game.puzzleNumber);
    if (next !== state.progress) {
      state.progress = next;
      saveProgress(state.progress);
    }
  }
  persist(game);

  const message = won ? WIN_WORDS[game.guessCount - 1] : `The word was ${game.answer.toUpperCase()}`;
  toast(message, { tone: won ? 'success' : 'neutral', duration: won ? 1800 : 2600 });
  announce(won ? `${message}. Solved in ${game.guessCount} guesses.` : message);

  state.busy = false;
  // renderAll rather than render: finishing changes the caption, locks the
  // keyboard and raises the "come back tomorrow" panel, not just the board.
  renderAll();

  noteGameCompleted();
  // The interstitial waits until the player has closed the statistics, so it
  // never lands on top of the result they just earned.
  const finishedMode = game.mode;
  modals.stats.onClose(function afterStats() {
    modals.stats.onCloseCallbacks.delete(afterStats);
    void maybeShowInterstitial(finishedMode);
  });
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
  keyboard.setEnabled(!dailyIsLocked());
  updateModeCaption();
  renderHints();
  renderLock();
  refreshAdControls();
}

/**
 * Show the "come back tomorrow" panel over a finished daily, so the reason the
 * board no longer accepts letters is on screen rather than merely implied.
 */
function renderLock() {
  const panel = $('daily-lock');
  if (!panel) return;
  const locked = dailyIsLocked();
  panel.hidden = !locked;
  // The keyboard steps aside rather than sitting there greyed out: there is
  // nothing left to type, and the panel needs the room.
  $('keyboard').hidden = locked;
  if (locked) startLockCountdown();
  else stopLockCountdown();
}

function startLockCountdown() {
  if (state.lockTimer) return;
  const tick = () => {
    $('lock-countdown').textContent = formatCountdown(msUntilNextPuzzle());
  };
  tick();
  state.lockTimer = setInterval(() => {
    tick();
    checkDailyRollover();
  }, 1000);
}

function stopLockCountdown() {
  if (state.lockTimer) clearInterval(state.lockTimer);
  state.lockTimer = null;
}

function updateModeCaption() {
  const game = currentGame();
  const caption = $('mode-caption');
  if (state.mode === MODE.DAILY) {
    let suffix = '';
    if (game.status === STATUS.WON) suffix = ' · solved';
    else if (game.isOver) suffix = ' · complete';
    else if (state.dailyLocked) suffix = ' · already played';
    caption.textContent = `Puzzle #${game.puzzleNumber}${suffix}`;
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
  syncBanner(mode);
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

  $('hint-button').addEventListener('click', requestHint);
  $('lock-practice-button').addEventListener('click', (event) => {
    blurOnPointerClick(event);
    setMode(MODE.PRACTICE);
  });
  $('privacy-button').addEventListener('click', async () => {
    const shown = await showPrivacyOptions();
    if (!shown) toast('Privacy options are not available on this device');
  });

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
