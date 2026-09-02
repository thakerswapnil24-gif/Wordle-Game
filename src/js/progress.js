/**
 * The daily puzzle is once a day: today's word, one attempt, and no going back
 * for a word you missed. Two things could quietly break that, so the durable
 * record of how far a player has got lives here rather than in the game state.
 *
 * 1. **A rolled-back device clock.** Nothing stops a player setting the date to
 *    last Tuesday, and the puzzle number is derived from the date. Remembering
 *    the highest number ever reached means a clock that goes backwards simply
 *    keeps serving the puzzle it was already on — the earlier word is never
 *    reachable, and the moment the clock is corrected the count resumes.
 * 2. **A lost game record.** The board for a finished daily is what normally
 *    stops a replay, and it can be evicted (quota, a cleared site, a corrupt
 *    value). The completed puzzle number is a second, much smaller record of
 *    the same fact, so the lock survives losing the first.
 *
 * This is not a security boundary — everything here is in the player's own
 * localStorage and they may clear it. It is here so the rule holds under
 * ordinary use, on a device whose clock happens to be wrong.
 */
import { STORAGE_KEYS } from './config.js';
import * as storage from './storage.js';

/** @typedef {{ highestPuzzle: number, completedPuzzle: number }} Progress */

/** @type {Progress} */
const EMPTY = Object.freeze({ highestPuzzle: 0, completedPuzzle: 0 });

const asCount = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);

/**
 * Validate a stored record. Anything unrecognisable is discarded rather than
 * trusted, which at worst costs the player one lock they had already earned.
 * @param {unknown} raw
 * @returns {Progress|null}
 */
export function reviveProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const highest = asCount(raw.highestPuzzle);
  const completed = asCount(raw.completedPuzzle);
  if (highest === 0 && completed === 0) return null;
  // A completed puzzle is by definition one that was reached.
  return { highestPuzzle: Math.max(highest, completed), completedPuzzle: completed };
}

/** @returns {Progress} */
export function loadProgress() {
  return storage.read(STORAGE_KEYS.progress, reviveProgress, { ...EMPTY });
}

/** @param {Progress} progress */
export function saveProgress(progress) {
  storage.write(STORAGE_KEYS.progress, progress);
}

/**
 * Which daily puzzle to serve, given the number the calendar says it is.
 *
 * @param {number} calendarPuzzle what `puzzleNumberFor()` returns right now
 * @param {Progress} progress
 * @returns {{ puzzleNumber: number, clockBehind: boolean, locked: boolean }}
 */
export function resolveDaily(calendarPuzzle, progress) {
  const puzzleNumber = Math.max(calendarPuzzle, progress.highestPuzzle, 1);
  return {
    puzzleNumber,
    clockBehind: calendarPuzzle < progress.highestPuzzle,
    locked: progress.completedPuzzle >= puzzleNumber,
  };
}

/**
 * Record that the player has reached a puzzle. Only ever moves forward.
 * @param {Progress} progress
 * @param {number} puzzleNumber
 * @returns {Progress} the same object when nothing changed, so callers can skip
 *   a redundant write
 */
export function noteReached(progress, puzzleNumber) {
  if (puzzleNumber <= progress.highestPuzzle) return progress;
  return { ...progress, highestPuzzle: puzzleNumber };
}

/**
 * Record that the player has finished a daily puzzle. Only ever moves forward.
 * @param {Progress} progress
 * @param {number} puzzleNumber
 * @returns {Progress}
 */
export function noteCompleted(progress, puzzleNumber) {
  if (puzzleNumber <= progress.completedPuzzle) return progress;
  return { highestPuzzle: Math.max(progress.highestPuzzle, puzzleNumber), completedPuzzle: puzzleNumber };
}
