/**
 * Word system: which words may be guessed, and which word is today's answer.
 *
 * Three lists are kept deliberately separate:
 *   ANSWERS         — common, inoffensive words that can be the solution.
 *   DAILY_ANSWERS   — the harder subset of ANSWERS reserved for the daily.
 *   ALLOWED_GUESSES — everything else the dictionary accepts as a legal guess.
 * The union of ANSWERS and ALLOWED_GUESSES is the validation set; only ANSWERS
 * ever becomes a solution, and only DAILY_ANSWERS ever becomes a daily one.
 */
import { ANSWERS, DAILY_ANSWERS } from '../data/answers.js';
import { ALLOWED_GUESSES } from '../data/allowed.js';
import { DAILY_EPOCH, DAILY_SEED, WORD_LENGTH } from './config.js';

const VALID_WORDS = new Set([...ANSWERS, ...ALLOWED_GUESSES]);

export const answerCount = ANSWERS.length;
export const dailyAnswerCount = DAILY_ANSWERS.length;
export const validWordCount = VALID_WORDS.size;

/** @returns {boolean} true when `word` may be submitted as a guess. */
export function isValidWord(word) {
  return typeof word === 'string' && VALID_WORDS.has(word.toLowerCase());
}

/**
 * Why a guess cannot be submitted, or null when it is fine.
 * @param {string} word
 */
export function rejectionReason(word) {
  const w = String(word ?? '').toLowerCase();
  if (w.length < WORD_LENGTH) return 'Not enough letters';
  if (w.length > WORD_LENGTH) return 'Too many letters';
  if (!/^[a-z]+$/.test(w)) return 'Letters only';
  if (!isValidWord(w)) return 'Not in word list';
  return null;
}

/* -------------------------------------------------------------------------- */
/* Daily rotation                                                             */
/* -------------------------------------------------------------------------- */

/** Small, fast, deterministic PRNG (mulberry32). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The daily draws from DAILY_ANSWERS — the words the generator scored as
 * hardest, by how many near-neighbours they have (SHELL/SMELL/SPELL), repeated
 * letters, rare letters, few vowels and lower frequency. Practice keeps the
 * whole ANSWERS list, so it stays varied and is on average the gentler mode.
 *
 * DAILY_ANSWERS is ordered by word frequency, which would make the rotation
 * start easy and get steadily more obscure. A seeded Fisher-Yates shuffle fixes
 * that while keeping the sequence identical for every player, forever.
 */
const ROTATION = (() => {
  const words = [...DAILY_ANSWERS];
  const random = mulberry32(DAILY_SEED);
  for (let i = words.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [words[i], words[j]] = [words[j], words[i]];
  }
  return words;
})();

const MS_PER_DAY = 86_400_000;

/** Local midnight for the given date, as a timestamp. */
function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * The puzzle number for a date, counted in *local* days from the epoch so the
 * puzzle changes at the player's midnight rather than at UTC midnight.
 * @param {Date} [date]
 * @returns {number} 1-based puzzle number (clamped to at least 1)
 */
export function puzzleNumberFor(date = new Date()) {
  const epoch = new Date(DAILY_EPOCH.year, DAILY_EPOCH.month, DAILY_EPOCH.day).getTime();
  const days = Math.round((startOfDay(date) - epoch) / MS_PER_DAY);
  return Math.max(1, days + 1);
}

/** The answer for a puzzle number. Wraps around once the rotation is exhausted. */
export function answerForPuzzle(puzzleNumber) {
  const index = ((puzzleNumber - 1) % ROTATION.length + ROTATION.length) % ROTATION.length;
  return ROTATION[index];
}

/** Today's daily answer. */
export function dailyAnswer(date = new Date()) {
  return answerForPuzzle(puzzleNumberFor(date));
}

/** Milliseconds remaining until the next daily puzzle unlocks (local midnight). */
export function msUntilNextPuzzle(now = new Date()) {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
  return Math.max(0, nextMidnight - now.getTime());
}

/** A uniformly random answer from the full pool, for practice mode. */
export function randomAnswer(exclude) {
  if (ANSWERS.length === 1) return ANSWERS[0];
  let word;
  do {
    word = ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
  } while (word === exclude);
  return word;
}
