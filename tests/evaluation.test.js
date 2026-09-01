import test from 'node:test';
import assert from 'node:assert/strict';
import { TILE } from '../src/js/config.js';
import {
  evaluateGuess, hardModeViolation, letterHintsFor, mergeLetterHints,
} from '../src/js/evaluation.js';

const { CORRECT: G, PRESENT: Y, ABSENT: B } = TILE;

test('a perfect guess is all green', () => {
  assert.deepEqual(evaluateGuess('crane', 'crane'), [G, G, G, G, G]);
});

test('a guess with no shared letters is all grey', () => {
  assert.deepEqual(evaluateGuess('mulch', 'strip'), [B, B, B, B, B]);
});

test('greens and yellows are marked independently', () => {
  //   answer: p a r t y
  //   guess : t a r p s
  assert.deepEqual(evaluateGuess('tarps', 'party'), [Y, G, G, Y, B]);
});

test('duplicate in the guess, single in the answer: only one is marked', () => {
  // ERASE holds two Es, but neither of SPEED's Es is positional.
  assert.deepEqual(evaluateGuess('speed', 'erase'), [Y, B, Y, Y, B]);
  // ABBEY holds two Bs: BOBBY's positional B is green, the leading B takes the
  // one remaining mark, and the third B has nothing left to claim.
  assert.deepEqual(evaluateGuess('bobby', 'abbey'), [Y, B, G, B, G]);
});

test('greens consume the letter budget before yellows', () => {
  // Both real Es of THESE are matched positionally, so the leading Es go grey.
  assert.deepEqual(evaluateGuess('geese', 'these'), [B, B, G, G, G]);
});

test('an earlier duplicate goes grey when a later one is green', () => {
  // LEVEL has two Ls: LOLLY's first is green, the second claims the other, and
  // the third gets nothing.
  assert.deepEqual(evaluateGuess('lolly', 'level'), [G, B, Y, B, B]);
});

test('a triple letter against a double is capped at two marks', () => {
  assert.deepEqual(evaluateGuess('essay', 'sassy'), [B, Y, G, Y, G]);
});

test('evaluation is case-insensitive', () => {
  assert.deepEqual(evaluateGuess('CRANE', 'crane'), [G, G, G, G, G]);
});

test('mismatched lengths are rejected', () => {
  assert.throws(() => evaluateGuess('cat', 'crane'), RangeError);
  assert.throws(() => evaluateGuess(null, 'crane'), TypeError);
});

test('keyboard hints only ever improve', () => {
  let hints = mergeLetterHints({}, 'crane', evaluateGuess('crane', 'brace'));
  assert.equal(hints.c, Y);
  hints = mergeLetterHints(hints, 'clack', evaluateGuess('clack', 'brace'));
  assert.equal(hints.c, G, 'a green C must not be downgraded by a later grey C');
  assert.equal(hints.n, B);
});

test('letterHintsFor rebuilds the same map from a list of guesses', () => {
  const hints = letterHintsFor(['crane', 'clack'], 'brace');
  assert.equal(hints.c, G);
  assert.equal(hints.r, G);
  assert.equal(hints.a, G);
  assert.equal(hints.l, B);
  assert.equal(hints.n, B);
});

test('hard mode requires greens to stay put', () => {
  assert.equal(hardModeViolation('bloom', ['crane'], 'brave'), '2nd letter must be R');
  assert.equal(hardModeViolation('brake', ['crane'], 'brave'), null);
});

test('hard mode requires yellows to be reused', () => {
  // TRAIN against PASTA reveals a misplaced T and a misplaced A.
  assert.equal(hardModeViolation('books', ['train'], 'pasta'), 'Guess must contain T');
  assert.equal(hardModeViolation('salad', ['train'], 'pasta'), 'Guess must contain T');
  assert.equal(hardModeViolation('stall', ['train'], 'pasta'), null);
});

test('hard mode imposes nothing on the first guess', () => {
  assert.equal(hardModeViolation('crane', [], 'pasta'), null);
});
