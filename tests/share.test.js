import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE } from '../src/js/config.js';
import { Game } from '../src/js/game.js';
import { buildGrid, buildShareText } from '../src/js/share.js';

function play(answer, guesses, options = {}) {
  const game = new Game({ mode: MODE.DAILY, answer, puzzleNumber: 42, ...options });
  for (const guess of guesses) {
    for (const letter of guess) game.addLetter(letter);
    const result = game.submit();
    assert.equal(result.ok, true, `${guess} should be a legal guess`);
  }
  return game;
}

test('the grid mirrors the tile colours row by row', () => {
  const game = play('crane', ['audio', 'crane']);
  assert.equal(buildGrid(game), '🟨⬜⬜⬜⬜\n🟩🟩🟩🟩🟩');
});

test('dark mode swaps the blank square so it stays visible', () => {
  const game = play('crane', ['audio']);
  assert.ok(buildGrid(game, { darkMode: true }).includes('⬛'));
  assert.ok(!buildGrid(game, { darkMode: true }).includes('⬜'));
});

test('high contrast sharing uses blue and orange', () => {
  const game = play('crane', ['canoe']);
  const grid = buildGrid(game, { highContrast: true });
  assert.ok(grid.includes('🟦'), 'correct letters share as blue squares');
  assert.ok(grid.includes('🟧'), 'misplaced letters share as orange squares');
  assert.ok(!grid.includes('🟩'));
});

test('the share text carries the score but never the answer', () => {
  const game = play('crane', ['audio', 'canoe', 'crane']);
  const text = buildShareText(game);
  assert.ok(text.startsWith('Quintle #42 3/6'));
  assert.equal(text.toLowerCase().includes('crane'), false, 'the answer must not leak');
  assert.equal(text.toLowerCase().includes('audio'), false, 'guesses must not leak');
  assert.equal(text.split('\n').filter(Boolean).length, 4);
});

test('a loss shares as X/6', () => {
  const game = play('crane', ['audio', 'plumb', 'gifts', 'wryly', 'hotel', 'stove']);
  assert.ok(buildShareText(game).startsWith('Quintle #42 X/6'));
});

test('hard mode is marked with an asterisk', () => {
  const game = play('crane', ['crane'], { hardMode: true });
  assert.ok(buildShareText(game).startsWith('Quintle #42 1/6*'));
});

test('practice results share without a puzzle number', () => {
  const game = new Game({ mode: MODE.PRACTICE, answer: 'crane' });
  for (const letter of 'crane') game.addLetter(letter);
  game.submit();
  assert.ok(buildShareText(game).startsWith('Quintle Practice 1/6'));
});
