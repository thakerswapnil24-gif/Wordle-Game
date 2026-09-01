/**
 * On-screen QWERTY keyboard.
 *
 * Emits the same three actions as the physical keyboard ('letter', 'enter',
 * 'backspace') so the controller has a single input path to handle.
 */
import { TILE } from '../config.js';

const LAYOUT = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'backspace'],
];

const BACKSPACE_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <path d="M8.5 4.5h10.2a2.3 2.3 0 0 1 2.3 2.3v10.4a2.3 2.3 0 0 1-2.3 2.3H8.5a2 2 0 0 1-1.5-.68L2.4 13.3a2 2 0 0 1 0-2.6L7 5.18A2 2 0 0 1 8.5 4.5Z"
        fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
  <path d="m11 9.6 5 4.8m0-4.8-5 4.8" fill="none" stroke="currentColor"
        stroke-width="1.7" stroke-linecap="round"/>
</svg>`;

export class Keyboard {
  /**
   * @param {HTMLElement} root
   * @param {(action: {type: 'letter'|'enter'|'backspace', letter?: string}) => void} onAction
   */
  constructor(root, onAction) {
    this.root = root;
    this.onAction = onAction;
    this.keys = new Map();
    this.#build();
  }

  #build() {
    this.root.textContent = '';
    this.root.setAttribute('role', 'group');
    this.root.setAttribute('aria-label', 'Letter keyboard');

    for (const rowKeys of LAYOUT) {
      const row = document.createElement('div');
      row.className = 'keyboard__row';
      for (const key of rowKeys) {
        row.append(this.#makeKey(key));
      }
      this.root.append(row);
    }

    // One delegated listener rather than 28 — and pointerdown keeps the
    // on-screen keyboard feeling instant on touch devices.
    this.root.addEventListener('pointerdown', (event) => {
      const button = event.target.closest('button[data-key]');
      if (!button) return;
      event.preventDefault(); // Never let a tap steal focus or trigger zoom.
      this.#emit(button.dataset.key);
    });
    // Keep the keys operable for keyboard and screen-reader users, who get a
    // click event without a preceding pointerdown.
    this.root.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-key]');
      if (button && event.detail === 0) this.#emit(button.dataset.key);
    });
  }

  #makeKey(key) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.key = key;
    button.className = 'key';
    button.dataset.state = TILE.EMPTY;

    if (key === 'enter') {
      button.classList.add('key--wide');
      button.textContent = 'Enter';
      button.setAttribute('aria-label', 'Submit guess');
    } else if (key === 'backspace') {
      button.classList.add('key--wide', 'key--icon');
      button.innerHTML = BACKSPACE_ICON;
      button.setAttribute('aria-label', 'Delete letter');
    } else {
      button.textContent = key.toUpperCase();
      button.setAttribute('aria-label', key.toUpperCase());
    }

    this.keys.set(key, button);
    return button;
  }

  #emit(key) {
    if (key === 'enter') this.onAction({ type: 'enter' });
    else if (key === 'backspace') this.onAction({ type: 'backspace' });
    else this.onAction({ type: 'letter', letter: key });
  }

  /** @param {Record<string,string>} hints letter -> TILE state */
  update(hints) {
    for (const [key, button] of this.keys) {
      if (key === 'enter' || key === 'backspace') continue;
      const state = hints[key] ?? TILE.EMPTY;
      if (button.dataset.state !== state) {
        button.dataset.state = state;
        button.classList.remove('key--reveal');
        void button.offsetWidth;
        if (state !== TILE.EMPTY) button.classList.add('key--reveal');
      }
      const suffix = STATE_HINT[state];
      button.setAttribute('aria-label', suffix ? `${key.toUpperCase()}, ${suffix}` : key.toUpperCase());
    }
  }

  /** Enable/disable the whole keyboard (e.g. during a reveal animation). */
  setEnabled(enabled) {
    this.root.classList.toggle('keyboard--locked', !enabled);
    for (const button of this.keys.values()) button.disabled = !enabled;
  }

  reset() {
    for (const button of this.keys.values()) {
      button.dataset.state = TILE.EMPTY;
      button.classList.remove('key--reveal');
    }
  }
}

const STATE_HINT = {
  [TILE.CORRECT]: 'correct',
  [TILE.PRESENT]: 'in the word',
  [TILE.ABSENT]: 'not in the word',
};
