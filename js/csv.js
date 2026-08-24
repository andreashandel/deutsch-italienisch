// CSV parsing and normalisation into the word shape the rest of the app uses.
//
// The parser is deliberately forgiving: a custom deck only has to supply an
// Italian column and a German column. Everything else is optional and gets a
// sensible default, so a two-column file typed in Excel just works.

/**
 * Parse CSV text into an array of row objects keyed by header name.
 * Handles quoted fields, embedded commas and newlines, doubled quotes,
 * CRLF line endings and a leading UTF-8 BOM.
 */
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // Swallow the \n of a \r\n pair.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }

  // Trailing field / row when the file does not end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];

  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? '').trim();
    });
    return obj;
  });
}

// Accepted spellings for each logical column, German and Italian (and English,
// so a list downloaded from an English-language site still opens).
const COLUMN_ALIASES = {
  rank: ['rank', 'rang', 'nr', 'no', 'nummer', 'number', 'numero', 'frequency', 'freq', 'frequenza'],
  italian: ['italian', 'italienisch', 'italiano', 'it', 'wort', 'word', 'parola', 'vocabolo', 'term', 'termine'],
  german: [
    'german', 'deutsch', 'de', 'tedesco', 'übersetzung', 'uebersetzung', 'ubersetzung',
    'translation', 'traduzione', 'bedeutung', 'meaning', 'significato',
  ],
  article: ['article', 'artikel', 'articolo', 'gender', 'genus', 'genere'],
  plural: ['plural', 'pl', 'plurale', 'mehrzahl'],
  pos: [
    'pos', 'wortart', 'type', 'wordtype', 'word_type', 'part_of_speech', 'partofspeech',
    'categoria', 'classe',
  ],
  example_it: ['example_it', 'beispiel_it', 'esempio', 'frase', 'example', 'satz'],
  example_de: ['example_de', 'beispiel', 'beispiel_de', 'beispielsatz', 'example_translation'],
  // Further Italian words meaning the same thing. Accepted when answering, and
  // shown with the answer, but never the prompt: "adesso" and "ora" are one
  // vocabulary item, not two cards.
  also: ['also', 'alt', 'alternative', 'alternativen', 'synonym', 'synonyme', 'auch', 'anche', 'sinonimo'],
};

function pickColumn(row, logical) {
  for (const alias of COLUMN_ALIASES[logical]) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return '';
}

export const POS_VALUES = [
  'noun',
  'verb',
  'adjective',
  'adverb',
  'pronoun',
  'preposition',
  'conjunction',
  'article',
  'numeral',
  'other',
];

/** Plural, for the filter checkboxes and the table column. */
export const POS_LABELS = {
  noun: 'Substantive',
  verb: 'Verben',
  adjective: 'Adjektive',
  adverb: 'Adverbien',
  pronoun: 'Pronomen',
  preposition: 'Präpositionen',
  conjunction: 'Konjunktionen',
  article: 'Artikel',
  numeral: 'Zahlwörter',
  other: 'Sonstige',
};

/**
 * Singular, for the chip on a card and the table rows. German nouns decline,
 * so "Substantive" sitting over a single word reads as a category heading
 * rather than as a description of the word in front of you.
 */
export const POS_LABELS_ONE = {
  noun: 'Substantiv',
  verb: 'Verb',
  adjective: 'Adjektiv',
  adverb: 'Adverb',
  pronoun: 'Pronomen',
  preposition: 'Präposition',
  conjunction: 'Konjunktion',
  article: 'Artikel',
  numeral: 'Zahlwort',
  other: 'Sonstiges',
};

const POS_ALIASES = {
  noun: ['noun', 'n', 'nomen', 'substantiv', 'hauptwort', 'sostantivo', 'nome'],
  verb: ['verb', 'v', 'verben', 'zeitwort', 'verbo'],
  adjective: ['adjective', 'adj', 'adjektiv', 'eigenschaftswort', 'aggettivo'],
  adverb: ['adverb', 'adv', 'umstandswort', 'avverbio'],
  pronoun: ['pronoun', 'pron', 'pronomen', 'fürwort', 'furwort', 'pronome'],
  preposition: ['preposition', 'prep', 'präposition', 'praposition', 'verhältniswort', 'preposizione'],
  conjunction: ['conjunction', 'conj', 'konjunktion', 'bindewort', 'congiunzione'],
  article: ['article', 'art', 'artikel', 'geschlechtswort', 'articolo'],
  numeral: ['numeral', 'num', 'number', 'zahlwort', 'numerale', 'numero'],
};

function normalisePos(raw) {
  const v = raw.trim().toLowerCase();
  if (!v) return 'other';
  for (const [canonical, aliases] of Object.entries(POS_ALIASES)) {
    if (aliases.includes(v)) return canonical;
  }
  return 'other';
}

/**
 * Italian has two genders, and the definite article is how a dictionary marks
 * them: il/lo for masculine, la for feminine. The plural forms are here too,
 * for the handful of words that are only ever used in the plural
 * ("gli occhiali", "i soldi").
 *
 * The elided form l' is deliberately *not* on this list. It is written in the
 * deck as the underlying lo or la, and elision is applied on the way out — see
 * italianDisplay. That way the deck still records the gender of "l'acqua",
 * which is exactly what the app tests.
 */
export const VALID_ARTICLES = ['il', 'lo', 'la', 'i', 'gli', 'le'];

/**
 * Whether lo/la contract to l' in front of this word.
 *
 * Only the singular articles elide, and only before a vowel or a silent h:
 * l'acqua, l'ora, l'hotel — but lo studente and lo zaino keep their vowel
 * because the word behind them does not start with one.
 */
export function elidesArticle(article, word) {
  if (article !== 'lo' && article !== 'la') return false;
  return /^[aeiouàáèéìíòóùúh]/i.test(word);
}

/**
 * Turn parsed rows into word objects. Rows without both an Italian and a
 * German side are dropped rather than silently producing unanswerable cards.
 */
export function toWords(rows) {
  const words = [];

  rows.forEach((row, index) => {
    const italian = pickColumn(row, 'italian');
    const germanRaw = pickColumn(row, 'german');
    if (!italian || !germanRaw) return;

    const rankRaw = parseInt(pickColumn(row, 'rank'), 10);
    const article = pickColumn(row, 'article').toLowerCase();
    const pos = normalisePos(pickColumn(row, 'pos'));

    words.push({
      rank: Number.isFinite(rankRaw) ? rankRaw : index + 1,
      italian,
      article: VALID_ARTICLES.includes(article) ? article : '',
      plural: pickColumn(row, 'plural'),
      german: germanRaw
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      also: pickColumn(row, 'also')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      pos,
      exampleIt: pickColumn(row, 'example_it'),
      exampleDe: pickColumn(row, 'example_de'),
      // Part of speech is part of the identity: "il piano" (Stockwerk) and
      // "piano" (langsam) are different words spelled the same, and each needs
      // its own progress record.
      id: `${italian.toLowerCase()}:${pos}`,
    });
  });

  // Later duplicates of the same headword would collide on progress tracking.
  const seen = new Set();
  return words.filter((w) => {
    if (seen.has(w.id)) return false;
    seen.add(w.id);
    return true;
  });
}

/** "il libro", "l'acqua" for nouns with a known gender, otherwise the headword. */
export function italianDisplay(word) {
  return articleFor(word, word.italian) + word.italian;
}

/** The article as written in front of one particular form, with its spacing. */
export function articleFor(word, form) {
  if (!word.article) return '';
  return elidesArticle(word.article, form) ? "l'" : `${word.article} `;
}

export function germanDisplay(word) {
  return word.german.join('; ');
}

export async function loadDeckFromUrl(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url} konnte nicht geladen werden (${res.status})`);
  return toWords(parseCsv(await res.text()));
}
