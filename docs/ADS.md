# Advertising: what the integration needs

Pentaword is free and ad-supported. This document is the plan for wiring up
Google AdMob — the SDK is **not yet in the build**. Everything here is what has
to happen, in order, and the things that go wrong if it doesn't.

The compliance side is already done: the privacy policy, Data safety answers,
content rating and advertising-ID declaration in `docs/privacy-policy.html` and
`docs/play-listing.md` all describe the ad-supported app.

> **Do not file the ad-supported Data safety answers until the build you upload
> actually contains the SDK.** `docs/play-listing.md` has both columns. Under-
> declaring gets apps suspended; over-declaring costs installs and is confusing,
> but is not a violation.

---

## Ad formats and where they go

Three formats, in descending order of how much they earn and how well they suit
a puzzle game.

### 1. Rewarded — a hint

Player-initiated, entirely optional: *watch an ad to reveal one letter*. Highest
revenue per impression and the least resented format, because nobody is forced
into it.

This is the only format that needs a **game feature that does not exist yet**: a
hint mechanic. It should reveal one correct letter in a position the player has
not solved, and — importantly — the game must record that a hint was used, so
hinted wins can be excluded from the streak or marked in the share text.
Decide that rule before building it; changing it later invalidates players'
statistics.

Never gate anything behind a rewarded ad that the player would otherwise have.
Reward-for-hint is fine; reward-to-keep-playing is not.

### 2. Interstitial — after a completed round

Full screen, shown when a game ends, **never mid-guess and never during the
reveal animation**. Rules that keep it from ruining the game:

- Only after the board is finished and the statistics dialog has been dismissed.
- **Never after the daily puzzle.** One puzzle a day is the thing people come
  back for; interrupting it is how a daily game loses its audience. Practice
  rounds are where the impressions are.
- Not on the first practice round of a session — let people play before charging
  them attention.
- Frequency cap: at most one every few minutes, and cap per session. AdMob's own
  frequency capping is set per ad unit in the console; enforce a floor in the app
  too, so a console misconfiguration cannot spam anyone.
- Preload the next one while the player is guessing, so it appears instantly
  rather than stalling the transition.

### 3. Banner — bottom of the screen

Steady but low-earning, and it costs board space. Measured, by shrinking the
viewport by a banner's height and reading the resulting tile size:

| Device | No banner | 50dp banner | 90dp adaptive |
| --- | --- | --- | --- |
| Pixel (412×915) | 68px tiles | 68px | 68px |
| iPhone 15 (393×852) | 68px | 68px | 66px |
| iPhone SE (375×667) | 53px | 46px | 40px |
| Small Android (360×640) | 50px | 42px | **35px** |
| Landscape phone (852×393) | 49px | 41px | **34px** |

Nothing overflows in any configuration — the board is sized from available space
by a `ResizeObserver`, so it absorbs the banner automatically. The cost is
smaller tiles, and only on small screens. Recommendations that follow from the
numbers:

- Use **adaptive banners**, but be aware they can take 90dp on wide screens;
  the two rows in bold are the cases to look at on a real device.
- **Hide the banner during the daily puzzle**, for the same reason as the
  interstitial: keep the once-a-day experience clean.
- Consider hiding it in landscape, where the board is already tightest.

---

## Setup, in order

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

### 2. The plugin

```bash
npm install @capacitor-community/admob@7.2.0
npm run sync:android
```

Pin the version: `@capacitor-community/admob@8` requires Capacitor 8, and this
project is on Capacitor 7. Upgrading the plugin means upgrading Capacitor first.

### 3. The App ID in the manifest — the one that crashes

```xml
<meta-data
    android:name="com.google.android.gms.ads.APPLICATION_ID"
    android:value="ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY" />
```

inside `<application>` in `android/app/src/main/AndroidManifest.xml`.

**If this is missing or malformed the app crashes on launch**, before anything
renders — the SDK throws during initialisation. It is the single most common
first-release AdMob failure. Add it in the same commit as the SDK, and check the
app still opens before anything else.

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
often permanent. Wire the IDs so the debug build uses test units and only the
release build uses real ones; do not rely on remembering to swap them.

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

### 6. Update the CI permission gate

`.github/workflows/ci.yml` fails the build on any permission outside a reviewed
allowlist. The Ads SDK's manifest merge is expected to add:

- `android.permission.ACCESS_NETWORK_STATE` — so the SDK can skip requesting ads
  with no connection. Not a runtime permission.
- `com.google.android.gms.permission.AD_ID` — reads the resettable advertising
  ID. This is what the Play Console's Advertising ID declaration is checked
  against; the two must agree.

Add exactly those two to `allowed.txt` in that step, with a comment explaining
each, and let the build fail on anything else. **Do not weaken the check to a
pattern match** — the whole value of the gate is that a permission cannot arrive
unnoticed, and the SDK is precisely the kind of dependency that could bring one.

Run the build and read the diff the gate prints before allowing anything: if the
SDK adds a permission not on this list, that is worth understanding rather than
rubber-stamping.

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

## On-device checklist

None of this can be verified in CI — there is no device and no emulator — so
these must be checked on real hardware before a release:

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
