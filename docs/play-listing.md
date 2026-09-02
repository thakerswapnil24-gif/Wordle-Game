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
the same word. It is one attempt: when today's is done it is done, and yesterday's
word cannot be played late. A countdown shows when the next one unlocks. Daily
words are picked from the trickier end of the list, so they are meant to make you
think.

UNLIMITED PRACTICE
Not content with one a day? Practice mode deals a new random word whenever you
want one, from the full word list, with its own separate statistics.

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

FREE, WITH NO STRINGS
No account, no sign-up, no in-app purchases, no paywall. Pentaword is free and
supported by ads, and every feature is available to everyone. The daily puzzle is
never interrupted mid-game.

YOUR PROGRESS STAYS YOURS
Statistics and settings are stored on your device and are never uploaded — the
game has no server to upload them to. The puzzles themselves work with no
internet connection at all.

Over 18,000 five-letter words are accepted as guesses — drawn from several
English dictionaries so the game rarely rejects a word you know — while the
daily answers come from the harder end of a hand-reviewed list of common,
inoffensive words.
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

Filed under **Policy → App content → Data safety**.

> **These answers must describe the build you actually upload.** Under-declaring
> is one of the most common causes of suspension, so if you publish an ad-free
> build first (for example for early closed testing), file the *ad-free* column
> and switch when the ads build goes out.

| Question | Ad-supported build | Ad-free build |
| --- | --- | --- |
| Does your app collect or share any required user data types? | **Yes** | No |
| Data type collected | **Device or other IDs** → *Advertising ID* | — |
| Is it shared with third parties? | **Yes** — with Google, for advertising | — |
| Purpose | **Advertising or marketing**, and **Fraud prevention** | — |
| Is collection optional or required? | **Required** (ads fund the app) | — |
| Is data encrypted in transit? | **Yes** | — |
| Can users request deletion? | **Yes** — resetting or deleting the advertising ID in Android Settings → Privacy → Ads | — |

Nothing else is collected in either case. Statistics, settings and the game in
progress are written to the app's own local storage and never transmitted, which
Google does not count as collection.

Note that the **advertising ID is the only** data type to declare. Do not tick
Location: AdMob infers coarse region from the IP address, which Google's own
guidance treats as part of the advertising data rather than a location
permission, and the app requests no location permission.

If asked to elaborate:

> Pentaword stores your statistics, settings and current game in local storage on
> your device; this is never transmitted. The app serves ads through Google
> AdMob, which collects your device's advertising ID, IP address, device
> information and ad interaction data in order to select and measure ads. The app
> contains no analytics, and the developer receives only aggregate earnings
> reports.

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
| Does the app contain ads? | **Yes** |



---

## Advertising ID

**Policy → App content → Advertising ID:** answer **Yes**. The app uses the
advertising ID, through Google AdMob, to select ads and cap how often the same
ad is shown. Declare the purposes **Advertising or marketing** and **Fraud
prevention**.

The Ads SDK adds `com.google.android.gms.permission.AD_ID` to the merged
manifest, which is what Play checks this answer against — a mismatch between the
two is rejected at review.

## Government apps, financial features, health

All **No**.

## Target audience

Select **13 and over**. The game's content suits all ages, but an audience that
includes under-13s puts the app under Google's **Families policy**, which for an
ad-supported app means: ads may only come from Families-certified ad networks,
the advertising ID must not be used, interstitials are restricted, and the whole
questionnaire is longer and stricter.

If you ever do want a children's audience, the ad setup has to change first —
see the Families note in `docs/ADS.md`. Do not tick it with the standard AdMob
configuration in place.
