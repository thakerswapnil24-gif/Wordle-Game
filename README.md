<div align="center">
  <img src="assets/logo.svg" width="72" height="72" alt="">
  <h1>Pentaword</h1>
  <p><em>Five letters. Six tries. One word a day.</em></p>
</div>

Pentaword is a five-letter word puzzle: guess the hidden word in six attempts, with
colour feedback after every guess. There is a **daily** word that is the same for
everyone on a given calendar day — one attempt, no replays, no catching up on
yesterday — and an **unlimited practice** mode for when one puzzle a day is not
enough.

It is a complete, original game — no framework, no build step, no backend, no
tracking. Everything runs in the browser and all progress stays on the device.
It also ships as an Android app: see [docs/PUBLISHING.md](docs/PUBLISHING.md).

> Pentaword is an independent project. Its name, artwork, palette, animations
> and word lists are its own, and its word lists are generated only from
> general-purpose public dictionaries and frequency corpora — see
> `tools/build-wordlists.mjs`. It is not affiliated with, endorsed by, or
> derived from any other word game.

---

## Running it

```bash
npm start          # serves the folder at http://localhost:4173
```

Browsers refuse to load JavaScript modules over `file://`, so opening
`index.html` directly will show a "could not start" notice instead of the game.
Any static file server works — `npm start` just saves you choosing one. To
deploy, upload the repository as-is to any static host.

To hand the game to someone with no server at all, `npm run build:standalone`
bundles everything into a single `pentaword-standalone.html` that plays by
opening it — useful for sending a playable copy to a phone.

```bash
npm test              # unit tests for the game logic (Node's built-in runner)
npm run build:words   # regenerate the word lists (needs network)
npm run build:icons   # regenerate the app icons from the logo geometry
npm run build:www     # stage the exact files that ship inside the Android app
npm run build:standalone  # bundle the game into one self-contained .html file
npm run sync:android  # stage www/ and copy it into the Android project
npm run open:android  # open the Android project in Android Studio
```

## Android

The same code runs as a native Android app through
[Capacitor](https://capacitorjs.com): the web assets are bundled into the APK,
so the game is fully offline. On Android it additionally uses the system share
sheet, matches the status bar to the current theme, and maps the back gesture to
"close what is on top, then exit".

`.github/workflows/release.yml` builds and signs the Android App Bundle in CI,
so you can produce an upload-ready `.aab` without installing the Android SDK.
[docs/PUBLISHING.md](docs/PUBLISHING.md) walks through the whole Play Store
process; [docs/play-listing.md](docs/play-listing.md) holds the listing copy and
the answers to Google's questionnaires.

## How to play

| Colour | Meaning |
| --- | --- |
| 🟩 Green | Right letter, right position |
| 🟨 Amber | The letter is in the word, but somewhere else |
| ⬜ Grey | The letter is not in the word |

Repeated letters follow the rule players expect: a letter is highlighted only as
many times as it actually occurs in the answer, and exact matches claim their
letters first. Guessing `SPEED` against `ERASE` marks one E, not two.

Type with the on-screen keyboard or your physical one — Enter submits, Backspace
deletes.

## Features

- **Daily puzzle** — the same word for every player on a given local date, drawn
  from the harder end of the answer list. Once a day: finishing it ends it, and
  an earlier day's word cannot be played late. A countdown says when the next
  one unlocks.
- **Practice mode** — unlimited random words from the full answer list, tracked
  separately.
- **Statistics** — games played, wins, win percentage, current and maximum
  streak, and a guess distribution chart, kept apart for daily and practice.
- **Spoiler-free sharing** — copies an emoji grid (`Pentaword #244 3/6`) that shows
  the shape of your solve without revealing the answer or your guesses. Uses the
  native share sheet on mobile.
- **Hard mode** — every revealed hint must be reused in later guesses.
- **Hints** — in the Android build, watch a rewarded ad to reveal one letter.
  Recorded per game and in the statistics, and marked in the shared result.
- **Dark and light themes**, following the system setting until you choose.
- **High-contrast palette** — blue/orange tiles for colour-vision deficiency.
- **Accessibility** — full keyboard operation, ARIA labels on every tile and key,
  live-region announcements of each result, and `prefers-reduced-motion` support.
- **Offline-friendly** — the puzzles, words and everything else ship inside the
  app, so it plays with no connection. Statistics and settings live in
  `localStorage` and are never uploaded. If the browser blocks storage, the game
  still plays and says so.

## Security

The game holds no permission that grants access to any device capability, and
nothing it computes leaves the device. A Content Security Policy stops the web
layer opening any outbound connection, the Android network security config
refuses cleartext traffic, and CI fails the build if the merged manifest declares
a permission outside a reviewed allowlist. Profanity and slurs are filtered from
both word lists.

The Android build is ad-supported, and the Google Mobile Ads SDK is the one
component that reaches the network and reads the advertising ID — declared in the
privacy policy and the Play Data safety form. Ads are inert in the web build, and
an ad that fails to load never costs the player anything. See
[docs/SECURITY.md](docs/SECURITY.md) and [docs/ADS.md](docs/ADS.md).

## Project structure

```
index.html                 markup shell, dialogs, boot-failure fallback
android/                   Capacitor Android project (icons, theme, manifest)
assets/                    logo, favicon, PNG app icons, web manifest
docs/                      publishing guide, listing copy, privacy policy
store/                     generated Play listing artwork and screenshots
src/
  data/
    answers.js             curated solutions, plus the harder daily subset
    allowed.js             additional words accepted as guesses
  js/
    config.js              constants shared by every module
    evaluation.js          pure scoring: greens/ambers/greys, duplicates, hard mode
    dictionary.js          word validation and the daily rotation
    game.js                the per-puzzle state machine
    progress.js            keeps the daily to one a day, clock changes included
    stats.js               statistics model and pure transforms
    settings.js            theme, hard mode, high contrast
    share.js               spoiler-free emoji grid and clipboard/share sheet
    native.js              Android bridge; a no-op in a browser
    ads/                   AdMob: consent, banner, interstitial, rewarded
    storage.js             defensive localStorage wrapper
    main.js                the controller that wires model to view
    ui/                    board, keyboard, modal, toast, stats dashboard
  styles/                  tokens, layout, components, animation
tests/                     unit tests for every logic module
tools/                     word-list, icon and store-asset generators; dev server
```

The split is deliberate: **`evaluation.js`, `dictionary.js`, `game.js`,
`stats.js` and `share.js` never touch the DOM**, so the rules of the game are
testable in isolation, while `ui/` only ever renders state it is handed.

## The word system

Two lists are maintained separately:

- **`answers.js`** — words that can be the solution. Common, inoffensive, no
  proper nouns or brand names, no trivial plurals. Ordered by real-world usage
  frequency, then shuffled with a fixed seed so the daily sequence is neither
  alphabetical nor steadily harder — and identical for every player, forever.
  The same file exports `DAILY_ANSWERS`, the hardest 60% by a difficulty score
  the generator computes: how many words sit one letter away (SHELL/SMELL/SPELL),
  repeated letters, rare letters, few vowels, and lower frequency. The daily
  draws only from that subset; practice draws from all of it, so practice stays
  varied and is on average the gentler of the two.
- **`allowed.js`** — the much larger set of words accepted as *guesses* only.
  Deliberately permissive: rejecting a word a player knows is more annoying than
  accepting an obscure one.

Both are generated by `tools/build-wordlists.mjs` from a public-domain English
dictionary and a word-frequency corpus, with profanity removed and a documented
hand-curation list for the proper nouns and brand names a web-derived frequency
list inevitably contains. No other word game's list is used as a source. The
daily rotation covers every word in the daily subset before repeating.

**One daily, once.** The finished board is what normally stops a replay, but the
puzzle number comes from the device clock, and a clock can be wound back.
`progress.js` therefore keeps a high-water mark of the furthest puzzle reached:
a clock that goes backwards simply keeps serving the puzzle it was already on,
and the completed puzzle number is recorded separately so the lock survives
losing the board itself. It is not a security boundary — the record is in the
player's own storage — but the rule holds under ordinary use, including on a
device whose clock is wrong.

## Design notes

The visual identity is Pentaword's own: a letter tile bearing a geometric "P" —
the visual language every word game shares, drawn as pure geometry so the icons
regenerate from one source of truth — an indigo-to-jade gradient, and a palette
that keeps the intuitive green/amber semantics while sitting in a different,
softer register than other word games. Tiles are sized from the space actually available so the whole grid
and keyboard fit on any screen without scrolling, from a small phone to a
desktop, and the keyboard stays within thumb reach at the bottom of the viewport.
Turned sideways, the board and keyboard sit side by side rather than shrinking.
