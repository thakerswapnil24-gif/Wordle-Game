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
