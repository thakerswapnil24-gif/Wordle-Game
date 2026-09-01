/**
 * Pure scoring logic. No DOM, no storage, no randomness — everything in this
 * module is a deterministic function of its arguments, which is what makes the
 * duplicate-letter rules straightforward to test.
 */
import { TILE, WORD_LENGTH } from './config.js';

/** How much information each state carries; used when merging keyboard hints. */
const RANK = { [TILE.EMPTY]: 0, [TILE.ABSENT]: 1, [TILE.PRESENT]: 2, [TILE.CORRECT]: 3 };

/**
 * Score a guess against the answer using standard two-pass marking.
 *
 * Pass 1 locks in exact positional matches and consumes those letters from the
 * answer's letter budget. Pass 2 hands out "present" marks only while budget
 * remains, which is what produces the expected behaviour for duplicates:
 * guessing SPEED against ERASE marks only one E as present, and guessing
 * GEESE against THESE greys the first E because both real Es are already green.
 *
 * @param {string} guess  5-letter lowercase word
 * @param {string} answer 5-letter lowercase word
 * @returns {string[]} one TILE state per letter
 */
export function evaluateGuess(guess, answer) {
  if (typeof guess !== 'string' || typeof answer !== 'string') {
    throw new TypeError('evaluateGuess expects two strings');
  }
  const g = guess.toLowerCase();
  const a = answer.toLowerCase();
  if (g.length !== a.length) {
    throw new RangeError(`guess and answer must be the same length (got ${g.length} and ${a.length})`);
  }

  const result = new Array(g.length).fill(TILE.ABSENT);
  const remaining = new Map();

  for (let i = 0; i < g.length; i += 1) {
    if (g[i] === a[i]) {
      result[i] = TILE.CORRECT;
    } else {
      remaining.set(a[i], (remaining.get(a[i]) ?? 0) + 1);
    }
  }

  for (let i = 0; i < g.length; i += 1) {
    if (result[i] === TILE.CORRECT) continue;
    const left = remaining.get(g[i]) ?? 0;
    if (left > 0) {
      result[i] = TILE.PRESENT;
      remaining.set(g[i], left - 1);
    }
  }

  return result;
}

/**
 * Fold a scored guess into the running per-letter knowledge shown on the
 * keyboard. A letter never loses information: once green it stays green.
 *
 * @param {Record<string,string>} hints existing letter -> TILE map (not mutated)
 * @param {string} guess
 * @param {string[]} states result of {@link evaluateGuess}
 * @returns {Record<string,string>} a new map
 */
export function mergeLetterHints(hints, guess, states) {
  const next = { ...hints };
  for (let i = 0; i < guess.length; i += 1) {
    const letter = guess[i];
    const current = next[letter] ?? TILE.EMPTY;
    if (RANK[states[i]] > RANK[current]) next[letter] = states[i];
  }
  return next;
}

/** Build the keyboard hint map from scratch for a list of scored guesses. */
export function letterHintsFor(guesses, answer) {
  return guesses.reduce(
    (hints, guess) => mergeLetterHints(hints, guess, evaluateGuess(guess, answer)),
    {},
  );
}

/**
 * Hard mode: every revealed hint must be reused in the next guess.
 *
 * @returns {string|null} a human-readable reason, or null when the guess is legal
 */
export function hardModeViolation(guess, previousGuesses, answer) {
  if (previousGuesses.length === 0) return null;
  const last = previousGuesses[previousGuesses.length - 1];
  const states = evaluateGuess(last, answer);

  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (states[i] === TILE.CORRECT && guess[i] !== last[i]) {
      return `${ordinal(i + 1)} letter must be ${last[i].toUpperCase()}`;
    }
  }

  // Count how many of each letter the previous guess proved to exist.
  const required = new Map();
  for (let i = 0; i < WORD_LENGTH; i += 1) {
    if (states[i] === TILE.PRESENT || states[i] === TILE.CORRECT) {
      required.set(last[i], (required.get(last[i]) ?? 0) + 1);
    }
  }
  for (const letter of guess) {
    const left = required.get(letter);
    if (left) required.set(letter, left - 1);
  }
  for (const [letter, missing] of required) {
    if (missing > 0) return `Guess must contain ${letter.toUpperCase()}`;
  }

  return null;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
function ordinal(n) {
  return ORDINALS[n - 1] ?? `${n}th`;
}
