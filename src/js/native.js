/**
 * Native (Android) integration.
 *
 * Every export here is a no-op in a normal browser, so the same source runs
 * unchanged on the web and inside the Capacitor shell. Capacitor injects
 * `window.Capacitor` and populates `Capacitor.Plugins` from the native side, so
 * nothing needs bundling — the plugin objects are simply present when the app
 * is running natively and absent when it is not.
 */

const capacitor = () => (typeof window === 'undefined' ? undefined : window.Capacitor);

/** True only inside the packaged Android app. */
export function isNative() {
  try {
    return capacitor()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** A native plugin, or undefined when running on the web. */
function plugin(name) {
  return isNative() ? capacitor()?.Plugins?.[name] : undefined;
}

/**
 * Hand text to the Android share sheet.
 * @returns {Promise<'shared'|'failed'|null>} null when there is no native bridge
 */
export async function shareViaNative(text, title) {
  const share = plugin('Share');
  if (!share) return null;
  try {
    await share.share({ text, dialogTitle: title });
    return 'shared';
  } catch (error) {
    // Dismissing the share sheet rejects; that is a cancellation, not an error.
    const message = String(error?.message ?? error).toLowerCase();
    return message.includes('cancel') || message.includes('abort') ? 'shared' : 'failed';
  }
}

/**
 * Keep the system status bar legible against the current theme.
 * @param {boolean} dark whether the app is currently showing its dark theme
 */
export function applyNativeTheme(dark) {
  const statusBar = plugin('StatusBar');
  if (!statusBar) return;
  // Capacitor's Style.Dark means "light content, for a dark background".
  statusBar.setStyle({ style: dark ? 'DARK' : 'LIGHT' }).catch(() => {});
  // A no-op on Android 15+, where the bars are always transparent, but it keeps
  // older devices from showing a mismatched strip above the board.
  statusBar.setBackgroundColor({ color: dark ? '#0E1015' : '#F6F7FB' }).catch(() => {});
}

/** Dismiss the launch screen once the game is actually on screen. */
export function hideSplash() {
  plugin('SplashScreen')?.hide?.({ fadeOutDuration: 200 })?.catch?.(() => {});
}

/**
 * Take over the Android back gesture.
 * @param {() => boolean} handler return true if the press was consumed;
 *   returning false lets the app exit.
 */
export function onBackButton(handler) {
  const app = plugin('App');
  if (!app) return;
  app.addListener('backButton', () => {
    if (!handler()) app.exitApp();
  });
}
