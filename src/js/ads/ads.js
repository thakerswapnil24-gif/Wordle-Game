/**
 * Advertising: initialisation, consent, and the three ad formats.
 *
 * Two rules run through this module.
 *
 * First, **it is inert everywhere except the packaged Android app**. Every
 * export returns a harmless value when `window.Capacitor` is absent, so the same
 * source runs in a browser, in tests, and on a device.
 *
 * Second, **an ad failing must never cost the player anything**. Ads are the
 * least important thing here: if the SDK is missing, the network is down, or a
 * request fails, the game carries on exactly as if advertising had been turned
 * off. Nothing in the game awaits an ad it cannot get, and every entry point
 * resolves rather than rejects.
 */
import { AD_UNITS, PLACEMENT, adOptions } from './config.js';
import { isNative } from '../native.js';

/** Plugin event names, taken from the plugin's own enums. */
const EVENT = Object.freeze({
  rewarded: 'onRewardedVideoAdReward',
  rewardDismissed: 'onRewardedVideoAdDismissed',
  interstitialDismissed: 'interstitialAdDismissed',
  bannerSizeChanged: 'bannerAdSizeChanged',
});

const CONSENT = Object.freeze({
  required: 'REQUIRED',
  obtained: 'OBTAINED',
  notRequired: 'NOT_REQUIRED',
  unknown: 'UNKNOWN',
});

/**
 * Called whenever ad availability changes.
 *
 * Readiness moves on its own — an ad finishes loading, or is consumed and
 * reloaded — and the UI that offers it has to follow. Without this the hint
 * button disappears after the first hint and does not come back until something
 * else happens to re-render.
 */
const listeners = new Set();

/** Subscribe to availability changes. Returns an unsubscribe function. */
export function onAdsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.debug('[ads] listener failed:', error?.message ?? error);
    }
  }
}

const adState = {
  ready: false,
  /** Whether personalised ads may be requested. Pessimistic until consent says otherwise. */
  personalised: false,
  /** Whether the platform wants a "privacy options" entry point in Settings. */
  privacyOptionsRequired: false,
  bannerVisible: false,
  interstitialReady: false,
  rewardedReady: false,
  completedGames: 0,
  lastInterstitialAt: 0,
};

function adMobPlugin() {
  if (!isNative()) return undefined;
  try {
    return window.Capacitor?.Plugins?.AdMob;
  } catch {
    return undefined;
  }
}

/** Await a plugin call, swallowing any failure. Ads must never throw upward. */
async function attempt(work, label) {
  try {
    return await work();
  } catch (error) {
    // Kept at debug level: a failed ad request is routine (no fill, no network)
    // and is not something the player or the developer needs shouting about.
    console.debug(`[ads] ${label} failed:`, error?.message ?? error);
    return null;
  }
}

/* -------------------------------- consent --------------------------------- */

/**
 * Ask the platform what consent this user requires, and show Google's form if
 * one is needed. Required by Google's EU user consent policy before serving ads
 * in the EEA, the UK and Switzerland.
 *
 * @returns {Promise<boolean>} whether personalised ads may be requested
 */
async function resolveConsent(admob) {
  const info = await attempt(() => admob.requestConsentInfo(), 'requestConsentInfo');
  if (!info) return false;

  adState.privacyOptionsRequired = info.privacyOptionsRequirementStatus === CONSENT.required;

  if (info.isConsentFormAvailable && info.status === CONSENT.required) {
    const after = await attempt(() => admob.showConsentForm(), 'showConsentForm');
    if (after) {
      adState.privacyOptionsRequired = after.privacyOptionsRequirementStatus === CONSENT.required;
      return after.status === CONSENT.obtained;
    }
    // The form could not be shown; stay on non-personalised ads rather than
    // assuming consent nobody gave.
    return false;
  }

  // NOT_REQUIRED means this user is outside the regions the policy covers.
  return info.status === CONSENT.obtained || info.status === CONSENT.notRequired;
}

/** True when Settings should offer a way to reopen the consent choice. */
export function privacyOptionsAvailable() {
  return adState.privacyOptionsRequired;
}

/**
 * Reopen Google's privacy options form. The privacy policy promises players can
 * change their choice, so this is what keeps that promise true.
 * @returns {Promise<boolean>} whether the form was shown
 */
export async function showPrivacyOptions() {
  const admob = adMobPlugin();
  if (!admob?.showPrivacyOptionsForm) return false;
  const shown = await attempt(() => admob.showPrivacyOptionsForm(), 'showPrivacyOptionsForm');
  if (shown !== null) {
    // The choice may have changed; re-read it for subsequent requests.
    const info = await attempt(() => admob.requestConsentInfo(), 'requestConsentInfo');
    if (info) {
      adState.personalised = info.status === CONSENT.obtained;
      adState.privacyOptionsRequired = info.privacyOptionsRequirementStatus === CONSENT.required;
      notify();
    }
  }
  return shown !== null;
}

/* ------------------------------ initialisation ---------------------------- */

/**
 * Start the ads stack. Safe to call on the web, where it does nothing.
 * @returns {Promise<boolean>} whether ads are available this session
 */
export async function initAds() {
  const admob = adMobPlugin();
  if (!admob) return false;

  const started = await attempt(() => admob.initialize({
    initializeForTesting: false,
    // The listing targets 13+. If that ever changes, the Families policy
    // forbids the advertising ID entirely — see docs/ADS.md before flipping it.
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: false,
  }), 'initialize');
  if (started === null) return false;

  adState.personalised = await resolveConsent(admob);
  adState.ready = true;

  // Preload so the first interstitial and hint do not stall behind a request,
  // and await both: callers use the resolved value to decide whether to offer a
  // hint, so resolving before readiness is known would hide the hint button
  // until something else happened to re-render.
  await Promise.all([prepareInterstitial(), prepareRewarded()]);
  notify();
  return true;
}

/* -------------------------------- banner ---------------------------------- */

/**
 * Show or hide the bottom banner for the given mode.
 *
 * The board is sized from the space actually available, so it reflows around a
 * banner on its own — no layout coordination is needed here.
 */
export async function syncBanner(mode) {
  const admob = adMobPlugin();
  if (!admob || !adState.ready) return;

  const wanted = PLACEMENT.bannerModes.includes(mode);
  if (wanted === adState.bannerVisible) return;

  if (wanted) {
    const shown = await attempt(() => admob.showBanner({
      ...adOptions(AD_UNITS.banner, { personalised: adState.personalised }),
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
    }), 'showBanner');
    adState.bannerVisible = shown !== null;
  } else {
    await attempt(() => admob.hideBanner(), 'hideBanner');
    adState.bannerVisible = false;
  }
}

/* ----------------------------- interstitial ------------------------------- */

async function prepareInterstitial() {
  const admob = adMobPlugin();
  if (!admob) return;
  const loaded = await attempt(() => admob.prepareInterstitial(
    adOptions(AD_UNITS.interstitial, { personalised: adState.personalised }),
  ), 'prepareInterstitial');
  adState.interstitialReady = loaded !== null;
  notify();
}

/** Record that a round finished, for the "let them play first" rule. */
export function noteGameCompleted() {
  adState.completedGames += 1;
}

/**
 * Show an interstitial if every placement rule allows it.
 *
 * @param {string} mode the mode the finished game belonged to
 * @returns {Promise<boolean>} whether an ad was shown
 */
export async function maybeShowInterstitial(mode) {
  const admob = adMobPlugin();
  if (!admob || !adState.ready) return false;
  if (!PLACEMENT.interstitialModes.includes(mode)) return false;
  if (adState.completedGames < PLACEMENT.gamesBeforeFirstInterstitial) return false;

  const since = (Date.now() - adState.lastInterstitialAt) / 1000;
  if (adState.lastInterstitialAt > 0 && since < PLACEMENT.secondsBetweenInterstitials) return false;
  if (!adState.interstitialReady) {
    void prepareInterstitial(); // warm it for next time
    return false;
  }

  const shown = await attempt(() => admob.showInterstitial(), 'showInterstitial');
  adState.interstitialReady = false;
  notify();
  void prepareInterstitial();
  if (shown === null) return false;

  adState.lastInterstitialAt = Date.now();
  return true;
}

/* ------------------------------- rewarded --------------------------------- */

async function prepareRewarded() {
  const admob = adMobPlugin();
  if (!admob) return;
  const loaded = await attempt(() => admob.prepareRewardVideoAd(
    adOptions(AD_UNITS.rewarded, { personalised: adState.personalised }),
  ), 'prepareRewardVideoAd');
  adState.rewardedReady = loaded !== null;
  notify();
}

/** Whether a rewarded ad can be offered right now. */
export function rewardedAvailable() {
  return adState.ready && adState.rewardedReady;
}

/**
 * Play a rewarded ad and report whether the reward was actually earned.
 *
 * Dismissing the ad early earns nothing, which is the whole contract of the
 * format — but it also costs the player nothing, so the caller simply does not
 * grant the hint.
 *
 * @returns {Promise<boolean>} true only when the reward was granted
 */
export async function showRewardedAd() {
  const admob = adMobPlugin();
  if (!admob || !adState.rewardedReady) return false;

  const reward = await attempt(() => admob.showRewardVideoAd(), 'showRewardVideoAd');
  adState.rewardedReady = false;
  notify();
  // Reload for next time. Deliberately not awaited — the caller is mid-reward
  // and should not wait on a network round trip — so listeners are what bring
  // the hint button back when it lands.
  void prepareRewarded();

  // The plugin resolves with the reward item only when it was earned.
  return Boolean(reward && typeof reward.amount === 'number' && reward.amount > 0);
}

export { EVENT, CONSENT };
