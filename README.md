<div align="center">
  <img src="assets/logo.svg" width="72" height="72" alt="">
  <h1>Quintle</h1>
  <p><em>Five letters. Six tries. One word a day.</em></p>
</div>

Quintle is a five-letter word puzzle: guess the hidden word in six attempts, with
colour feedback after every guess. There is a **daily** word that is the same for
everyone on a given calendar day, and an **unlimited practice** mode for when one
puzzle a day is not enough.

It is a complete, original game — no framework, no build step, no backend, no
tracking. Everything runs in the browser and all progress stays on the device.

> Quintle is an independent project with its own name, artwork and word lists. It
> is not affiliated with, endorsed by, or derived from any other word game.

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
npm test           # unit tests for the game logic (Node's built-in runner)
npm run build:words  # regenerate the word lists (needs network)
npm run build:icons  # regenerate the PNG app icons
```

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
- **Spoiler-free sharing** — copies an emoji grid (`Quintle #244 3/6`) that shows
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
assets/                    logo, favicon, PNG app icons, web manifest
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
    storage.js             defensive localStorage wrapper
    main.js                the controller that wires model to view
    ui/                    board, keyboard, modal, toast, stats dashboard
  styles/                  tokens, layout, components, animation
tests/                     unit tests for every logic module
tools/                     word-list generator, icon generator, dev server
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

`tools/build-wordlists.mjs` documents the exact curation recipe and can rebuild
both lists from their public sources. The daily rotation covers every answer
before repeating.

## Design notes

The visual identity is Quintle's own: the quincunx mark (five dots — one per
letter), an indigo-to-jade gradient, and a palette that keeps the familiar
green/amber semantics while sitting in a different, softer register than other
word games. Tiles are sized from the space actually available so the whole grid
and keyboard fit on any screen without scrolling, from a small phone to a
desktop, and the keyboard stays within thumb reach at the bottom of the viewport.
