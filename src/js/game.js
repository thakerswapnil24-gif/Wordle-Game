/**
 * The game state machine.
 *
 * A Game owns exactly one puzzle: its answer, the guesses made so far, the
 * letters currently being typed, and whether play is over. It knows nothing
 * about the DOM — the UI observes it and renders. Every mutation returns a
 * small result object describing what happened so the controller can animate
 * and report accordingly.
 */
import { MAX_GUESSES, MODE, STATUS, TILE, WORD_LENGTH } from './config.js';
import { evaluateGuess, hardModeViolation, letterHintsFor } from './evaluation.js';
import { rejectionReason } from './dictionary.js';

export class Game {
  /**
   * @param {{mode: string, answer: string, puzzleNumber?: number|null,
   *          guesses?: string[], hardMode?: boolean, recorded?: boolean,
   *          hints?: number[]}} options
   */
  constructor({
    mode, answer, puzzleNumber = null, guesses = [], hardMode = false, recorded = false, hints = [],
  }) {
    if (!answer || answer.length !== WORD_LENGTH) {
      throw new RangeError(`answer must be ${WORD_LENGTH} letters`);
    }
    this.mode = mode;
    this.answer = answer.toLowerCase();
    this.puzzleNumber = puzzleNumber;
    this.hardMode = Boolean(hardMode);
    /** Set once the result has been folded into the statistics, so that
     *  reloading a finished puzzle never counts it twice. */
    this.recorded = Boolean(recorded);
    /**
     * Positions revealed by a hint, as indices into the answer.
     *
     * Recorded per game, and counted in the statistics, from the day hints
     * exist — even though a hinted win currently counts exactly like any other.
     * Storing it costs nothing now and means the rule can be tightened later
     * without a player's recorded history becoming a lie.
     */
    this.hints = [...new Set(hints)].filter((i) => Number.isInteger(i) && i >= 0 && i < WORD_LENGTH);
    this.guesses = [];
    this.draft = '';
    this.status = STATUS.PLAYING;
    // Replay any restored guesses through the same code path as live play so
    // there is only one place where win/loss is decided.
    for (const guess of guesses) {
      if (this.status !== STATUS.PLAYING) break;
      this.guesses.push(guess.toLowerCase());
      this.#settle();
    }
  }

  get isOver() {
    return this.status !== STATUS.PLAYING;
  }

  get rowIndex() {
    return this.guesses.length;
  }

  get guessCount() {
    return this.guesses.length;
  }

  /** Whether any letter in this game was revealed rather than deduced. */
  get usedHint() {
    return this.hints.length > 0;
  }

  /**
   * Positions a hint could still usefully reveal: not already solved by a green
   * tile, and not already hinted.
   */
  get hintablePositions() {
    const solved = new Set(this.hints);
    for (const guess of this.guesses) {
      for (let i = 0; i < WORD_LENGTH; i += 1) {
        if (guess[i] === this.answer[i]) solved.add(i);
      }
    }
    const open = [];
    for (let i = 0; i < WORD_LENGTH; i += 1) if (!solved.has(i)) open.push(i);
    return open;
  }

  /** Whether a hint would tell the player anything they do not already know. */
  get canHint() {
    return !this.isOver && this.hintablePositions.length > 0;
  }

  /** The letters revealed so far, as a sparse row for display. */
  get hintRow() {
    return Array.from({ length: WORD_LENGTH }, (_, i) => (
      this.hints.includes(i) ? this.answer[i] : ''
    ));
  }

  /**
   * Reveal one unsolved letter.
   *
   * Chosen at random among the positions the player has not worked out, so a
   * second hint cannot be predicted from the first.
   *
   * @returns {{index: number, letter: string}|null} null when nothing is left to reveal
   */
  revealHint() {
    const open = this.hintablePositions;
    if (this.isOver || open.length === 0) return null;
    const index = open[Math.floor(Math.random() * open.length)];
    this.hints.push(index);
    return { index, letter: this.answer[index] };
  }

  /** Scored states for every submitted guess. */
  get evaluations() {
    return this.guesses.map((guess) => evaluateGuess(guess, this.answer));
  }

  /** letter -> TILE map for keyboard hints. */
  get letterHints() {
    return letterHintsFor(this.guesses, this.answer);
  }

  /** The board as `MAX_GUESSES` rows of `WORD_LENGTH` cells. */
  get board() {
    const rows = [];
    for (let r = 0; r < MAX_GUESSES; r += 1) {
      const guess = this.guesses[r];
      if (guess) {
        const states = evaluateGuess(guess, this.answer);
        rows.push([...guess].map((letter, i) => ({ letter, state: states[i] })));
      } else if (r === this.rowIndex && !this.isOver) {
        rows.push(Array.from({ length: WORD_LENGTH }, (_, i) => ({
          letter: this.draft[i] ?? '',
          state: TILE.EMPTY,
        })));
      } else {
        rows.push(Array.from({ length: WORD_LENGTH }, () => ({ letter: '', state: TILE.EMPTY })));
      }
    }
    return rows;
  }

  /** @returns {boolean} whether the letter was accepted. */
  addLetter(letter) {
    if (this.isOver) return false;
    if (!/^[a-zA-Z]$/.test(letter)) return false;
    if (this.draft.length >= WORD_LENGTH) return false;
    this.draft += letter.toLowerCase();
    return true;
  }

  /** @returns {boolean} whether a letter was removed. */
  deleteLetter() {
    if (this.isOver || this.draft.length === 0) return false;
    this.draft = this.draft.slice(0, -1);
    return true;
  }

  /**
   * Attempt to submit the current draft.
   * @returns {{ok: boolean, reason?: string, guess?: string, states?: string[],
   *            row?: number, status?: string, answer?: string}}
   */
  submit() {
    if (this.isOver) return { ok: false, reason: 'Game already finished' };

    const guess = this.draft;
    const reason = rejectionReason(guess);
    if (reason) return { ok: false, reason };

    if (this.hardMode) {
      const violation = hardModeViolation(guess, this.guesses, this.answer);
      if (violation) return { ok: false, reason: violation };
    }

    const row = this.guesses.length;
    this.guesses.push(guess);
    this.draft = '';
    this.#settle();

    return {
      ok: true,
      guess,
      row,
      states: evaluateGuess(guess, this.answer),
      status: this.status,
      answer: this.answer,
    };
  }

  /** Decide whether the game has ended after the latest guess. */
  #settle() {
    const last = this.guesses[this.guesses.length - 1];
    if (last === this.answer) this.status = STATUS.WON;
    else if (this.guesses.length >= MAX_GUESSES) this.status = STATUS.LOST;
  }

  /** A plain object suitable for JSON storage. */
  toJSON() {
    return {
      mode: this.mode,
      answer: this.answer,
      puzzleNumber: this.puzzleNumber,
      guesses: this.guesses,
      hardMode: this.hardMode,
      recorded: this.recorded,
      hints: this.hints,
      status: this.status,
    };
  }
}

/**
 * Rebuild a Game from stored data, rejecting anything that does not describe a
 * coherent puzzle (corrupted storage, a hand-edited value, an older schema).
 *
 * @param {unknown} raw
 * @param {{mode: string, expectedAnswer?: string, expectedPuzzle?: number|null}} expectations
 * @returns {Game|null}
 */
export function reviveGame(raw, { mode, expectedAnswer = null, expectedPuzzle = null }) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.mode !== mode) return null;
  if (typeof raw.answer !== 'string' || raw.answer.length !== WORD_LENGTH) return null;
  if (expectedAnswer && raw.answer !== expectedAnswer) return null;
  if (expectedPuzzle !== null && raw.puzzleNumber !== expectedPuzzle) return null;

  if (raw.guesses !== undefined && !Array.isArray(raw.guesses)) return null;
  if (raw.hints !== undefined && !Array.isArray(raw.hints)) return null;
  const guesses = raw.guesses ?? [];
  if (guesses.length > MAX_GUESSES) return null;
  if (!guesses.every((g) => typeof g === 'string' && /^[a-z]{5}$/.test(g))) return null;

  try {
    return new Game({
      mode,
      answer: raw.answer,
      puzzleNumber: raw.puzzleNumber ?? null,
      guesses,
      hardMode: Boolean(raw.hardMode),
      recorded: Boolean(raw.recorded),
      hints: raw.hints ?? [],
    });
  } catch {
    return null;
  }
}

export { MODE, STATUS };
