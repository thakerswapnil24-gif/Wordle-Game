import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUESSES } from '../src/js/config.js';
import {
  applyResult, distributionPeak, emptyStats, reviveStats, winPercentage,
} from '../src/js/stats.js';

test('a fresh record is all zeroes', () => {
  const stats = emptyStats();
  assert.equal(stats.played, 0);
  assert.equal(stats.wins, 0);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.maxStreak, 0);
  assert.deepEqual(stats.distribution, new Array(MAX_GUESSES).fill(0));
  assert.equal(winPercentage(stats), 0, 'no games played must not divide by zero');
});

test('a win increments the right distribution bucket', () => {
  const stats = applyResult(emptyStats(), { won: true, guessCount: 3 });
  assert.equal(stats.played, 1);
  assert.equal(stats.wins, 1);
  assert.equal(stats.distribution[2], 1);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.maxStreak, 1);
  assert.equal(winPercentage(stats), 100);
});

test('a loss counts as played but breaks the streak', () => {
  let stats = applyResult(emptyStats(), { won: true, guessCount: 2 });
  stats = applyResult(stats, { won: false, guessCount: MAX_GUESSES });
  assert.equal(stats.played, 2);
  assert.equal(stats.wins, 1);
  assert.equal(stats.currentStreak, 0);
  assert.equal(stats.maxStreak, 1, 'the best streak is remembered after a loss');
  assert.equal(winPercentage(stats), 50);
});

test('applyResult does not mutate the record it is given', () => {
  const before = emptyStats();
  const snapshot = JSON.stringify(before);
  applyResult(before, { won: true, guessCount: 1 });
  assert.equal(JSON.stringify(before), snapshot);
});

test('consecutive daily puzzles build a streak', () => {
  let stats = emptyStats();
  for (let puzzle = 10; puzzle <= 14; puzzle += 1) {
    stats = applyResult(stats, { won: true, guessCount: 4, puzzleNumber: puzzle });
  }
  assert.equal(stats.currentStreak, 5);
  assert.equal(stats.maxStreak, 5);
  assert.equal(stats.lastPuzzle, 14);
});

test('a skipped day resets the daily streak', () => {
  let stats = applyResult(emptyStats(), { won: true, guessCount: 3, puzzleNumber: 10 });
  stats = applyResult(stats, { won: true, guessCount: 3, puzzleNumber: 11 });
  assert.equal(stats.currentStreak, 2);
  // Puzzle 12 was never played.
  stats = applyResult(stats, { won: true, guessCount: 3, puzzleNumber: 13 });
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.maxStreak, 2);
});

test('practice wins streak without puzzle numbers', () => {
  let stats = emptyStats();
  stats = applyResult(stats, { won: true, guessCount: 2 });
  stats = applyResult(stats, { won: true, guessCount: 5 });
  assert.equal(stats.currentStreak, 2);
  assert.equal(stats.lastPuzzle, null);
});

test('win percentage rounds to whole numbers', () => {
  let stats = emptyStats();
  stats = applyResult(stats, { won: true, guessCount: 1 });
  stats = applyResult(stats, { won: false, guessCount: 6 });
  stats = applyResult(stats, { won: false, guessCount: 6 });
  assert.equal(winPercentage(stats), 33);
});

test('an out-of-range guess count cannot corrupt the distribution', () => {
  const stats = applyResult(emptyStats(), { won: true, guessCount: 99 });
  assert.equal(stats.distribution.length, MAX_GUESSES);
  assert.equal(stats.distribution[MAX_GUESSES - 1], 1);
});

test('the distribution peak is never zero', () => {
  assert.equal(distributionPeak(emptyStats()), 1);
  const stats = applyResult(emptyStats(), { won: true, guessCount: 3 });
  assert.equal(distributionPeak(stats), 1);
});

test('stored statistics are repaired rather than trusted', () => {
  const revived = reviveStats({
    played: -4,
    wins: 'many',
    currentStreak: 2.7,
    maxStreak: null,
    distribution: [1, 2],
    lastPuzzle: 'today',
  });
  assert.equal(revived.played, 0);
  assert.equal(revived.wins, 0);
  assert.equal(revived.currentStreak, 2);
  assert.equal(revived.maxStreak, 0);
  assert.deepEqual(revived.distribution, [1, 2, 0, 0, 0, 0]);
  assert.equal(revived.lastPuzzle, null);
});

test('unusable stored statistics are rejected outright', () => {
  for (const raw of [null, undefined, 'nope', 7]) {
    assert.equal(reviveStats(raw), null);
  }
});

test('hinted wins are counted separately from the win itself', () => {
  // The current rule is that a hinted win counts normally. Recording it anyway
  // is what keeps that rule reversible.
  let stats = applyResult(emptyStats(), { won: true, guessCount: 3, usedHint: true });
  assert.equal(stats.wins, 1);
  assert.equal(stats.currentStreak, 1, 'a hint does not break the streak today');
  assert.equal(stats.distribution[2], 1);
  assert.equal(stats.hintedWins, 1);

  stats = applyResult(stats, { won: true, guessCount: 3 });
  assert.equal(stats.wins, 2);
  assert.equal(stats.hintedWins, 1, 'an unhinted win does not add to the hinted count');
});

test('a hinted loss adds nothing to the hinted win count', () => {
  const stats = applyResult(emptyStats(), { won: false, guessCount: 6, usedHint: true });
  assert.equal(stats.hintedWins, 0);
});

test('stored hinted-win counts are repaired like every other figure', () => {
  assert.equal(reviveStats({ hintedWins: -3 }).hintedWins, 0);
  assert.equal(reviveStats({ hintedWins: 4 }).hintedWins, 4);
});
