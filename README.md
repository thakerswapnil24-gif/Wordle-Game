<div align="center">
  <img src="assets/logo.svg" width="72" height="72" alt="">
  <h1>Pentaword</h1>
  <p><em>Five letters. Six tries. One word a day.</em></p>
</div>

Pentaword is a five-letter word puzzle: guess the hidden word in six attempts, with
colour feedback after every guess. There is a **daily** word that is the same for
everyone on a given calendar day, and an **unlimited practice** mode for when one
puzzle a day is not enough.

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

```bash
npm test              # unit tests for the game logic (Node's built-in runner)
npm run build:words   # regenerate the word lists (needs network)
npm run build:icons   # regenerate the app icons from the logo geometry
npm run build:www     # stage the exact files that ship inside the Android app
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

- **Daily puzzle** — the same word for every player on a given local date, with a
  countdown to the next one.
- **Practice mode** — unlimited random words, tracked separately.
- **Statistics** — games played, wins, win percentage, current and maximum
  streak, and a guess distribution chart, kept apart for daily and practice.
- **Spoiler-free sharing** — copies an emoji grid (`Pentaword #244 3/6`) that shows
  the shape of your solve without revealing the answer or your guesses. Uses the
  native share sheet on mobile.
- **Hard mode** — every revealed hint must be reused in later guesses.
- **Dark and light themes**, following the system setting until you choose.
- **High-contrast palette** — blue/orange tiles for colour-vision deficiency.
- **Accessibility** — full keyboard operation, ARIA labels on every tile and key,
  live-region announcements of each result, and `prefers-reduced-motion` support.
- **Offline-friendly and private** — statistics, settings and the game in
  progress are stored in `localStorage`; nothing is sent anywhere. If the browser
  blocks storage, the game still plays and says so.

## Project structure

```
index.html                 markup shell, dialogs, boot-failure fallback
android/                   Capacitor Android project (icons, theme, manifest)
assets/                    logo, favicon, PNG app icons, web manifest
docs/                      publishing guide, listing copy, privacy policy
store/                     generated Play listing artwork and screenshots
src/
  data/
    answers.js             curated solutions, ordered by everyday frequency
    allowed.js             additional words accepted as guesses
  js/
    config.js              constants shared by every module
    evaluation.js          pure scoring: greens/ambers/greys, duplicates, hard mode
    dictionary.js          word validation and the daily rotation
    game.js                the per-puzzle state machine
    stats.js               statistics model and pure transforms
    settings.js            theme, hard mode, high contrast
    share.js               spoiler-free emoji grid and clipboard/share sheet
    native.js              Android bridge; a no-op in a browser
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
- **`allowed.js`** — the much larger set of words accepted as *guesses* only.
  Deliberately permissive: rejecting a word a player knows is more annoying than
  accepting an obscure one.

Both are generated by `tools/build-wordlists.mjs` from a public-domain English
dictionary and a word-frequency corpus, with profanity removed and a documented
hand-curation list for the proper nouns and brand names a web-derived frequency
list inevitably contains. No other word game's list is used as a source. The
daily rotation covers every answer before repeating.

## Design notes

The visual identity is Pentaword's own: a letter tile bearing a geometric "P" —
the visual language every word game shares, drawn as pure geometry so the icons
regenerate from one source of truth — an indigo-to-jade gradient, and a palette
that keeps the intuitive green/amber semantics while sitting in a different,
softer register than other word games. Tiles are sized from the space actually available so the whole grid
and keyboard fit on any screen without scrolling, from a small phone to a
desktop, and the keyboard stays within thumb reach at the bottom of the viewport.
Turned sideways, the board and keyboard sit side by side rather than shrinking.
