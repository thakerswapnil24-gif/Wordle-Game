import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * The Android bridge is the one part of the app that cannot be exercised in a
 * browser or on CI — there is no device. These tests stand in for that by
 * driving the bridge against a fake `window.Capacitor`, which covers the
 * likelier failure: not the plugins misbehaving, but this module calling them
 * with the wrong shape, or failing to stay inert on the web.
 */

/** Install a fake Capacitor bridge and load a fresh copy of the module. */
async function withBridge(capacitor) {
  globalThis.window = capacitor === undefined ? {} : { Capacitor: capacitor };
  // Cache-bust so each test observes its own globals at module scope.
  return import(`../src/js/native.js?t=${Math.random()}`);
}

function fakePlugins(overrides = {}) {
  const calls = [];
  const record = (name) => (...args) => {
    calls.push([name, ...args]);
    return Promise.resolve();
  };
  const plugins = {
    Share: { share: record('Share.share') },
    StatusBar: { setStyle: record('StatusBar.setStyle'), setBackgroundColor: record('StatusBar.setBackgroundColor') },
    SplashScreen: { hide: record('SplashScreen.hide') },
    App: { addListener: record('App.addListener'), exitApp: record('App.exitApp') },
    ...overrides,
  };
  return { plugins, calls };
}

const nativeBridge = (plugins) => ({ isNativePlatform: () => true, Plugins: plugins });

test.afterEach(() => { delete globalThis.window; });

/* ------------------------------ detection -------------------------------- */

test('the bridge reports "not native" in a plain browser', async () => {
  const native = await withBridge(undefined);
  assert.equal(native.isNative(), false);
});

test('the bridge reports "not native" when Capacitor says the platform is web', async () => {
  const native = await withBridge({ isNativePlatform: () => false, Plugins: {} });
  assert.equal(native.isNative(), false);
});

test('the bridge reports "native" inside the app', async () => {
  const native = await withBridge(nativeBridge({}));
  assert.equal(native.isNative(), true);
});

test('a bridge that throws on access is treated as absent, not fatal', async () => {
  const native = await withBridge({ get isNativePlatform() { throw new Error('boom'); } });
  assert.equal(native.isNative(), false);
});

/* -------------------------------- sharing -------------------------------- */

test('sharing is a no-op on the web so the clipboard path still runs', async () => {
  const native = await withBridge(undefined);
  assert.equal(await native.shareViaNative('grid', 'title'), null);
});

test('sharing hands the text and dialog title to the Share plugin', async () => {
  const { plugins, calls } = fakePlugins();
  const native = await withBridge(nativeBridge(plugins));
  assert.equal(await native.shareViaNative('PW #1 3/6', 'Pentaword result'), 'shared');
  assert.deepEqual(calls, [['Share.share', { text: 'PW #1 3/6', dialogTitle: 'Pentaword result' }]]);
});

test('dismissing the share sheet counts as shared, not failed', async () => {
  for (const message of ['Share canceled', 'AbortError: user aborted']) {
    const { plugins } = fakePlugins({ Share: { share: () => Promise.reject(new Error(message)) } });
    const native = await withBridge(nativeBridge(plugins));
    assert.equal(await native.shareViaNative('grid'), 'shared', message);
  }
});

test('a genuine share failure is reported so the caller can fall back', async () => {
  const { plugins } = fakePlugins({ Share: { share: () => Promise.reject(new Error('no activity found')) } });
  const native = await withBridge(nativeBridge(plugins));
  assert.equal(await native.shareViaNative('grid'), 'failed');
});

/* --------------------------------- theme --------------------------------- */

test('the status bar follows the theme', async () => {
  const { plugins, calls } = fakePlugins();
  const native = await withBridge(nativeBridge(plugins));

  native.applyNativeTheme(true);
  assert.deepEqual(calls[0], ['StatusBar.setStyle', { style: 'DARK' }]);

  calls.length = 0;
  native.applyNativeTheme(false);
  assert.deepEqual(calls[0], ['StatusBar.setStyle', { style: 'LIGHT' }]);
});

test('applying the theme on the web does nothing and does not throw', async () => {
  const native = await withBridge(undefined);
  assert.doesNotThrow(() => native.applyNativeTheme(true));
});

test('a status bar plugin that returns no promise cannot break the theme toggle', async () => {
  // Guards the settings handler: applyNativeTheme runs on every theme change.
  const { plugins } = fakePlugins({ StatusBar: { setStyle: () => undefined } });
  const native = await withBridge(nativeBridge(plugins));
  assert.doesNotThrow(() => native.applyNativeTheme(true));
});

/* -------------------------------- splash --------------------------------- */

test('the splash screen is dismissed once the game is up', async () => {
  const { plugins, calls } = fakePlugins();
  const native = await withBridge(nativeBridge(plugins));
  native.hideSplash();
  assert.equal(calls[0][0], 'SplashScreen.hide');
});

test('hiding the splash on the web does nothing and does not throw', async () => {
  const native = await withBridge(undefined);
  assert.doesNotThrow(() => native.hideSplash());
});

/* ------------------------------ back button ------------------------------ */

test('the back button is not intercepted on the web', async () => {
  const native = await withBridge(undefined);
  assert.doesNotThrow(() => native.onBackButton(() => true));
});

test('a consumed back press keeps the player in the game', async () => {
  const listeners = {};
  const calls = [];
  const plugins = {
    App: {
      addListener: (event, cb) => { listeners[event] = cb; },
      exitApp: () => calls.push('exitApp'),
    },
  };
  const native = await withBridge(nativeBridge(plugins));
  native.onBackButton(() => true);
  listeners.backButton();
  assert.deepEqual(calls, [], 'the app must not exit while a dialog was closed');
});

test('an unhandled back press exits the app', async () => {
  const listeners = {};
  const calls = [];
  const plugins = {
    App: {
      addListener: (event, cb) => { listeners[event] = cb; },
      exitApp: () => calls.push('exitApp'),
    },
  };
  const native = await withBridge(nativeBridge(plugins));
  native.onBackButton(() => false);
  listeners.backButton();
  assert.deepEqual(calls, ['exitApp']);
});

test('a throwing back handler still lets the player leave', async () => {
  // Otherwise a bug in the handler would trap the player in the app.
  const listeners = {};
  const calls = [];
  const plugins = {
    App: {
      addListener: (event, cb) => { listeners[event] = cb; },
      exitApp: () => calls.push('exitApp'),
    },
  };
  const native = await withBridge(nativeBridge(plugins));
  native.onBackButton(() => { throw new Error('handler bug'); });
  listeners.backButton();
  assert.deepEqual(calls, ['exitApp']);
});
