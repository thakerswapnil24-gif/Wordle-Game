import test from 'node:test';
import assert from 'node:assert/strict';
import {
  noteCompleted, noteReached, resolveDaily, reviveProgress,
} from '../src/js/progress.js';

const fresh = () => ({ highestPuzzle: 0, completedPuzzle: 0 });

test('a fresh player simply gets today\'s puzzle', () => {
  const resolved = resolveDaily(42, fresh());
  assert.deepEqual(resolved, { puzzleNumber: 42, clockBehind: false, locked: false });
});

test('reaching a puzzle is recorded once and only moves forward', () => {
  const start = fresh();
  const reached = noteReached(start, 42);
  assert.equal(reached.highestPuzzle, 42);
  // Same object back means "nothing changed" — the caller skips the write.
  assert.equal(noteReached(reached, 42), reached);
  assert.equal(noteReached(reached, 7), reached);
  assert.equal(noteReached(reached, 43).highestPuzzle, 43);
});

test('a finished daily locks that puzzle number', () => {
  const done = noteCompleted(noteReached(fresh(), 42), 42);
  assert.equal(resolveDaily(42, done).locked, true);
});

test('the lock lifts when the next day arrives', () => {
  const done = noteCompleted(noteReached(fresh(), 42), 42);
  const tomorrow = resolveDaily(43, done);
  assert.equal(tomorrow.puzzleNumber, 43);
  assert.equal(tomorrow.locked, false);
  assert.equal(tomorrow.clockBehind, false);
});

test('winding the clock back does not hand out an earlier puzzle', () => {
  // The whole point of the high-water mark: puzzle 36's word must stay
  // unreachable once the player has been given puzzle 42.
  const done = noteCompleted(noteReached(fresh(), 42), 42);
  const rolledBack = resolveDaily(36, done);
  assert.equal(rolledBack.puzzleNumber, 42, 'must not serve the earlier puzzle');
  assert.equal(rolledBack.clockBehind, true);
  assert.equal(rolledBack.locked, true, 'the played puzzle stays played');
});

test('winding the clock back mid-game keeps the game in progress', () => {
  const started = noteReached(fresh(), 42);
  const rolledBack = resolveDaily(30, started);
  assert.equal(rolledBack.puzzleNumber, 42);
  assert.equal(rolledBack.locked, false, 'an unfinished daily is still playable');
});

test('correcting the clock resumes the normal count', () => {
  const done = noteCompleted(noteReached(fresh(), 42), 42);
  resolveDaily(36, done); // a spell with the clock wrong changes nothing stored
  assert.equal(resolveDaily(50, done).puzzleNumber, 50);
  assert.equal(resolveDaily(50, done).locked, false);
});

test('completing a puzzle also records it as reached', () => {
  const done = noteCompleted(fresh(), 42);
  assert.equal(done.highestPuzzle, 42);
  assert.equal(noteCompleted(done, 42), done);
  assert.equal(noteCompleted(done, 7), done);
});

test('a puzzle number is never below one, even with no history', () => {
  assert.equal(resolveDaily(0, fresh()).puzzleNumber, 1);
  assert.equal(resolveDaily(-5, fresh()).puzzleNumber, 1);
});

/* ------------------------------ stored data ------------------------------ */

test('unusable stored records are discarded rather than trusted', () => {
  for (const raw of [null, undefined, 'nope', 7, [], [1, 2], {}, { highestPuzzle: 0 }]) {
    assert.equal(reviveProgress(raw), null, `${JSON.stringify(raw)} should not revive`);
  }
});

test('nonsense fields are dropped without taking the record with them', () => {
  assert.deepEqual(reviveProgress({ highestPuzzle: 42, completedPuzzle: 'yesterday' }),
    { highestPuzzle: 42, completedPuzzle: 0 });
  assert.deepEqual(reviveProgress({ highestPuzzle: -3, completedPuzzle: 42 }),
    { highestPuzzle: 42, completedPuzzle: 42 });
  assert.deepEqual(reviveProgress({ highestPuzzle: 1.5, completedPuzzle: 4 }),
    { highestPuzzle: 4, completedPuzzle: 4 });
  assert.deepEqual(reviveProgress({ highestPuzzle: Infinity, completedPuzzle: 4 }),
    { highestPuzzle: 4, completedPuzzle: 4 });
});

test('a valid record round-trips', () => {
  const record = { highestPuzzle: 88, completedPuzzle: 87 };
  assert.deepEqual(reviveProgress(JSON.parse(JSON.stringify(record))), record);
});
