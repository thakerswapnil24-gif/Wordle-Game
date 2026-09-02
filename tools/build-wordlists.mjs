#!/usr/bin/env node
/**
 * Regenerates `src/data/answers.js` and `src/data/allowed.js`.
 *
 * Provenance
 * ----------
 * Both lists are built only from general-purpose, freely redistributable
 * sources. Nothing here is derived from a proprietary word game or Scrabble
 * dictionary:
 *
 *   dictionary — dwyl/english-words, a public-domain English word list.
 *   scowl      — sindresorhus/word-list, derived from SCOWL (permissive).
 *   enable     — the ENABLE word list, released into the public domain.
 *   frequency  — first20hours/google-10000-english, words ranked by how often
 *                they occur in the Google Web Trillion Word Corpus.
 *   profanity  — LDNOOBW, a community list of obscene terms to exclude.
 *
 * The three dictionaries are unioned because none of them alone is complete:
 * each contributes thousands of five-letter words the others omit. There is no
 * single authoritative list of "every five-letter English word" — dictionaries
 * genuinely disagree — so the union of the largest freely licensed ones is the
 * closest honest approximation.
 *
 * Curation recipe
 * ---------------
 * Guess list   — every five-letter word in any of the three dictionaries, minus
 *                profanity. Permissive on purpose: rejecting a word a player
 *                knows is far more annoying than accepting an obscure one.
 * Answer list  — the five-letter words of the frequency list that a dictionary
 *                confirms, in frequency order, minus profanity, minus trivial
 *                plurals, minus BLOCKLIST. Deliberately narrow: a solution
 *                should be a word every player knows.
 *
 * BLOCKLIST is the hand-curation step and it is meant to be maintained. A
 * frequency corpus drawn from the web is full of names, places and brands that
 * a dictionary happens to also contain in lowercase, and no automatic rule
 * separates them reliably. After changing a source, re-read the printed answer
 * list and add anything that should not be a puzzle solution.
 *
 * Usage: node tools/build-wordlists.mjs [--print]   (requires network access)
 */
import { writeFile } from 'node:fs/promises';

const SOURCES = {
  dictionary: 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt',
  scowl: 'https://raw.githubusercontent.com/sindresorhus/word-list/main/words.txt',
  enable: 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  frequency: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa.txt',
  profanity: 'https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/en',
};

/**
 * Excluded from the ANSWER list only — every one of these is still a legal
 * guess. Grouped by why it is here.
 */
const BLOCKLIST = new Set(`
${/* People's names */ ''}
aaron alice allan allen annie barry belle betty billy blair blake bobby brian
bruce bryan carey carlo casey chris cindy clara clark derek david davis dylan
eddie edgar ellen elvis emily glenn helen isaac jacob jamie janet jason jenny
jerry jesse jimmy joyce julie karen kathy katie keith kenny kevin larry linda
lloyd lucia marco maria marie mario moore nancy oscar perry peter ralph randy
ricky roger sarah scott simon singh steve susan terry tommy tracy tyler wayne
wendy floyd harry henry holly jones julia kelly kerry laura lewis louis nikon
sally smith cohen colin craig danny devon diana diane donna james leone monte
${/* Places, nationalities and languages */ ''}
april asian chile china congo costa czech delhi diego egypt essex ghana haiti
hindu idaho iraqi irish islam italy japan kenya korea latin maine malta miami
milan nepal notre omaha papua qatar salem samoa santa saudi sudan syria tamil
tampa tokyo tulsa welsh yemen yukon burke dover greek india logan roman spain
texas verde dutch niger
${/* Brands and product names */ ''}
cisco honda intel kodak mazda xerox yahoo chevy emacs linux ebook
${/* Jargon, abbreviations and web-corpus noise */ ''}
admin ascii const debug devel login setup intro promo inter macro modem allah
mardi multi inbox indie rehab
${/* Informal contractions the frequency corpus is full of */ ''}
gonna gotta wanna kinda
${/* Plurals the automatic rule does not catch */ ''}
boxes buses spies taxes tries
${/* Loanwords that read as proper nouns or are too niche for a daily answer */ ''}
anime manga samba mambo scuba disco cyber retro turbo
${/* Unpleasant, distressing or crude — not what anyone wants at breakfast */ ''}
abuse death drunk fraud naked nasty slave spank sperm theft thong tumor booty
rouge chuck cedar yeast laden chick
${/* Religious texts and figures — kept out so no faith is singled out */ ''}
bible
`.trim().split(/\s+/).filter(Boolean));

/**
 * Profane five-letter inflections the source profanity list misses, because it
 * carries base forms ("twat", "cunt") while the dictionaries carry plurals and
 * participles.
 *
 * This is an explicit list rather than a stem-matching rule on purpose. Treating
 * any word whose first three or four letters are profane as profane rejects
 * TITLE, TITAN, ASSET, ASSAY, SPICE, SPICY, CUMIN and BUTTE — turning a safety
 * measure into exactly the failure it is meant to prevent, a game that refuses
 * ordinary words.
 */
const PROFANE_INFLECTIONS = new Set(`
coony cunts faggy fagot fucks kikes mongs poofs porns raped raper rapes shits
sluts smuts spick spics twats wanky
`.trim().split(/\s+/));

const IS_WORD = /^[a-z]{5}$/;

/**
 * How hard a word is to guess, scored 0 (easiest) to 1 (hardest).
 *
 * The daily puzzle draws from the harder end of the answer list, so this decides
 * what "harder" means. The weights favour words that genuinely cost guesses over
 * words that are merely obscure — an unfamiliar word is frustrating, whereas a
 * word you know but cannot pin down is the puzzle working.
 *
 *   neighbours   The strongest signal. A word one letter away from many other
 *                answers can burn every remaining guess: _OUND is BOUND, FOUND,
 *                HOUND, MOUND, POUND, ROUND, SOUND, WOUND.
 *   repeated     Doubled letters break the instinct to spend guesses on new
 *                letters, and the colouring for them is what players misread.
 *   rarity       Position in the frequency list. Weighted modestly on purpose:
 *                the whole answer list is already common English, so this
 *                separates "less everyday" from "everyday", not "obscure".
 *   rareLetters  J Q X Z V W K F are tried late, if at all.
 *   fewVowels    One vowel leaves less to anchor on than three.
 */
function difficultyScores(answers) {
  const n = answers.length;
  const RARE_LETTERS = new Set('jqxzvwkf');
  const VOWELS = new Set('aeiou');

  // Words at Hamming distance 1 from each other, bucketed by the pattern they
  // share so this stays linear-ish rather than comparing every pair.
  const neighbours = new Map(answers.map((w) => [w, 0]));
  for (let position = 0; position < 5; position += 1) {
    const buckets = new Map();
    for (const word of answers) {
      const pattern = `${word.slice(0, position)}.${word.slice(position + 1)}`;
      if (!buckets.has(pattern)) buckets.set(pattern, []);
      buckets.get(pattern).push(word);
    }
    for (const group of buckets.values()) {
      if (group.length < 2) continue;
      for (const word of group) neighbours.set(word, neighbours.get(word) + group.length - 1);
    }
  }
  const mostNeighbours = Math.max(1, ...neighbours.values());

  return new Map(answers.map((word, index) => {
    const rarity = n > 1 ? index / (n - 1) : 0;
    const neighbourShare = neighbours.get(word) / mostNeighbours;
    const repeated = new Set(word).size < 5 ? 1 : 0;
    const rare = [...word].filter((c) => RARE_LETTERS.has(c)).length / 3;
    const vowels = [...word].filter((c) => VOWELS.has(c)).length;
    const fewVowels = vowels <= 1 ? 1 : vowels === 2 ? 0.4 : 0;

    const score = 0.35 * neighbourShare
      + 0.25 * repeated
      + 0.20 * rarity
      + 0.10 * Math.min(1, rare)
      + 0.10 * fewVowels;
    return [word, { score, neighbours: neighbours.get(word), repeated, vowels }];
  }));
}

/**
 * Share of the answer list reserved for the daily puzzle, taken from the hard
 * end. Practice keeps the whole list, so its average difficulty sits at the
 * median while the daily's sits well above it — which is the point.
 *
 * 0.6 rather than 0.5 keeps the daily rotation long: the sequence covers every
 * daily answer before repeating, so this is also how many days of unique
 * puzzles exist before the cycle comes round.
 */
const DAILY_SHARE = 0.6;

async function fetchWords(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.text()).split(/\r?\n/).map((w) => w.trim().toLowerCase()).filter(Boolean);
}

function chunk(words, perLine = 12) {
  const lines = [];
  for (let i = 0; i < words.length; i += perLine) lines.push(words.slice(i, i + perLine).join(' '));
  return lines;
}

function module_(name, doc, words) {
  // The generated files embed these words in a template literal, so a word
  // containing a backtick or `${` would become executable code. Every word has
  // already passed IS_WORD, but assert it here too: this is the boundary where
  // remote, third-party data turns into source we commit and ship, and it
  // should not rely on a filter applied somewhere further upstream.
  const unsafe = words.filter((w) => !IS_WORD.test(w));
  if (unsafe.length > 0) {
    throw new Error(`refusing to emit ${unsafe.length} malformed word(s): ${unsafe.slice(0, 5).join(', ')}`);
  }

  return `// Generated by tools/build-wordlists.mjs — do not edit by hand.\n`
    + `// ${doc}\n`
    + `// ${words.length} words.\n\n`
    + `export const ${name} = \`\n${chunk(words).join('\n')}\n\`.trim().split(/\\s+/);\n`;
}

const [dictionaryRaw, scowlRaw, enableRaw, frequencyRaw, profanityRaw] = await Promise.all(
  Object.values(SOURCES).map(fetchWords),
);

/** Used for the plural test, which needs four-letter stems too. */
const dictionaryAll = new Set([...dictionaryRaw, ...scowlRaw, ...enableRaw]);
const frequency = frequencyRaw.filter((w) => IS_WORD.test(w));
const profanity = new Set(profanityRaw);

const everyFiveLetterWord = new Set(
  [...dictionaryRaw, ...scowlRaw, ...enableRaw].filter((w) => IS_WORD.test(w)),
);

// Profanity and slurs are excluded from guesses as well as answers: a word game
// has no reason to acknowledge them, and players do not expect it to.
const allowed = [...everyFiveLetterWord]
  .filter((w) => !profanity.has(w) && !PROFANE_INFLECTIONS.has(w))
  .sort();

for (const [name, raw] of [['dwyl', dictionaryRaw], ['scowl', scowlRaw], ['enable', enableRaw]]) {
  const count = raw.filter((w) => IS_WORD.test(w)).length;
  console.log(`${name.padEnd(8)} contributes ${count} five-letter words`);
}

/** "books", "years" — fair as guesses, unsatisfying as a solution. */
const isTrivialPlural = (w) =>
  w.endsWith('s') && !w.endsWith('ss') && dictionaryAll.has(w.slice(0, -1));

const allowedSet = new Set(allowed);
const seen = new Set();
const answers = frequency.filter((w) => {
  if (seen.has(w) || !allowedSet.has(w)) return false;
  if (BLOCKLIST.has(w) || isTrivialPlural(w)) return false;
  seen.add(w);
  return true;
});

if (answers.length < 500) {
  throw new Error(`only ${answers.length} answers survived curation — check the sources`);
}

// Rank by difficulty and reserve the harder end for the daily puzzle.
const scores = difficultyScores(answers);
const byDifficulty = [...answers].sort((a, b) => scores.get(b).score - scores.get(a).score);
const dailyAnswers = byDifficulty.slice(0, Math.round(answers.length * DAILY_SHARE));
// Emitted in frequency order, not difficulty order, so the file stays readable
// and the daily rotation's own shuffle is the only thing deciding sequence.
const dailySet = new Set(dailyAnswers);
const dailyInFrequencyOrder = answers.filter((w) => dailySet.has(w));

await writeFile('src/data/answers.js', module_(
  'ANSWERS',
  'Every puzzle solution, ordered from most to least common in everyday English.',
  answers,
) + '\n' + module_(
  'DAILY_ANSWERS',
  'The harder share of ANSWERS, reserved for the daily puzzle. Practice draws\n'
    + '// from the whole list, so the daily is consistently the tougher one.',
  dailyInFrequencyOrder,
).split('\n').slice(1).join('\n'));
await writeFile('src/data/allowed.js', module_(
  'ALLOWED_GUESSES',
  'Words accepted as guesses only. The full valid set is ALLOWED_GUESSES + ANSWERS.',
  allowed.filter((w) => !seen.has(w)),
));

console.log(`answers: ${answers.length}`);
console.log(`daily answers: ${dailyAnswers.length} (${(DAILY_SHARE * 100).toFixed(0)}% hardest — ${Math.floor(dailyAnswers.length / 365)}y ${dailyAnswers.length % 365}d of unique dailies)`);
console.log(`hardest 12:  ${byDifficulty.slice(0, 12).join(' ')}`);
console.log(`easiest 12:  ${byDifficulty.slice(-12).join(' ')}`);
console.log(`guess-only words: ${allowed.length - answers.length}`);
console.log(`total valid guesses: ${allowed.length}`);

if (process.argv.includes('--print')) {
  console.log('\nAnswer list for review:\n');
  for (const line of chunk(answers)) console.log(`  ${line}`);
}
