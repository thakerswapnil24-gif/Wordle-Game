import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE } from '../src/js/config.js';

/**
 * The ads stack cannot run in a browser or on CI, so these drive it against a
 * fake AdMob plugin. Two properties matter more than any of the individual
 * calls:
 *
 *   - on the web it must do nothing at all, and
 *   - when the SDK misbehaves the game must carry on regardless.
 *
 * An ad failing is routine. An ad failing and taking the game with it is not.
 */

async function withAdMob(admob, { native = true } = {}) {
  globalThis.window = native
    ? { Capacitor: { isNativePlatform: () => true, Plugins: { AdMob: admob } } }
    : {};
  return import(`../src/js/ads/ads.js?t=${Math.random()}`);
}

/** A plugin that records calls and behaves like a healthy SDK. */
function fakeAdMob(overrides = {}) {
  const calls = [];
  const record = (name, result) => (...args) => {
    calls.push([name, ...args]);
    return Promise.resolve(typeof result === 'function' ? result() : result);
  };
  const admob = {
    initialize: record('initialize'),
    requestConsentInfo: record('requestConsentInfo', {
      status: 'NOT_REQUIRED',
      isConsentFormAvailable: false,
      privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    }),
    showConsentForm: record('showConsentForm', { status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' }),
    showPrivacyOptionsForm: record('showPrivacyOptionsForm'),
    showBanner: record('showBanner'),
    hideBanner: record('hideBanner'),
    prepareInterstitial: record('prepareInterstitial', { adUnitId: 'x' }),
    showInterstitial: record('showInterstitial'),
    prepareRewardVideoAd: record('prepareRewardVideoAd', { adUnitId: 'x' }),
    showRewardVideoAd: record('showRewardVideoAd', { type: 'hint', amount: 1 }),
    ...overrides,
  };
  return { admob, calls, of: (name) => calls.filter((c) => c[0] === name) };
}

test.afterEach(() => { delete globalThis.window; });

/* --------------------------------- the web -------------------------------- */

test('on the web the ads stack does nothing and reports itself unavailable', async () => {
  const ads = await withAdMob(undefined, { native: false });
  assert.equal(await ads.initAds(), false);
  assert.equal(ads.rewardedAvailable(), false);
  assert.equal(await ads.showRewardedAd(), false);
  assert.equal(await ads.maybeShowInterstitial(MODE.PRACTICE), false);
  assert.equal(ads.privacyOptionsAvailable(), false);
  await assert.doesNotReject(() => ads.syncBanner(MODE.PRACTICE));
});

/* ------------------------------- initialising ----------------------------- */

test('initialising reports the SDK started and preloads both ad formats', async () => {
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  assert.equal(await ads.initAds(), true);
  assert.equal(of('initialize').length, 1);
  assert.equal(of('prepareInterstitial').length, 1);
  assert.equal(of('prepareRewardVideoAd').length, 1);
});

test('the app is never tagged for a child-directed audience by accident', async () => {
  // An ad-supported app under the Families policy may not use the advertising
  // ID at all; the listing targets 13+ and the flags must say the same.
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  const [, options] = of('initialize')[0];
  assert.equal(options.tagForChildDirectedTreatment, false);
  assert.equal(options.initializeForTesting, false);
});

test('an SDK that fails to initialise leaves ads off rather than throwing', async () => {
  const { admob } = fakeAdMob({ initialize: () => Promise.reject(new Error('no play services')) });
  const ads = await withAdMob(admob);
  assert.equal(await ads.initAds(), false);
  assert.equal(ads.rewardedAvailable(), false);
});

/* --------------------------------- consent -------------------------------- */

test('a consent form is shown when the platform says it is required', async () => {
  const { admob, of } = fakeAdMob({
    requestConsentInfo: () => Promise.resolve({
      status: 'REQUIRED', isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED',
    }),
  });
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(of('showConsentForm').length, 1);
  assert.equal(ads.privacyOptionsAvailable(), true, 'Settings must offer a way back to the choice');
});

test('no consent form is shown where consent is not required', async () => {
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(of('showConsentForm').length, 0);
});

test('ads are non-personalised until consent is actually obtained', async () => {
  const { admob, of } = fakeAdMob({
    requestConsentInfo: () => Promise.resolve({
      status: 'REQUIRED', isConsentFormAvailable: true, privacyOptionsRequirementStatus: 'REQUIRED',
    }),
    showConsentForm: () => Promise.reject(new Error('form unavailable')),
  });
  const ads = await withAdMob(admob);
  await ads.initAds();
  const [, options] = of('prepareInterstitial')[0];
  assert.equal(options.npa, true, 'a form that could not be shown is not consent');
});

test('consent obtained allows personalised requests', async () => {
  const { admob, of } = fakeAdMob({
    requestConsentInfo: () => Promise.resolve({
      status: 'OBTAINED', isConsentFormAvailable: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED',
    }),
  });
  const ads = await withAdMob(admob);
  await ads.initAds();
  const [, options] = of('prepareInterstitial')[0];
  assert.equal(options.npa, false);
});

/* --------------------------------- banner --------------------------------- */

test('the banner appears in practice and never on the daily puzzle', async () => {
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();

  await ads.syncBanner(MODE.DAILY);
  assert.equal(of('showBanner').length, 0, 'the daily puzzle must stay clean');

  await ads.syncBanner(MODE.PRACTICE);
  assert.equal(of('showBanner').length, 1);

  await ads.syncBanner(MODE.DAILY);
  assert.equal(of('hideBanner').length, 1);
});

test('switching back to a mode that already shows a banner does not re-request one', async () => {
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  await ads.syncBanner(MODE.PRACTICE);
  await ads.syncBanner(MODE.PRACTICE);
  assert.equal(of('showBanner').length, 1);
});

/* ------------------------------ interstitial ------------------------------ */

test('no interstitial ever follows the daily puzzle', async () => {
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  for (let i = 0; i < 5; i += 1) ads.noteGameCompleted();
  assert.equal(await ads.maybeShowInterstitial(MODE.DAILY), false);
  assert.equal(of('showInterstitial').length, 0);
});

test('players get to play before the first interstitial', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();

  ads.noteGameCompleted();
  assert.equal(await ads.maybeShowInterstitial(MODE.PRACTICE), false, 'not after one round');

  ads.noteGameCompleted();
  assert.equal(await ads.maybeShowInterstitial(MODE.PRACTICE), true);
});

test('interstitials are rate limited regardless of how fast rounds are played', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  ads.noteGameCompleted();
  ads.noteGameCompleted();
  assert.equal(await ads.maybeShowInterstitial(MODE.PRACTICE), true);

  ads.noteGameCompleted();
  assert.equal(await ads.maybeShowInterstitial(MODE.PRACTICE), false, 'a floor applies between ads');
});

test('an interstitial that fails to show does not block the game', async () => {
  const { admob } = fakeAdMob({ showInterstitial: () => Promise.reject(new Error('not ready')) });
  const ads = await withAdMob(admob);
  await ads.initAds();
  ads.noteGameCompleted();
  ads.noteGameCompleted();
  assert.equal(await ads.maybeShowInterstitial(MODE.PRACTICE), false);
});

/* -------------------------------- rewarded -------------------------------- */

test('a completed rewarded ad earns the reward', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(ads.rewardedAvailable(), true);
  assert.equal(await ads.showRewardedAd(), true);
});

test('an ad dismissed early earns nothing', async () => {
  const { admob } = fakeAdMob({ showRewardVideoAd: () => Promise.resolve(undefined) });
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(await ads.showRewardedAd(), false);
});

test('a rewarded ad that fails to play earns nothing and does not throw', async () => {
  const { admob } = fakeAdMob({ showRewardVideoAd: () => Promise.reject(new Error('no fill')) });
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(await ads.showRewardedAd(), false);
});

test('a zero-amount reward is not treated as earned', async () => {
  const { admob } = fakeAdMob({ showRewardVideoAd: () => Promise.resolve({ type: 'hint', amount: 0 }) });
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(await ads.showRewardedAd(), false);
});

test('a rewarded ad is reloaded after each play', async () => {
  const { admob, of } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  await ads.showRewardedAd();
  assert.equal(of('prepareRewardVideoAd').length, 2, 'one at startup, one after playing');
});

/* ------------------------- availability notifications ---------------------- */

test('subscribers are told when ad availability changes', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  let changes = 0;
  ads.onAdsChanged(() => { changes += 1; });
  await ads.initAds();
  assert.ok(changes > 0, 'becoming ready is a change worth reporting');
});

test('the hint offer comes back after a rewarded ad is consumed', async () => {
  // Without this the hint button vanishes after the first hint and does not
  // return until something else happens to re-render.
  //
  // Asserting on the *notifications* rather than the final state is the point:
  // the state always settles back to available on its own, so a version that
  // never told anyone still looked correct from the outside. The UI only
  // updates if a notification arrives after the reload, so that is what is
  // checked.
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  assert.equal(ads.rewardedAvailable(), true);

  const availability = [];
  ads.onAdsChanged(() => availability.push(ads.rewardedAvailable()));

  await ads.showRewardedAd();
  // The reload is deliberately not awaited, so let its microtasks run.
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(availability, [false, true],
    'consuming the ad must report unavailable, then available again once reloaded');
});

test('a freshly loaded interstitial is announced too', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  await ads.initAds();
  const changes = [];
  ads.onAdsChanged(() => changes.push(true));
  ads.noteGameCompleted();
  ads.noteGameCompleted();
  await ads.maybeShowInterstitial(MODE.PRACTICE);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(changes.length >= 2, 'showing and reloading are both changes');
});

test('a listener that throws does not break the others', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  let reached = false;
  ads.onAdsChanged(() => { throw new Error('bad listener'); });
  ads.onAdsChanged(() => { reached = true; });
  await assert.doesNotReject(() => ads.initAds());
  assert.equal(reached, true);
});

test('unsubscribing stops the notifications', async () => {
  const { admob } = fakeAdMob();
  const ads = await withAdMob(admob);
  let changes = 0;
  const off = ads.onAdsChanged(() => { changes += 1; });
  off();
  await ads.initAds();
  assert.equal(changes, 0);
});
