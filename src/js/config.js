/**
 * Static configuration shared by every module.
 * Nothing here depends on the DOM, so it is safe to import from tests.
 */

export const BRAND = {
  name: 'Pentaword',
  tagline: 'Five letters. Six tries. One word a day.',
};

/** Board geometry. */
export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

/** Game modes. */
export const MODE = Object.freeze({
  DAILY: 'daily',
  PRACTICE: 'practice',
});

/** Tile / key evaluation states, ordered from least to most informative. */
export const TILE = Object.freeze({
  EMPTY: 'empty',
  ABSENT: 'absent',
  PRESENT: 'present',
  CORRECT: 'correct',
});

/** Game lifecycle. */
export const STATUS = Object.freeze({
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
});

/**
 * Day 0 of the daily puzzle rotation. Every player resolves the same puzzle
 * number for a given local calendar date, so the daily word is universal.
 */
export const DAILY_EPOCH = Object.freeze({ year: 2026, month: 0, day: 1 });

/** Fixed seed for the answer-order shuffle. Changing it reshuffles all dailies. */
export const DAILY_SEED = 0x5175_696e;

/** localStorage keys. Namespaced so the app never collides with other pages. */
export const STORAGE_KEYS = Object.freeze({
  settings: 'pentaword:settings:v1',
  stats: 'pentaword:stats:v1',
  daily: 'pentaword:game:daily:v1',
  practice: 'pentaword:game:practice:v1',
  progress: 'pentaword:daily-progress:v1',
});

/** Animation timings (ms). Mirrored in CSS custom properties. */
export const TIMING = Object.freeze({
  flipStagger: 260,
  flipDuration: 520,
  shake: 560,
  winBounce: 1100,
  toast: 1600,
});
