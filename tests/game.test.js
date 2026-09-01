import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_GUESSES, MODE, STATUS, TILE, WORD_LENGTH } from '../src/js/config.js';
import { Game, reviveGame } from '../src/js/game.js';

const newGame = (overrides = {}) => new Game({
  mode: MODE.PRACTICE,
  answer: 'crane',
  ...overrides,
});

const type = (game, word) => {
  for (const letter of word) game.addLetter(letter);
  return game;
};

test('a new game starts empty and playable', () => {
  const game = newGame();
  assert.equal(game.status, STATUS.PLAYING);
  assert.equal(game.isOver, false);
  assert.equal(game.rowIndex, 0);
  assert.equal(game.board.length, MAX_GUESSES);
  assert.equal(game.board[0].length, WORD_LENGTH);
});

test('the answer must be five letters', () => {
  assert.throws(() => new Game({ mode: MODE.PRACTICE, answer: 'cat' }), RangeError);
});

test('typing fills the active row and stops at five letters', () => {
  const game = type(newGame(), 'audio');
  assert.equal(game.addLetter('x'), false, 'a sixth letter must be rejected');
  assert.equal(game.draft, 'audio');
  assert.deepEqual(game.board[0].map((c) => c.letter), ['a', 'u', 'd', 'i', 'o']);
});

test('non-letters are ignored', () => {
  const game = newGame();
  assert.equal(game.addLetter('1'), false);
  assert.equal(game.addLetter('-'), false);
  assert.equal(game.addLetter(''), false);
  assert.equal(game.draft, '');
});

test('backspace removes one letter and stops at empty', () => {
  const game = type(newGame(), 'au');
  assert.equal(game.deleteLetter(), true);
  assert.equal(game.deleteLetter(), true);
  assert.equal(game.deleteLetter(), false);
  assert.equal(game.draft, '');
});

test('a short guess is rejected without consuming a row', () => {
  const game = type(newGame(), 'cat');
  const result = game.submit();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'Not enough letters');
  assert.equal(game.rowIndex, 0);
  assert.equal(game.draft, 'cat', 'the draft survives a rejected submit');
});

test('a non-dictionary guess is rejected without consuming a row', () => {
  const game = type(newGame(), 'zzzzz');
  assert.deepEqual(game.submit(), { ok: false, reason: 'Not in word list' });
  assert.equal(game.rowIndex, 0);
});

test('a valid guess is scored and advances the board', () => {
  const game = type(newGame(), 'audio');
  const result = game.submit();
  assert.equal(result.ok, true);
  assert.equal(result.row, 0);
  assert.equal(result.guess, 'audio');
  assert.deepEqual(result.states, [TILE.PRESENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT, TILE.ABSENT]);
  assert.equal(game.rowIndex, 1);
  assert.equal(game.draft, '');
});

test('guessing the answer wins immediately', () => {
  const game = type(newGame(), 'crane');
  const result = game.submit();
  assert.equal(result.status, STATUS.WON);
  assert.equal(game.isOver, true);
  assert.equal(game.guessCount, 1);
});

test('six wrong guesses lose the game', () => {
  const game = newGame();
  for (const word of ['audio', 'plumb', 'gifts', 'wryly', 'hotel', 'stove']) {
    type(game, word);
    assert.equal(game.submit().ok, true);
  }
  assert.equal(game.status, STATUS.LOST);
  assert.equal(game.answer, 'crane');
  assert.equal(game.guessCount, MAX_GUESSES);
});

test('a finished game accepts no further input', () => {
  const game = type(newGame(), 'crane');
  game.submit();
  assert.equal(game.addLetter('a'), false);
  assert.equal(game.deleteLetter(), false);
  assert.equal(game.submit().ok, false);
});

test('the board reports the state of every completed row', () => {
  const game = type(newGame(), 'canoe');
  game.submit();
  const row = game.board[0];
  assert.deepEqual(row.map((c) => c.letter), ['c', 'a', 'n', 'o', 'e']);
  assert.equal(row[0].state, TILE.CORRECT);
  assert.equal(row[4].state, TILE.CORRECT);
  assert.equal(row[3].state, TILE.ABSENT);
});

test('keyboard hints accumulate across guesses', () => {
  const game = newGame();
  type(game, 'canoe');
  game.submit();
  assert.equal(game.letterHints.c, TILE.CORRECT);
  assert.equal(game.letterHints.o, TILE.ABSENT);
  assert.equal(game.letterHints.a, TILE.PRESENT);
});

test('hard mode blocks a guess that drops a revealed hint', () => {
  const game = newGame({ hardMode: true });
  type(game, 'canoe');
  game.submit();
  type(game, 'ghost');
  const result = game.submit();
  assert.equal(result.ok, false);
  assert.equal(result.reason, '1st letter must be C');
  assert.equal(game.rowIndex, 1, 'the rejected guess must not consume a row');
});

test('hard mode allows a guess that keeps every hint', () => {
  const game = newGame({ hardMode: true });
  type(game, 'canoe');
  game.submit();
  type(game, 'crane');
  assert.equal(game.submit().ok, true);
});

/* ----------------------------- persistence -------------------------------- */

test('a game round-trips through JSON', () => {
  const game = newGame({ puzzleNumber: 12, mode: MODE.DAILY });
  type(game, 'audio');
  game.submit();
  const revived = reviveGame(JSON.parse(JSON.stringify(game)), { mode: MODE.DAILY });
  assert.equal(revived.answer, game.answer);
  assert.deepEqual(revived.guesses, game.guesses);
  assert.equal(revived.puzzleNumber, 12);
  assert.equal(revived.status, STATUS.PLAYING);
});

test('a finished game keeps its outcome when revived', () => {
  const game = newGame();
  type(game, 'crane');
  game.submit();
  game.recorded = true;
  const revived = reviveGame(JSON.parse(JSON.stringify(game)), { mode: MODE.PRACTICE });
  assert.equal(revived.status, STATUS.WON);
  assert.equal(revived.recorded, true, 'a restored win must not be counted twice');
});

test('stored data for a different puzzle or answer is discarded', () => {
  const game = newGame({ mode: MODE.DAILY, puzzleNumber: 7 });
  const raw = JSON.parse(JSON.stringify(game));
  assert.equal(reviveGame(raw, { mode: MODE.DAILY, expectedPuzzle: 8 }), null);
  assert.equal(reviveGame(raw, { mode: MODE.DAILY, expectedAnswer: 'audio' }), null);
  assert.equal(reviveGame(raw, { mode: MODE.PRACTICE }), null);
  assert.ok(reviveGame(raw, { mode: MODE.DAILY, expectedPuzzle: 7, expectedAnswer: 'crane' }));
});

test('corrupt stored data is discarded rather than crashing', () => {
  const cases = [
    null, undefined, 42, 'nope', {}, { mode: MODE.DAILY },
    { mode: MODE.DAILY, answer: 'nope' },
    { mode: MODE.DAILY, answer: 'crane', guesses: 'audio' },
    { mode: MODE.DAILY, answer: 'crane', guesses: ['audio', 12] },
    { mode: MODE.DAILY, answer: 'crane', guesses: ['AUDIO'] },
    { mode: MODE.DAILY, answer: 'crane', guesses: new Array(9).fill('audio') },
  ];
  for (const raw of cases) {
    assert.equal(reviveGame(raw, { mode: MODE.DAILY }), null, JSON.stringify(raw));
  }
});

/* ------------------------------- hints ------------------------------------ */

test('a hint reveals a letter the player has not worked out', () => {
  const game = newGame();
  assert.equal(game.canHint, true);
  const hint = game.revealHint();
  assert.ok(hint, 'a fresh game always has something to reveal');
  assert.equal(hint.letter, 'crane'[hint.index]);
  assert.deepEqual(game.hints, [hint.index]);
  assert.equal(game.usedHint, true);
});

test('hints never re-reveal a letter already solved by a green tile', () => {
  const game = newGame();
  type(game, 'canoe'); // C and E land green
  game.submit();
  const solved = [0, 4];
  for (let i = 0; i < 3; i += 1) {
    const hint = game.revealHint();
    if (!hint) break;
    assert.ok(!solved.includes(hint.index), `position ${hint.index} was already known`);
  }
});

test('hints never repeat a position', () => {
  const game = newGame();
  const seen = new Set();
  let hint = game.revealHint();
  while (hint) {
    assert.ok(!seen.has(hint.index), 'a position was revealed twice');
    seen.add(hint.index);
    hint = game.revealHint();
  }
  assert.equal(seen.size, WORD_LENGTH);
  assert.equal(game.canHint, false, 'nothing left to reveal');
});

test('a finished game gives no more hints', () => {
  const game = type(newGame(), 'crane');
  game.submit();
  assert.equal(game.canHint, false);
  assert.equal(game.revealHint(), null);
});

test('the hint row shows revealed letters in place', () => {
  const game = newGame();
  const { index, letter } = game.revealHint();
  const row = game.hintRow;
  assert.equal(row.length, WORD_LENGTH);
  assert.equal(row[index], letter);
  assert.equal(row.filter(Boolean).length, 1);
});

test('hints survive being saved and restored', () => {
  const game = newGame({ mode: MODE.DAILY, puzzleNumber: 5 });
  game.revealHint();
  game.revealHint();
  const revived = reviveGame(JSON.parse(JSON.stringify(game)), { mode: MODE.DAILY });
  assert.deepEqual(revived.hints, game.hints);
  assert.equal(revived.usedHint, true);
});

test('corrupt hint data is rejected rather than trusted', () => {
  const raw = JSON.parse(JSON.stringify(newGame({ mode: MODE.DAILY })));
  assert.equal(reviveGame({ ...raw, hints: 'lots' }, { mode: MODE.DAILY }), null);
  // Out-of-range indices are dropped rather than failing the whole save.
  const revived = reviveGame({ ...raw, hints: [0, 99, -1, 2, 2] }, { mode: MODE.DAILY });
  assert.deepEqual(revived.hints, [0, 2]);
});
