# Security and privacy posture

Pentaword is a word game. It has no accounts, no servers, no payments and no
user-supplied content, which removes most of the attack surface an app usually
has. What follows is what remains, and what is done about it.

## The short version

The game is packaged entirely inside the APK and plays with no connection at
all. It **cannot** read anything on your phone and holds **no permission** that
grants access to any device capability.

The app is ad-supported, so the Google Mobile Ads SDK does reach the network to
fetch and measure ads, and does read the device's advertising ID. That is the
one and only thing that leaves the device, it is declared in the privacy policy
and the Play Data safety form, and it is not something this app's own code
touches — no gameplay data is sent anywhere.

## Permissions

The app declares two permissions, neither of which grants access to any device
capability and neither of which is ever prompted for:

| Permission | Why |
| --- | --- |
| `android.permission.INTERNET` | Capacitor serves the bundled web assets over an in-process `https://localhost` server. INTERNET is not a runtime permission and grants no access to anything on the device. |
| `<package>.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Generated automatically by AndroidX Core for its own use of `registerReceiver`. It is signature-level and namespaced under this app's own package, so no other app can ever hold it, and it protects nothing but an internal broadcast. |

There is no access to storage, camera, microphone, location, contacts, calendar,
phone state, SMS, Bluetooth or nearby devices — none of these are declared, so
the platform will not grant them.

This is enforced, not just documented: CI reads the permissions out of the
**merged** manifest of the built APK and fails if the set is anything other than
those two exactly. The package-scoped name is derived from the APK rather than
pattern-matched, so the check cannot be satisfied by an unrelated permission
that happens to look similar. A dependency that quietly adds a permission breaks
the build — this is not hypothetical; the AndroidX permission above was found
this way.

## Network

**The web layer — the game itself — cannot reach the network.** Ads run natively,
outside it, so the boundary between the two is worth stating precisely.

1. **Content Security Policy** (`index.html`) sets `connect-src 'self'`, so the
   page cannot open a connection to any other origin. `default-src 'self'` blocks
   loading external scripts, styles, images, fonts or frames; `object-src`,
   `frame-src`, `worker-src` and `media-src` are `'none'`; `base-uri` and
   `form-action` are `'none'`.
2. **Capacitor** is configured with `allowNavigation: []` and
   `androidScheme: "https"`, so the WebView will not navigate away from the
   bundled content.
3. **Android network security config** refuses cleartext traffic entirely and
   trusts only the system certificate store, so a user-installed root
   certificate cannot be used to intercept the app's traffic.

The Google Mobile Ads SDK renders in native views alongside the WebView, not
inside it, so the CSP neither blocks it nor protects it — ad traffic is governed
by the SDK and by the network security config above. This is also why an
AdSense-style ad *inside* the WebView would not work here: `connect-src 'self'`
would block it outright.

Nothing the game itself computes — guesses, answers, statistics, settings — is
ever transmitted. The SDK sends what is listed in the privacy policy and nothing
from the game.

`'unsafe-inline'` is unavoidable in `script-src` and `style-src`: Capacitor
injects its native bridge as an inline `<script>`, and the board sets per-tile
animation delays through inline style attributes. The practical XSS risk is nil
— there is no server, no user-supplied content, and every value the app renders
reaches the DOM through `textContent` rather than `innerHTML`.

## Data

Nothing leaves the device. Statistics, settings and the game in progress are
written to the WebView's `localStorage` and read back on launch. There is
nowhere to upload them to.

Storage access is defensive: reads are wrapped, parsed values are validated by a
`revive` function before use, and anything malformed is discarded in favour of a
clean default rather than being trusted. A corrupted or hand-edited save cannot
crash the game — `tests/game.test.js` covers eleven malformed shapes explicitly.
If the browser blocks storage entirely, the game falls back to an in-memory
store and says so in Settings.

Android backup is enabled so a player's streak survives a new phone. What is
included and excluded is declared explicitly in `backup_rules.xml` (Android 11
and below) and `data_extraction_rules.xml` (Android 12 and above) rather than
left to the platform default. None of the backed-up data is sensitive.

## Dependencies

The runtime dependency tree is Capacitor, four of its first-party plugins, and
the AdMob plugin — no analytics SDK, no crash reporter, no font or asset CDN.
`npm audit` runs in CI at `--audit-level=moderate` and fails the build on a
vulnerable dependency.

The Ads SDK is the only third-party code with network access, and the only
reason the app collects anything at all. It is deliberately the sole exception:
if a future change wants to add analytics or crash reporting, that is a new
declaration on the Data safety form and a new paragraph in the privacy policy,
not a quiet dependency bump.

The word lists are generated from public-domain and permissively licensed
dictionaries; the generator is committed at `tools/build-wordlists.mjs` so the
provenance of every shipped word is auditable.

## Content

Profanity and slurs are removed from **both** word lists, so they are not
accepted as guesses and cannot appear as answers. The filter combines a
community profanity list with an explicit list of the inflected forms that list
misses, rather than stem matching — stem matching would reject `TITLE`, `ASSET`,
`SPICE` and `CUMIN`, and `tests/dictionary.test.js` guards against exactly that
regression.

Daily answers are further restricted to a hand-reviewed list of common,
inoffensive words, with proper nouns, place names and brands excluded. The tests
name specific regressions to keep out — `niger`, a country name one letter from
a slur, reached the answer list when the dictionary was widened and is now
blocklisted and asserted against.

## Release integrity

Release bundles are built and signed in CI from a tagged commit, with the
signing key supplied from repository secrets and deleted from the runner
afterwards. The workflow refuses to emit an unsigned bundle and verifies a
signature block is present before uploading the artifact. Keystores are
git-ignored at both the repository root and inside `android/`, so a signing key
cannot be committed by accident.

## Reporting a problem

Open an issue, or email the address on the app's Play listing. There is no
bounty programme.
