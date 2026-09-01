import test from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS } from '../src/data/answers.js';
import { ALLOWED_GUESSES } from '../src/data/allowed.js';
import {
  answerCount, answerForPuzzle, dailyAnswer, isValidWord, msUntilNextPuzzle,
  puzzleNumberFor, randomAnswer, rejectionReason, validWordCount,
} from '../src/js/dictionary.js';

test('both word lists contain only lowercase five-letter words', () => {
  for (const list of [ANSWERS, ALLOWED_GUESSES]) {
    const bad = list.filter((w) => !/^[a-z]{5}$/.test(w));
    assert.deepEqual(bad, []);
  }
});

test('the lists are deduplicated and disjoint', () => {
  assert.equal(new Set(ANSWERS).size, ANSWERS.length);
  assert.equal(new Set(ALLOWED_GUESSES).size, ALLOWED_GUESSES.length);
  const answers = new Set(ANSWERS);
  assert.equal(ALLOWED_GUESSES.filter((w) => answers.has(w)).length, 0);
  assert.equal(validWordCount, ANSWERS.length + ALLOWED_GUESSES.length);
});

test('every possible answer is also a legal guess', () => {
  assert.ok(ANSWERS.every(isValidWord));
});

test('the answer pool is large enough for years of daily puzzles', () => {
  assert.ok(answerCount > 500, `only ${answerCount} answers`);
});

test('common words are accepted and nonsense is not', () => {
  for (const word of ['crane', 'audio', 'pizza', 'ghost', 'quilt']) {
    assert.ok(isValidWord(word), `${word} should be valid`);
  }
  for (const word of ['zzzzz', 'abcde', 'qwrtp']) {
    assert.ok(!isValidWord(word), `${word} should be invalid`);
  }
});

test('validation is case-insensitive', () => {
  assert.ok(isValidWord('CRANE'));
  assert.equal(rejectionReason('CRANE'), null);
});

test('rejection reasons describe the actual problem', () => {
  assert.equal(rejectionReason('cat'), 'Not enough letters');
  assert.equal(rejectionReason('cranes'), 'Too many letters');
  assert.equal(rejectionReason('cr4ne'), 'Letters only');
  assert.equal(rejectionReason('zzzzz'), 'Not in word list');
  assert.equal(rejectionReason(''), 'Not enough letters');
  assert.equal(rejectionReason(undefined), 'Not enough letters');
});

test('the daily puzzle number advances by one each local day', () => {
  const day = new Date(2026, 5, 10, 9, 30);
  const next = new Date(2026, 5, 11, 1, 5);
  assert.equal(puzzleNumberFor(next) - puzzleNumberFor(day), 1);
});

test('the daily answer is stable for a whole local day', () => {
  const morning = new Date(2026, 5, 10, 0, 0, 1);
  const night = new Date(2026, 5, 10, 23, 59, 59);
  assert.equal(dailyAnswer(morning), dailyAnswer(night));
  assert.notEqual(dailyAnswer(morning), dailyAnswer(new Date(2026, 5, 11, 12)));
});

test('the daily answer is deterministic across "players"', () => {
  const date = new Date(2027, 0, 20, 8);
  const first = dailyAnswer(date);
  const second = dailyAnswer(new Date(date.getTime() + 3 * 3600_000));
  assert.equal(first, second);
});

test('the rotation covers every answer before repeating', () => {
  const seen = new Set();
  for (let n = 1; n <= answerCount; n += 1) seen.add(answerForPuzzle(n));
  assert.equal(seen.size, answerCount);
  assert.equal(answerForPuzzle(answerCount + 1), answerForPuzzle(1));
});

test('the rotation is shuffled rather than following the source order', () => {
  const firstTen = Array.from({ length: 10 }, (_, i) => answerForPuzzle(i + 1));
  assert.notDeepEqual(firstTen, ANSWERS.slice(0, 10));
});

test('puzzle numbers never fall below one', () => {
  assert.equal(puzzleNumberFor(new Date(2000, 0, 1)), 1);
});

test('the countdown stays within one day', () => {
  const ms = msUntilNextPuzzle(new Date(2026, 5, 10, 23, 59, 30));
  assert.ok(ms > 0 && ms <= 30_000);
  assert.ok(msUntilNextPuzzle(new Date(2026, 5, 10, 0, 0, 0)) <= 86_400_000);
});

test('practice words are real answers and never repeat the previous one', () => {
  const answers = new Set(ANSWERS);
  for (let i = 0; i < 200; i += 1) {
    const word = randomAnswer('crane');
    assert.ok(answers.has(word));
    assert.notEqual(word, 'crane');
  }
});

/* --------------------------- safety of the lists -------------------------- */

test('the dictionary is exhaustive enough to accept ordinary words', () => {
  // Words a player would reasonably try, drawn from across the range of what
  // "five-letter English word" covers: everyday, modern, informal, and awkward.
  const shouldAccept = [
    'crane', 'audio', 'ghost', 'quilt', 'pizza', 'zebra', 'jazzy', 'fjord',
    'vodka', 'yacht', 'detox', 'decaf', 'chemo', 'carbs', 'ditzy', 'vibes',
    'pixie', 'squid', 'nymph', 'glyph', 'crypt', 'lymph', 'wharf', 'quirk',
    'axiom', 'zesty', 'oxide', 'jumbo', 'kayak', 'llama', 'onion', 'plaza',
  ];
  const rejected = shouldAccept.filter((w) => !isValidWord(w));
  assert.deepEqual(rejected, [], `these should be valid guesses: ${rejected}`);
});

test('the guess list is large enough to cover the language', () => {
  // Free English dictionaries land between roughly 8,000 and 16,000 five-letter
  // words each; the shipped list unions several, so it should clear all of them.
  assert.ok(validWordCount > 17_000, `only ${validWordCount} words`);
});

test('obvious non-words are still rejected', () => {
  for (const word of ['zzzzz', 'qqqqq', 'aeiou', 'xkcdq', 'bnmzx']) {
    assert.ok(!isValidWord(word), `${word} should not be a valid guess`);
  }
});

test('profanity is excluded from guesses as well as answers', () => {
  // A small, deliberately mild sample of terms present in the source
  // dictionaries and filtered out on the way in. If the profanity filter is
  // ever dropped, these come back and this test catches it.
  for (const word of ['bitch', 'penis', 'boobs', 'shite', 'twats', 'shits']) {
    assert.ok(!isValidWord(word), `${word} must not be accepted`);
  }
});

test('filtering profanity does not take ordinary words with it', () => {
  // These all begin with a profane substring. A stem-matching filter would
  // reject every one of them, which is why the exclusions are an explicit list.
  for (const word of ['title', 'titan', 'tithe', 'asset', 'assay', 'spice', 'spicy', 'cumin', 'butte', 'cocky']) {
    assert.ok(isValidWord(word), `${word} must remain a valid guess`);
  }
});

test('no answer is a proper noun that slipped through curation', () => {
  // A regression guard for names, places and brands the frequency corpus
  // contains in lowercase. `niger` matters most: a country name one letter from
  // a slur, which the wider dictionary admitted until it was blocklisted.
  const answers = new Set(ANSWERS);
  for (const word of ['niger', 'linux', 'emacs', 'texas', 'japan', 'aaron', 'honda']) {
    assert.ok(!answers.has(word), `${word} must not be a puzzle answer`);
  }
});
