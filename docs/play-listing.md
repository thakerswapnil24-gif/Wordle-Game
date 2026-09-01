# Play Console listing content

Copy-paste material for the store listing, plus the answers to the
questionnaires. Character limits are Google's.

---

## App name (30 characters max)

```
Pentaword
```

If you want the category to show in search results, this also fits:

```
Pentaword: Daily Word Puzzle
```

## Short description (80 characters max)

```
A daily five-letter word puzzle. Six tries, plus unlimited practice rounds.
```

*(74 characters)*

## Full description (4000 characters max)

```
Guess the hidden five-letter word in six tries.

Every guess colours in: green means the letter is in the right place, amber
means it belongs somewhere else, grey means it is not in the word at all. Work
out the answer from what the board tells you.

ONE WORD A DAY
Everyone gets the same daily puzzle, so you and your friends are always solving
the same word. Come back tomorrow for the next one — there is a countdown on the
statistics screen.

UNLIMITED PRACTICE
Not content with one a day? Practice mode deals a new random word whenever you
want one, with its own separate statistics.

TRACK YOUR FORM
Games played, wins, win percentage, current streak, best streak, and a chart of
how many guesses you usually need.

SHARE WITHOUT SPOILING
One tap copies a grid of coloured squares showing the shape of your solve. It
never reveals the answer or any of your guesses, so it is safe to post before
your friends have played.

BUILT TO BE COMFORTABLE
- Light and dark themes that follow your phone
- A high-contrast palette for colour-vision deficiency
- Large tiles and a keyboard that stays within thumb reach
- Works in portrait and landscape, on phones and tablets
- Optional hard mode, where every hint you uncover must be reused

COMPLETELY OFFLINE, COMPLETELY PRIVATE
No account. No ads. No in-app purchases. No analytics. No internet connection
needed. Your statistics never leave your device — they are not uploaded
anywhere, because there is nowhere to upload them to.

Over 18,000 five-letter words are accepted as guesses — drawn from several
English dictionaries so the game rarely rejects a word you know — while the
daily answers come from a hand-reviewed list of common, inoffensive words.
Profanity and slurs are excluded from both.
```

## Category and tags

- **App or game:** Game
- **Category:** Word
- **Tags:** word game, puzzle, brain game, vocabulary

## Contact details

- **Email:** your support address (required and shown publicly on the listing)
- **Website:** optional
- **Privacy policy:** the GitHub Pages URL from `docs/PUBLISHING.md` step 5

---

## Data safety form

Google asks these on **Policy → App content → Data safety**. Pentaword makes no
network requests at all, which makes every answer straightforward.

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | *(not applicable — no data is collected)* |
| Do you provide a way for users to request that their data is deleted? | *(not applicable)* |

Declare **no data collected** and **no data shared**. Statistics, settings and
the game in progress are written to the app's own local storage, which Google
does not count as collection because nothing is transmitted off the device.

If asked to elaborate, this is accurate:

> Pentaword stores your statistics, settings and current game in local storage
> on your device. This information is never transmitted anywhere. The app makes
> no network requests and contains no analytics, advertising or tracking
> libraries.

---

## Content rating questionnaire

Category: **Puzzle / Word game**. Expected outcome: **Everyone / PEGI 3**.

| Question | Answer |
| --- | --- |
| Violence, blood, or gore | No |
| Sexual content or nudity | No |
| Profanity or crude humour | No |
| References to drugs, alcohol, or tobacco | No |
| Simulated gambling, or real-money gambling | No |
| User-generated content or user interaction | No |
| Does the app share the user's location? | No |
| Does the app allow purchases? | No |
| Does the app contain ads? | No |

Profanity and slurs are excluded from the guess list as well as the answer list,
and the daily answers are further filtered to common, inoffensive words — see
`tools/build-wordlists.mjs`. The app requests no permissions beyond INTERNET,
makes no network requests, and contains no ads, purchases or tracking; see
`docs/SECURITY.md`.

---

## Advertising ID

**Policy → App content → Advertising ID:** answer **No**, the app does not use
an advertising ID. The manifest declares no advertising permissions.

## Government apps, financial features, health

All **No**.

## Target audience

Suitable for all ages. If you select an audience that includes children under
13, Google applies the Families policy — the app already complies (no ads, no
data collection, no external links), but the questionnaire is longer. Selecting
**13+** keeps the process simpler if you do not specifically want a children's
audience.
