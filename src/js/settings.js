/**
 * Player settings: theme, hard mode and the colour-blind friendly palette.
 * Stored locally and applied to the document root as data attributes so the
 * stylesheet owns all of the actual presentation.
 */
import { STORAGE_KEYS } from './config.js';
import * as storage from './storage.js';

export const THEME = Object.freeze({ SYSTEM: 'system', LIGHT: 'light', DARK: 'dark' });

const DEFAULTS = Object.freeze({
  theme: THEME.SYSTEM,
  hardMode: false,
  highContrast: false,
});

function revive(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    theme: Object.values(THEME).includes(raw.theme) ? raw.theme : DEFAULTS.theme,
    hardMode: Boolean(raw.hardMode),
    highContrast: Boolean(raw.highContrast),
  };
}

export function loadSettings() {
  return storage.read(STORAGE_KEYS.settings, revive, { ...DEFAULTS });
}

export function saveSettings(settings) {
  return storage.write(STORAGE_KEYS.settings, settings);
}

/** True when the effective theme (resolving `system`) is dark. */
export function isDark(settings) {
  if (settings.theme === THEME.DARK) return true;
  if (settings.theme === THEME.LIGHT) return false;
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
}

/** Push settings onto <html> so CSS can react to them. */
export function applySettings(settings, root = document.documentElement) {
  const dark = isDark(settings);
  root.dataset.theme = dark ? 'dark' : 'light';
  root.dataset.contrast = settings.highContrast ? 'high' : 'normal';
  root.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f1116' : '#fbfbfd');
}

/** Cycles system -> the opposite of what is currently shown -> ... */
export function nextTheme(settings) {
  return isDark(settings) ? THEME.LIGHT : THEME.DARK;
}
