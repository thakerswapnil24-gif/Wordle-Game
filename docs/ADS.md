# Advertising

Pentaword is free and ad-supported, through Google AdMob. **The integration is
built**: `src/js/ads/` holds the ad manager and its configuration, the plugin is
installed, and the consent flow, all three ad formats and the hint mechanic are
wired up and covered by tests.

What is **not** done, because only you can do it, is everything involving your
own AdMob account: the real ad unit IDs, the real application ID, and testing on
a device. Those are the sections marked **you must do this** below. The release
workflow refuses to build a bundle until the first two are done.

The compliance side is done: the privacy policy, Data safety answers, content
rating and advertising-ID declaration all describe the ad-supported app.

> **Do not file the ad-supported Data safety answers until the build you upload
> actually contains the SDK.** `docs/play-listing.md` has both columns. Under-
> declaring gets apps suspended; over-declaring costs installs and is confusing,
> but is not a violation.

---

## How it behaves

All of this is implemented in `src/js/ads/ads.js`, with the placement rules in
`src/js/ads/config.js`. Two principles run through it:

- **Ads are inert off-device.** Every entry point is a no-op in a browser, so the
  same source runs on the web, in tests and in the app.
- **An ad failing never costs the player anything.** No SDK, no network, no fill,
  a rejected promise — the game carries on exactly as if advertising were off.
  Nothing waits on an ad it cannot get.

Three formats, in descending order of how much they earn and how well they suit
a puzzle game.

### 1. Rewarded — a hint

Player-initiated, entirely optional: *watch an ad to reveal one letter*. Highest
revenue per impression and the least resented format, because nobody is forced
into it.

**Built.** The hint reveals one letter at a position the player has not already
solved, chosen at random among those so a second hint cannot be predicted from
the first. Revealed letters appear in their own row above the board rather than
being written into it, because the board is typed left to right and cannot hold
a letter in the middle of an unfinished guess.

The button only appears when it can actually do something: an ad is loaded, the
game is running, and there is a letter left worth revealing. Dismissing the ad
early reveals nothing — and costs nothing.

### The streak rule, and why it is recorded either way

**A hinted win currently counts exactly like any other**: it extends the streak
and fills the guess distribution. The share text marks it with 💡 so a shared
result is never quietly flattering, but the statistics do not punish it.

That decision is deliberately reversible. `hints` is stored per game and
`hintedWins` is counted in the statistics from the day hints exist. If hinted
wins should later be excluded from streaks, the history needed to do it honestly
already exists — whereas deciding to record it *after* the fact would mean either
a wrong recalculation or throwing away everyone's history.

Never gate anything behind a rewarded ad that the player would otherwise have.
Reward-for-hint is fine; reward-to-keep-playing is not.

### 2. Interstitial — after a completed round

**Built.** Full screen, shown after a game ends and *after the player closes the
statistics dialog*, so it never lands on top of the result they just earned.
Never mid-guess, never during the reveal animation. The rules enforced in code:

- **Never after the daily puzzle.** One puzzle a day is the thing people come
  back for; interrupting it is how a daily game loses its audience. Practice
  rounds are where the impressions are.
- Not until the third completed round of a session — let people play before
  charging them attention.
- A three-minute floor between interstitials, enforced in the app as well as by
  AdMob's own per-unit frequency capping, so a console misconfiguration cannot
  spam anyone.
- The next one is preloaded while the player is guessing, so it appears
  instantly rather than stalling the transition.

Tune the numbers in `PLACEMENT` in `src/js/ads/config.js`; the tests in
`tests/ads.test.js` assert the behaviour, not the specific values.

### 3. Banner — bottom of the screen

**Built**, shown in practice mode only. Steady but low-earning, and it costs
board space. Measured, by shrinking the viewport by a banner's height and
reading the resulting tile size:

| Device | No banner | 50dp banner | 90dp adaptive |
| --- | --- | --- | --- |
| Pixel (412×915) | 68px tiles | 68px | 68px |
| iPhone 15 (393×852) | 68px | 68px | 66px |
| iPhone SE (375×667) | 53px | 46px | 40px |
| Small Android (360×640) | 50px | 42px | **35px** |
| Landscape phone (852×393) | 49px | 41px | **34px** |

Nothing overflows in any configuration — the board is sized from available space
by a `ResizeObserver`, so it absorbs the banner automatically. The cost is
smaller tiles, and only on small screens.

Adaptive banners are used, which can take up to 90dp on wide screens; the two
rows in bold are the cases to look at on a real device. The banner is hidden
during the daily puzzle for the same reason as the interstitial.

If 35px tiles prove too cramped in landscape on a real phone, the cheapest fix
is to drop `MODE.PRACTICE` from `bannerModes` in landscape, or remove the banner
entirely — it is the least valuable of the three formats.

---

---

## Setup — you must do this

### 1. AdMob account and ad units

At <https://admob.google.com>: create an app (choose *Android*, and link it to
the Play listing once the app is published), then create three ad units — one
rewarded, one interstitial, one banner. Note the **App ID**
(`ca-app-pub-…~…`, with a tilde) and the three **ad unit IDs**
(`ca-app-pub-…/…`, with a slash). They are different things and are easy to
confuse.

Set **maximum ad content rating** in the AdMob app settings to match the content
rating the Play Console gives you. A G-rated puzzle game serving T-rated ads is a
policy problem.

### 2. Replace the ad unit IDs

`src/js/ads/config.js` ships with Google's public test units. Replace all three
with your own. The release workflow greps for the test publisher ID and fails the
build while they are still there, so this cannot be forgotten.

The plugin is already installed and pinned:
`@capacitor-community/admob@7.2.0` — version 8 requires Capacitor 8, and this
project is on Capacitor 7, so upgrading the plugin means upgrading Capacitor
first.

### 3. The App ID in the manifest — the one that crashes

The meta-data is already in `android/app/src/main/AndroidManifest.xml`, holding
Google's **sample** application ID. Replace the value with your own:

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY" />
```

**If this is missing or malformed the app crashes on launch**, before anything
renders — the SDK throws during initialisation. It is the single most common
first-release AdMob failure, which is why the element is present from the start
rather than left as a step to remember. The release workflow also fails while
the sample ID is still in place.

The App ID is not a secret; it is readable in any published APK. It is fine in
the repository.

### 4. Test ad units during development

While developing, use **Google's test ad unit IDs**, never your real ones:

| Format | Test unit |
| --- | --- |
| Banner | `ca-app-pub-3940256099942544/6300978111` |
| Interstitial | `ca-app-pub-3940256099942544/1033173712` |
| Rewarded | `ca-app-pub-3940256099942544/5224354917` |

Tapping your own live ads — even by accident, even once, while testing — is
invalid traffic. Google suspends AdMob accounts for it, and the suspension is
often permanent.

Every request also carries `isTesting` while the test units are configured, so
development impressions stay out of real reporting.

### 5. Consent for EEA, UK and Switzerland

Google's EU user consent policy requires a certified consent management platform
before serving ads to users in those regions. Google's own **UMP SDK** ships with
the Ads SDK and the Capacitor plugin exposes it.

Requirements:

- Request consent information on launch and show the form when required.
- Offer a way to **change the choice later** — the privacy policy already
  promises this, so Settings needs a "Privacy choices" row that reopens the form.
- Declining personalised ads must not restrict the game in any way.

Serving personalised ads to an EEA user without consent is a policy violation and
a GDPR exposure. This is not optional and it is not something to add later.

### 6. The CI permission gate — already updated

`.github/workflows/ci.yml` fails the build on any permission outside a reviewed
allowlist. The Ads SDK's manifest merge adds two, both now on the list:

- `android.permission.ACCESS_NETWORK_STATE` — so the SDK can skip requesting ads
  with no connection. Not a runtime permission.
- `com.google.android.gms.permission.AD_ID` — reads the resettable advertising
  ID. This is what the Play Console's Advertising ID declaration is checked
  against; the two must agree.

They are listed one by one on purpose. **Do not weaken the check to a pattern
match** — the whole value of the gate is that a permission cannot arrive
unnoticed, and the Ads SDK is precisely the kind of dependency that could bring
one. If a future SDK version adds a third, the build will fail; read what it is
before allowing it rather than rubber-stamping.

### 7. app-ads.txt

Optional but worth doing: publish an `app-ads.txt` at the root of the developer
website listed on the Play listing, declaring AdMob as an authorised seller.
It protects against ad-inventory spoofing and some buyers require it. AdMob's
console generates the exact line.

---

## Families policy — read before changing the target audience

The listing currently targets **13 and over**. If it is ever changed to include
children under 13, the ad setup must change first:

- ads may only be served by Families-certified ad networks;
- the advertising ID must not be used at all, which means removing `AD_ID` and
  reconfiguring the SDK;
- interstitials are restricted, and rewarded ads largely are not permitted;
- the Data safety and privacy policy both change again.

Do not tick a children's audience with the standard AdMob configuration in
place.

---

## On-device checklist — you must do this

The behaviour is covered by tests against a fake AdMob plugin, which catches the
app calling the SDK wrongly. It cannot catch the SDK itself behaving differently
than expected, and there is no device or emulator in CI. Check these on real
hardware before a release:

- [ ] The app **launches** (proves the App ID meta-data is right).
- [ ] Test ads appear in all three placements.
- [ ] No ad appears during the daily puzzle.
- [ ] No interstitial appears mid-guess or during the reveal animation.
- [ ] The rewarded ad grants the hint, and denies it if the ad is dismissed early.
- [ ] The banner does not push the keyboard off-screen on a small phone —
      test at 360×640, the tightest row in the table above.
- [ ] The consent form appears with the device set to an EEA locale, and the
      choice can be changed again from Settings.
- [ ] With the device in airplane mode: the game is fully playable, no ad frames
      or error placeholders are visible, and nothing hangs waiting for an ad.
- [ ] Statistics still persist across a restart with ads present.
