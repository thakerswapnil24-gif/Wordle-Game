/**
 * Statistics model: a plain, serialisable record plus pure transforms.
 * Daily and practice results are tracked independently so that a practice
 * binge can never inflate — or break — a daily streak.
 */
import { MAX_GUESSES, MODE, STORAGE_KEYS } from './config.js';
import * as storage from './storage.js';

/** @returns {object} an empty statistics record. */
export function emptyStats() {
  return {
    played: 0,
    wins: 0,
    currentStreak: 0,
    maxStreak: 0,
    /** distribution[i] = games won on guess i+1 */
    distribution: new Array(MAX_GUESSES).fill(0),
    /** puzzle number of the last completed daily, used to detect broken streaks */
    lastPuzzle: null,
  };
}

const clampInt = (value, min = 0) => {
  const n = Math.trunc(Number(value));
  return Number.isFinite(n) && n >= min ? n : min;
};

/** Normalise anything read from storage into a valid stats record. */
export function reviveStats(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const base = emptyStats();
  const distribution = Array.isArray(raw.distribution) ? raw.distribution : [];
  return {
    played: clampInt(raw.played),
    wins: clampInt(raw.wins),
    currentStreak: clampInt(raw.currentStreak),
    maxStreak: clampInt(raw.maxStreak),
    distribution: base.distribution.map((_, i) => clampInt(distribution[i])),
    lastPuzzle: Number.isInteger(raw.lastPuzzle) ? raw.lastPuzzle : null,
  };
}

function reviveAll(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    [MODE.DAILY]: reviveStats(raw[MODE.DAILY]) ?? emptyStats(),
    [MODE.PRACTICE]: reviveStats(raw[MODE.PRACTICE]) ?? emptyStats(),
  };
}

/** @returns {{daily: object, practice: object}} */
export function loadStats() {
  return storage.read(STORAGE_KEYS.stats, reviveAll, {
    [MODE.DAILY]: emptyStats(),
    [MODE.PRACTICE]: emptyStats(),
  });
}

export function saveStats(all) {
  return storage.write(STORAGE_KEYS.stats, all);
}

/**
 * Fold a finished game into a stats record. Pure: returns a new record.
 *
 * A daily streak survives only if this puzzle directly follows the last one
 * recorded; skipping a day resets it. Practice games have no puzzle number, so
 * their streak is simply consecutive wins.
 *
 * @param {object} stats
 * @param {{won: boolean, guessCount: number, puzzleNumber?: number|null}} result
 */
export function applyResult(stats, { won, guessCount, puzzleNumber = null }) {
  const next = {
    ...stats,
    distribution: [...stats.distribution],
    played: stats.played + 1,
  };

  const continuesStreak = puzzleNumber === null
    || stats.lastPuzzle === null
    || puzzleNumber === stats.lastPuzzle + 1;

  if (won) {
    next.wins += 1;
    const slot = Math.min(Math.max(guessCount, 1), MAX_GUESSES) - 1;
    next.distribution[slot] += 1;
    next.currentStreak = continuesStreak ? stats.currentStreak + 1 : 1;
    next.maxStreak = Math.max(stats.maxStreak, next.currentStreak);
  } else {
    next.currentStreak = 0;
  }

  if (puzzleNumber !== null) next.lastPuzzle = puzzleNumber;
  return next;
}

/** Win rate as a whole percentage. */
export function winPercentage(stats) {
  return stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
}

/** Largest value in the guess distribution, for bar scaling. */
export function distributionPeak(stats) {
  return Math.max(1, ...stats.distribution);
}
