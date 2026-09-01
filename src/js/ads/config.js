/**
 * Advertising configuration.
 *
 * Ad unit IDs are not secrets — they are readable in any published APK — so they
 * live in the repository rather than in build secrets. What matters is that the
 * *test* units below never reach a release: tapping your own live ads counts as
 * invalid traffic and gets AdMob accounts permanently suspended, so development
 * must use Google's test units, and shipping must not.
 *
 * The release workflow refuses to build a bundle while these are still the test
 * IDs. See docs/ADS.md for where the real ones come from.
 */
import { MODE } from '../config.js';

/** Google's public test ad units. Replace all three before releasing. */
export const AD_UNITS = {
  banner: 'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded: 'ca-app-pub-3940256099942544/5224354917',
};

/** Every Google-published test unit shares this publisher ID. */
const TEST_PUBLISHER = 'ca-app-pub-3940256099942544/';

/** True while the app is still configured with Google's test inventory. */
export function usingTestAds() {
  return Object.values(AD_UNITS).some((id) => id.startsWith(TEST_PUBLISHER));
}

/**
 * Where ads may appear.
 *
 * The daily puzzle is deliberately absent from every list. One puzzle a day is
 * what brings people back; interrupting it is how a daily game loses the
 * audience that makes it worth advertising on. Practice mode is unlimited, so
 * it is where the impressions are anyway.
 */
export const PLACEMENT = Object.freeze({
  /** Modes that may show a bottom banner. */
  bannerModes: [MODE.PRACTICE],
  /** Modes that may show an interstitial when a round ends. */
  interstitialModes: [MODE.PRACTICE],
  /**
   * Completed rounds before the first interstitial of a session. Charging
   * attention before anyone has played is how an app gets uninstalled.
   */
  gamesBeforeFirstInterstitial: 2,
  /** Floor between interstitials, independent of AdMob's own frequency cap. */
  secondsBetweenInterstitials: 180,
});

/**
 * Options passed to every ad request. `isTesting` marks requests as test
 * traffic, which is what keeps development impressions out of real reporting.
 */
export function adOptions(adId, { personalised }) {
  return {
    adId,
    isTesting: usingTestAds(),
    // npa = "non-personalised ads". Set whenever consent was not obtained, so a
    // declined consent form actually changes what is requested.
    npa: !personalised,
  };
}
