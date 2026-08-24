// Validates every deck listed in data/manifest.json against the real parser
// and grader: schema, gender, unique identities, and that each word can be
// answered, hinted and graded in both directions.
import fs from 'node:fs';
import { parseCsv, toWords, italianDisplay, germanDisplay, POS_VALUES, VALID_ARTICLES } from '../js/csv.js';
import { selectWords, countByPos } from '../js/deck.js';
import { checkAnswer, makeCard, hintFor, hintMax, normalise } from '../js/quiz.js';

import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(`${ROOT}/data/manifest.json`, 'utf8'));

// An article that must never be accepted in place of the right one. Gender is
// the thing being tested, so la for il and il for la; lo and il are both
// masculine, but "il studente" is still not Italian, so a masculine mix-up has
// to fail too — which the la/il pairing below covers by never being right.
const WRONG_ARTICLE = { il: 'la', lo: 'la', la: 'il', i: 'le', gli: 'le', le: 'i' };

let problems = 0;
const flag = (msg) => { problems++; console.log('  !!', msg); };

for (const deck of manifest) {
  const text = fs.readFileSync(`${ROOT}/${deck.file}`, 'utf8');
  const words = toWords(parseCsv(text));
  console.log(`\n${deck.name}  [${deck.id}]  ${words.length} words`);

  // every row parsed with the essentials
  for (const w of words) {
    if (!w.italian) flag(`empty italian at rank ${w.rank}`);
    if (!w.german || !w.german.length) flag(`no translation for ${w.italian}`);
    if (!POS_VALUES.includes(w.pos)) flag(`bad pos "${w.pos}" on ${w.italian}`);
    if (w.pos === 'noun' && !w.article) flag(`noun without article: ${w.italian}`);
    if (w.pos !== 'noun' && w.article) flag(`non-noun with article: ${w.italian}`);
    if (w.article && !VALID_ARTICLES.includes(w.article)) flag(`bad article on ${w.italian}`);
    // The deck records the underlying gender and the app elides on the way out.
    // An l' in the file would throw that away — see csv.js.
    if (/^l['’]/i.test(w.italian)) flag(`article left on the headword: ${w.italian}`);
    if (!w.exampleIt) flag(`no example sentence for ${w.italian}`);
    if (!w.exampleDe) flag(`example not translated: ${w.italian}`);
  }

  // identity collisions would merge progress records
  const ids = new Map();
  for (const w of words) {
    const key = `${w.italian.toLowerCase()}|${w.pos}`;
    if (ids.has(key)) flag(`duplicate identity: ${w.italian} (${w.pos})`);
    ids.set(key, w);
  }

  // Accents are stripped before answers are compared, so two words of the same
  // type that differ only by an accent cannot be told apart when typed — "papa"
  // and "papà" would grade as each other.
  const folded = new Map();
  for (const w of words) {
    const key = `${normalise(w.italian)}|${w.pos}`;
    if (folded.has(key) && folded.get(key) !== w.italian) {
      flag(`indistinguishable once accents are stripped: ${folded.get(key)} and ${w.italian}`);
    }
    folded.set(key, w.italian);
  }

  // Two words with the same German gloss and the same part of speech make an
  // unanswerable Deutsch → Italienisch card: the prompt cannot say which is
  // wanted.
  const prompts = new Map();
  for (const w of words) {
    const key = `${germanDisplay(w).toLowerCase()}|${w.pos}`;
    if (prompts.has(key)) {
      flag(`ambiguous German prompt "${germanDisplay(w)}" (${w.pos}): ${prompts.get(key)} and ${w.italian}`);
    }
    prompts.set(key, w.italian);
  }

  // ranks usable by the range selector
  const ranks = words.map((w) => w.rank);
  if (new Set(ranks).size !== ranks.length) flag('duplicate ranks');
  if (Math.min(...ranks) !== 1) flag(`ranks do not start at 1 (min ${Math.min(...ranks)})`);

  const counts = countByPos(words);
  console.log('  pos:', Object.entries(counts).filter(([, n]) => n).map(([p, n]) => `${p} ${n}`).join(', '));

  // the range selector and both directions actually work on this deck
  const all = selectWords(words, { posFilter: null, start: 1, end: words.length });
  if (all.length !== words.length) flag(`full range gave ${all.length} of ${words.length}`);

  const nouns = selectWords(words, { posFilter: ['noun'], start: 1, end: 10 });
  console.log('  first nouns:', nouns.slice(0, 4).map(italianDisplay).join(', ') || '(none)');

  // grading works both ways on every single word, with the article required
  for (const w of words) {
    const it = makeCard(w, 'it-de');
    const de = makeCard(w, 'de-it');
    void it; void de;

    const deAnswer = w.german[0];
    if (!checkAnswer(deAnswer, w, 'it-de', { requireArticle: true }).correct) {
      flag(`own translation rejected: ${w.italian} -> "${deAnswer}"`);
    }
    // A German noun answered with an article is as right as the bare one, and
    // the app has no way to know which article the gloss would take.
    if (w.pos === 'noun' && !checkAnswer(`die ${deAnswer}`, w, 'it-de', { requireArticle: true }).correct) {
      flag(`"die ${deAnswer}" rejected for noun ${w.italian}`);
    }
    const itAnswer = italianDisplay(w);
    if (!checkAnswer(itAnswer, w, 'de-it', { requireArticle: true }).correct) {
      flag(`own italian rejected: "${itAnswer}"`);
    }
    if (w.article && checkAnswer(w.italian, w, 'de-it', { requireArticle: true }).correct) {
      flag(`bare noun accepted despite requireArticle: ${w.italian}`);
    }
    // Spelling out the article an l' hides has to stay right, and the wrong
    // gender has to stay wrong — typo budget or not.
    if (w.article) {
      if (!checkAnswer(`${w.article} ${w.italian}`, w, 'de-it', { requireArticle: true }).correct) {
        flag(`unelided article rejected: ${w.article} ${w.italian}`);
      }
      const wrong = WRONG_ARTICLE[w.article];
      if (checkAnswer(`${wrong} ${w.italian}`, w, 'de-it', { requireArticle: true }).correct) {
        flag(`wrong article accepted for ${w.italian}: "${wrong}"`);
      }
    }
    // Every alternative in `also` has to be answerable too, or it is decoration.
    for (const alt of w.also) {
      const spelled = w.article ? `${w.article} ${alt}` : alt;
      if (!checkAnswer(spelled, w, 'de-it', { requireArticle: true }).correct) {
        flag(`alternative rejected: ${w.italian} -> "${spelled}"`);
      }
    }
    // Hints must never be empty or give the whole thing away. The button is
    // hidden below 2 letters and clamps to hintMax-1, so that is the ceiling
    // the app can actually reach.
    for (const card of [it, de]) {
      if (hintMax(card) < 2) continue; // no hint button offered for these
      const ceiling = hintMax(card) - 1;
      const h = hintFor(card, 1);
      if (typeof h !== 'string' || !h.length) flag(`bad hint for ${w.italian}`);
      if (!hintFor(card, ceiling).includes('·')) {
        flag(`hint spells out ${w.italian} (${card.dir})`);
      }
      if (card.dir === 'de-it' && w.article && !hintFor(card, ceiling).startsWith('··')) {
        flag(`hint leaks the article for ${w.italian}`);
      }
    }
  }

  // long entries are awkward on a phone-width card
  const longest = [...words].sort((a, b) => germanDisplay(b).length - germanDisplay(a).length)[0];
  console.log('  longest gloss:', `${longest.italian} -> ${germanDisplay(longest)}`);
}

// Every deck must be precached, or it is unavailable offline until it happens
// to be opened while online.
const sw = fs.readFileSync(`${ROOT}/sw.js`, 'utf8');
console.log('\nservice worker precache');
for (const deck of manifest) {
  if (!sw.includes(`'${deck.file}'`)) flag(`${deck.file} missing from sw.js ASSETS`);
}
if (!sw.includes("'data/manifest.json'")) flag('manifest.json missing from sw.js ASSETS');
console.log(`  ${manifest.length} decks checked`);

console.log(problems ? `\n${problems} problems` : '\nall decks clean');
process.exit(problems ? 1 : 0);
