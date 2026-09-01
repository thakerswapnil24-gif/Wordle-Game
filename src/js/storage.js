/**
 * A defensive wrapper around localStorage.
 *
 * Storage can be unavailable (private browsing, disabled cookies, an embedded
 * webview) or hold data written by an older version of the app. Every read is
 * therefore guarded and validated by the caller's `revive` function; anything
 * unusable is discarded rather than allowed to break the game.
 */

let memoryFallback = null;

/** An in-memory stand-in used when the browser refuses to persist anything. */
function createMemoryStore() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function backend() {
  if (memoryFallback) return memoryFallback;
  try {
    if (typeof window === 'undefined') throw new Error('no window');
    const probe = '__pentaword_probe__';
    window.localStorage.setItem(probe, probe);
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Persistence is unavailable — keep the session playable in memory instead.
    memoryFallback = createMemoryStore();
    return memoryFallback;
  }
}

/** True when values written here survive a page reload. */
export function isPersistent() {
  if (typeof window === 'undefined') return false;
  return memoryFallback === null && backend() === window.localStorage;
}

/**
 * @template T
 * @param {string} key
 * @param {(raw: unknown) => T|null} revive validates/normalises the stored value
 * @param {T} fallback returned when nothing valid is stored
 * @returns {T}
 */
export function read(key, revive, fallback) {
  try {
    const raw = backend().getItem(key);
    if (raw === null) return fallback;
    const revived = revive(JSON.parse(raw));
    return revived ?? fallback;
  } catch {
    return fallback;
  }
}

/** @returns {boolean} whether the write succeeded. */
export function write(key, value) {
  try {
    backend().setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // Quota exceeded or storage blocked mid-session.
  }
}

export function remove(key) {
  try {
    backend().removeItem(key);
  } catch {
    /* nothing useful to do */
  }
}
