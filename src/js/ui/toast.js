/**
 * Transient messages ("Not in word list", "Copied!"). Also doubles as the
 * app's polite live region so screen readers hear the same feedback.
 */
import { TIMING } from '../config.js';

let container = null;

function host() {
  if (!container) container = document.getElementById('toaster');
  return container;
}

/**
 * @param {string} message
 * @param {{duration?: number, tone?: 'neutral'|'success'}} [options]
 */
export function toast(message, { duration = TIMING.toast, tone = 'neutral' } = {}) {
  const target = host();
  if (!target) return;

  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  target.prepend(el);

  const remove = () => {
    el.classList.add('toast--leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Guard against animationend never firing (reduced motion, background tab).
    setTimeout(() => el.remove(), 400);
  };

  if (duration > 0) setTimeout(remove, duration);
  return remove;
}

/** Announce something to assistive tech without showing a toast. */
export function announce(message) {
  const region = document.getElementById('announcer');
  if (!region) return;
  region.textContent = '';
  // Re-setting after a tick makes repeated identical messages announce again.
  setTimeout(() => { region.textContent = message; }, 30);
}
