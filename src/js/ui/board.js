/**
 * Board rendering and tile animation.
 *
 * The board is a pure view of a Game: `render` paints whatever state the game
 * is in, and the animation helpers are separate so the controller can choose
 * when a change should be revealed dramatically rather than instantly.
 */
import { MAX_GUESSES, TILE, TIMING, WORD_LENGTH } from '../config.js';

/** Tiles stop growing past this so the board stays elegant on large screens. */
const MAX_TILE_SIZE = 68;
/** Floor for very short viewports; the landscape layout keeps us well above it. */
const MIN_TILE_SIZE = 20;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export class Board {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.rows = [];
    this.#build();
    this.#watchSize();
  }

  /**
   * Size the tiles from the space actually available.
   *
   * Pure CSS cannot express "as big as possible, but the whole grid must fit
   * between the header and the keyboard" across the range of phone, tablet and
   * desktop shapes we support — especially on iOS, where the visible viewport
   * changes as the browser chrome collapses. Observing the play area and
   * publishing a single `--tile-size` keeps every device pixel-perfect.
   */
  #watchSize() {
    const parent = this.root.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const fit = () => {
      const styles = getComputedStyle(this.root);
      const gap = parseFloat(styles.getPropertyValue('--tile-gap')) || 6;
      const { width, height } = parent.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const padding = parseFloat(getComputedStyle(parent).paddingTop) * 2;
      const byWidth = (width - gap * (WORD_LENGTH - 1)) / WORD_LENGTH;
      const byHeight = (height - padding - gap * (MAX_GUESSES - 1)) / MAX_GUESSES;
      const size = Math.max(MIN_TILE_SIZE, Math.min(byWidth, byHeight, MAX_TILE_SIZE));
      this.root.style.setProperty('--tile-size', `${Math.floor(size)}px`);
    };
    this.observer = new ResizeObserver(fit);
    this.observer.observe(parent);
    fit();
  }

  #build() {
    this.root.textContent = '';
    this.root.setAttribute('role', 'grid');
    this.root.setAttribute('aria-label', `Guess grid, ${MAX_GUESSES} rows of ${WORD_LENGTH} letters`);

    for (let r = 0; r < MAX_GUESSES; r += 1) {
      const row = document.createElement('div');
      row.className = 'board__row';
      row.setAttribute('role', 'row');
      const tiles = [];
      for (let c = 0; c < WORD_LENGTH; c += 1) {
        const tile = document.createElement('div');
        tile.className = 'tile';
        tile.setAttribute('role', 'gridcell');
        tile.dataset.state = TILE.EMPTY;
        const face = document.createElement('span');
        face.className = 'tile__face';
        tile.append(face);
        row.append(tile);
        tiles.push(tile);
      }
      this.root.append(row);
      this.rows.push({ row, tiles });
    }
  }

  /**
   * Paint the whole board.
   * @param {Game} game
   * @param {{skipRow?: number|null}} [options] row to leave untouched (mid-reveal)
   */
  render(game, { skipRow = null } = {}) {
    const board = game.board;
    board.forEach((cells, r) => {
      if (r === skipRow) return;
      const { row, tiles } = this.rows[r];
      const isActive = r === game.rowIndex && !game.isOver;
      row.classList.toggle('board__row--active', isActive);
      cells.forEach((cell, c) => this.#paint(tiles[c], cell, r, c));
    });
  }

  #paint(tile, { letter, state }, r, c) {
    const face = tile.firstElementChild;
    const upper = letter ? letter.toUpperCase() : '';
    if (face.textContent !== upper) {
      face.textContent = upper;
      if (upper) {
        tile.classList.remove('tile--pop');
        // Force a reflow so the pop animation restarts on every keystroke.
        void tile.offsetWidth;
        tile.classList.add('tile--pop');
      }
    }
    tile.dataset.state = state;
    tile.dataset.filled = upper ? 'true' : 'false';
    tile.setAttribute('aria-label', ariaLabel(upper, state, r, c));
  }

  /**
   * Flip a row over to reveal its scoring.
   * @param {number} rowIndex
   * @param {string} guess
   * @param {string[]} states
   * @returns {Promise<void>} resolves when the last tile has landed
   */
  reveal(rowIndex, guess, states) {
    const { tiles } = this.rows[rowIndex];
    const instant = prefersReducedMotion();

    tiles.forEach((tile, i) => {
      tile.firstElementChild.textContent = guess[i].toUpperCase();
      tile.dataset.filled = 'true';
      tile.setAttribute('aria-label', ariaLabel(guess[i].toUpperCase(), states[i], rowIndex, i));
    });

    if (instant) {
      tiles.forEach((tile, i) => { tile.dataset.state = states[i]; });
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      tiles.forEach((tile, i) => {
        const delay = i * TIMING.flipStagger;
        tile.style.setProperty('--flip-delay', `${delay}ms`);
        tile.classList.remove('tile--flip');
        void tile.offsetWidth;
        tile.classList.add('tile--flip');
        // Swap the colour at the midpoint, while the tile is edge-on.
        setTimeout(() => { tile.dataset.state = states[i]; }, delay + TIMING.flipDuration / 2);
      });
      const total = (tiles.length - 1) * TIMING.flipStagger + TIMING.flipDuration;
      setTimeout(() => {
        tiles.forEach((tile) => tile.classList.remove('tile--flip'));
        resolve();
      }, total);
    });
  }

  /** Reject an invalid guess. */
  shake(rowIndex) {
    const { row } = this.rows[rowIndex];
    if (prefersReducedMotion()) return Promise.resolve();
    row.classList.remove('board__row--shake');
    void row.offsetWidth;
    row.classList.add('board__row--shake');
    return new Promise((resolve) => setTimeout(() => {
      row.classList.remove('board__row--shake');
      resolve();
    }, TIMING.shake));
  }

  /** Victory dance for the winning row. */
  celebrate(rowIndex) {
    const { tiles } = this.rows[rowIndex];
    if (prefersReducedMotion()) return Promise.resolve();
    tiles.forEach((tile, i) => {
      tile.style.setProperty('--bounce-delay', `${i * 90}ms`);
      tile.classList.remove('tile--win');
      void tile.offsetWidth;
      tile.classList.add('tile--win');
    });
    return new Promise((resolve) => setTimeout(resolve, TIMING.winBounce));
  }

  /** Remove any lingering animation classes (used when starting a new game). */
  reset() {
    for (const { row, tiles } of this.rows) {
      row.classList.remove('board__row--shake', 'board__row--active');
      for (const tile of tiles) {
        tile.classList.remove('tile--flip', 'tile--win', 'tile--pop');
        tile.style.removeProperty('--flip-delay');
        tile.style.removeProperty('--bounce-delay');
      }
    }
  }
}

const STATE_WORDS = {
  [TILE.CORRECT]: 'correct',
  [TILE.PRESENT]: 'present in another position',
  [TILE.ABSENT]: 'not in the word',
};

function ariaLabel(letter, state, r, c) {
  const position = `Row ${r + 1}, letter ${c + 1}`;
  if (!letter) return `${position}, empty`;
  const meaning = STATE_WORDS[state];
  return meaning ? `${position}, ${letter}, ${meaning}` : `${position}, ${letter}`;
}
