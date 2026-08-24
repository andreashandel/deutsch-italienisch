// Card generation and answer checking.
//
// Answer checking is deliberately generous. The goal is to test whether the
// word is known, not whether a German keyboard can be talked into producing
// à, è or ù with its dead keys. "città", "citta" and "cittá" all count.

import { italianDisplay, articleFor, germanDisplay, elidesArticle } from './csv.js';

/**
 * Reduce a string to a comparable core: lower case, no accents, no punctuation.
 *
 * Italian accents are stripped rather than demanded. They sit almost entirely
 * on final syllables (città, perché, così, più) and carry stress, not meaning,
 * so a learner who knows the word but not the dead-key combination should not
 * be marked wrong for it. The exact spelling is shown with every answer.
 *
 * The apostrophe goes the same way as every other punctuation mark, so
 * "l'acqua" compares as "l acqua" — which is what makes the article check
 * below able to treat l' as an article like any other.
 */
export function normalise(text) {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The same, plus the German habit of writing an umlaut as a digraph: "fuer"
 * has to compare equal to "für", whose dots NFD has just removed.
 *
 * This fold is kept off the Italian side on purpose. Italian is full of "ue"
 * and "uo" — questo, guerra, due — and collapsing those would mangle words
 * that were never spelled with an umlaut in the first place.
 */
export function normaliseGerman(text) {
  return normalise(text)
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

/** Which normaliser a direction's answer side wants. */
function normaliserFor(dir) {
  return dir === 'it-de' ? normaliseGerman : normalise;
}

/**
 * Damerau-Levenshtein distance, used only to forgive small typos.
 *
 * Counting a swap of neighbouring letters as one slip rather than two matters
 * here: "csaa" for "casa" is exactly what a thumb does on a tablet keyboard,
 * and under plain Levenshtein it would cost 2 and blow the budget for any word
 * shorter than twelve characters.
 */
function editDistance(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prevPrev = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prevPrev[j - 2] + 1);
      }
    }
    prevPrev = prev;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Every spelling we are willing to accept for one German gloss.
 * "der Mann" also accepts "Mann"; "gut (wieder)" also accepts "gut";
 * "sich erinnern" also accepts "erinnern".
 */
function germanVariants(gloss) {
  const out = new Set();
  const add = (s) => {
    const n = normaliseGerman(s);
    if (n) out.add(n);
  };

  add(gloss);
  const noParens = gloss.replace(/\([^)]*\)/g, ' ');
  add(noParens);

  for (const base of [gloss, noParens]) {
    const trimmed = base.trim();
    add(trimmed.replace(/^(der|die|das|ein|eine)\s+/i, ''));
    add(trimmed.replace(/^sich\s+/i, ''));
    add(trimmed.replace(/^(der|die|das|ein|eine)\s+/i, '').replace(/^sich\s+/i, ''));
  }

  return out;
}

/**
 * The articles accepted in front of this word, as normalised strings.
 *
 * A noun that elides takes two: "l'acqua" is what the card shows and what a
 * learner will type, but "la acqua" spells out the gender the elision hides,
 * and getting the gender right is the point. "lo acqua" is not on the list —
 * that is the wrong gender, elided or not.
 */
export function acceptedArticles(word) {
  const out = new Set();
  if (!word.article) return out;
  for (const form of [word.italian, ...(word.also || [])]) {
    out.add(normalise(word.article));
    if (elidesArticle(word.article, form)) out.add('l');
  }
  return out;
}

// Longest first, so "gli" is not cut short to "l" and "la" not to "l".
const LEADING_ARTICLE = /^(gli|il|lo|la|le|i|l)\s+/;

/**
 * The set of accepted answers for a card.
 * With requireArticle on, an Italian noun must be answered with its article.
 */
export function acceptedAnswers(word, dir, { requireArticle = false } = {}) {
  const out = new Set();

  if (dir === 'it-de') {
    for (const gloss of word.german) {
      for (const v of germanVariants(gloss)) out.add(v);
    }
    return out;
  }

  for (const form of [word.italian, ...(word.also || [])]) {
    if (word.article) {
      out.add(normalise(`${articleFor(word, form)}${form}`));
      out.add(normalise(`${word.article} ${form}`));
      if (!requireArticle) out.add(normalise(form));
    } else {
      out.add(normalise(form));
    }
  }
  return out;
}

/** Typo budget: none for very short words, one slip normally, two for long ones. */
function typoBudget(answer) {
  if (answer.length < 4) return 0;
  if (answer.length < 12) return 1;
  return 2;
}

/**
 * Grade a typed answer.
 * Returns whether it counts, and whether it only counted because a typo was
 * forgiven, so the UI can still show the exact spelling.
 */
export function checkAnswer(input, word, dir, opts = {}) {
  const { allowTypos = true, requireArticle = false } = opts;
  let guess = normaliserFor(dir)(input);
  if (!guess) return { correct: false, typo: false };

  // Articles are graded exactly, never fuzzily: telling il from la is the whole
  // point of the require-article setting, and a one-character typo budget would
  // otherwise wave the wrong gender straight through.
  if (dir === 'de-it' && word.article) {
    const leading = guess.match(LEADING_ARTICLE);
    if (requireArticle) {
      if (!leading) return { correct: false, typo: false, missingArticle: true };
      if (!acceptedArticles(word).has(leading[1])) {
        return { correct: false, typo: false, wrongArticle: true };
      }
    }
    if (leading) guess = guess.slice(leading[0].length);
  }

  // The article has already been checked and stripped above, so what remains to
  // match is the bare headword or any of its alternatives.
  const accepted =
    dir === 'de-it' && word.article
      ? new Set([word.italian, ...(word.also || [])].map(normalise))
      : acceptedAnswers(word, dir, { requireArticle });

  const guesses = [guess];
  if (dir === 'it-de') {
    // Answering a German noun as "das Jahr" is as right as "Jahr".
    const bare = guess.replace(/^(der|die|das|ein|eine)\s+/, '');
    if (bare && bare !== guess) guesses.push(bare);
  }

  for (const g of guesses) {
    if (accepted.has(g)) return { correct: true, typo: false };
  }

  if (allowTypos) {
    for (const g of guesses) {
      for (const answer of accepted) {
        if (editDistance(g, answer) <= typoBudget(answer)) {
          return { correct: true, typo: true };
        }
      }
    }
  }

  return { correct: false, typo: false };
}

/* ------------------------------------------------------------------ hints */

const LETTER = /[\p{L}\p{N}]/u;

/** Reveal the first `level` letters of `text`; mask the rest, keeping spacing. */
export function hintMask(text, level) {
  let shown = 0;
  let out = '';
  for (const ch of text) {
    if (!LETTER.test(ch)) {
      out += ch;
    } else if (shown < level) {
      out += ch;
      shown += 1;
    } else {
      out += '·';
    }
  }
  return out;
}

/** Letters available to reveal — one past this and the hint is the answer. */
export function hintLength(text) {
  return [...text].filter((ch) => LETTER.test(ch)).length;
}

/** The word a hint uncovers: the first German gloss, or the Italian headword. */
function hintSource(card) {
  return card.dir === 'it-de' ? card.word.german[0] || '' : card.word.italian;
}

export function hintMax(card) {
  return hintLength(hintSource(card));
}

/**
 * A partially revealed answer.
 *
 * A noun's article is never uncovered by a hint. The gender is the thing being
 * tested, so handing it over would defeat the exercise — the placeholder stays
 * in front as a reminder that it is still owed.
 */
export function hintFor(card, level) {
  const masked = hintMask(hintSource(card), level);
  return card.dir === 'de-it' && card.word.article ? `·· ${masked}` : masked;
}

/**
 * What the card shows as the correct answer once it is revealed. Alternatives
 * are listed too, so "tra" is learned rather than merely accepted.
 */
export function expectedAnswer(word, dir) {
  if (dir === 'it-de') return germanDisplay(word);
  const alts = (word.also || []).map((alt) => `${articleFor(word, alt)}${alt}`);
  return [italianDisplay(word), ...alts].join(' / ');
}

export function promptFor(word, dir) {
  return dir === 'it-de' ? italianDisplay(word) : germanDisplay(word);
}

/** 'mixed' resolves per card so a session alternates directions. */
export function resolveDirection(direction) {
  if (direction === 'mixed') return Math.random() < 0.5 ? 'it-de' : 'de-it';
  return direction;
}

export function makeCard(word, direction) {
  const dir = resolveDirection(direction);
  return {
    word,
    dir,
    prompt: promptFor(word, dir),
    expected: expectedAnswer(word, dir),
    fromLabel: dir === 'it-de' ? 'Italienisch' : 'Deutsch',
    toLabel: dir === 'it-de' ? 'Deutsch' : 'Italienisch',
  };
}
