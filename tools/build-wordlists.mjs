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

await writeFile('src/data/answers.js', module_(
  'ANSWERS',
  'Puzzle solutions, ordered from most to least common in everyday English.',
  answers,
));
await writeFile('src/data/allowed.js', module_(
  'ALLOWED_GUESSES',
  'Words accepted as guesses only. The full valid set is ALLOWED_GUESSES + ANSWERS.',
  allowed.filter((w) => !seen.has(w)),
));

console.log(`answers: ${answers.length}`);
console.log(`guess-only words: ${allowed.length - answers.length}`);
console.log(`total valid guesses: ${allowed.length}`);

if (process.argv.includes('--print')) {
  console.log('\nAnswer list for review:\n');
  for (const line of chunk(answers)) console.log(`  ${line}`);
}
