import fs from 'node:fs';
import { parseCsv, toWords, italianDisplay, elidesArticle } from '../js/csv.js';
import { selectWords, countByPos } from '../js/deck.js';
import {
  checkAnswer, normalise, normaliseGerman, acceptedAnswers, acceptedArticles,
  makeCard, expectedAnswer, hintMask, hintLength, hintFor, hintMax,
} from '../js/quiz.js';
import {
  recordResult,
  emptyStreak, recordPractice, currentStreak, practisedToday,
} from '../js/progress.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log('FAIL:', name); } };

const text = fs.readFileSync(new URL('../data/it-top500.csv', import.meta.url), 'utf8');
const words = toWords(parseCsv(text));

ok('500 words parsed', words.length === 500);
const libro = words.find(w => w.italian === 'libro');
ok('libro has article il', libro.article === 'il');
ok('libro display', italianDisplay(libro) === 'il libro');
ok('libro plural', libro.plural === 'libri');
const tempo = words.find(w => w.italian === 'tempo');
ok('tempo has 2 glosses', tempo.german.length === 2);
ok('example preserved with comma', words.find(w => w.italian === 'ma').exampleIt.includes(','));

// --- elision: the deck stores the gender, the app writes what Italian writes
const acqua = words.find(w => w.italian === 'acqua');
const uomo = words.find(w => w.italian === 'uomo');
const studente = words.find(w => w.italian === 'studente');
ok('feminine vowel word elides', italianDisplay(acqua) === "l'acqua");
ok('masculine vowel word elides', italianDisplay(uomo) === "l'uomo");
ok('lo before s+consonant does not elide', italianDisplay(studente) === 'lo studente');
ok('the gender survives the elision', acqua.article === 'la' && uomo.article === 'lo');
ok('elidesArticle knows its rule', elidesArticle('la', 'acqua') && !elidesArticle('la', 'casa'));
ok('il never elides', !elidesArticle('il', 'anno'));
ok('silent h elides', elidesArticle('lo', 'hotel'));

// --- normalisation: Italian accents, and the German letters a German keyboard
// makes easy to reach for instead.
ok('final accent folds', normalise('città') === normalise('citta'));
ok('e-acute folds', normalise('perché') === normalise('perche'));
ok('e-grave folds', normalise('caffè') === normalise('caffe'));
ok('accent direction does not matter', normalise('cittá') === normalise('città'));
ok('apostrophe becomes a break', normalise("l'acqua") === 'l acqua');
ok('case+punct', normalise('Il Libro!') === 'il libro');
ok('sz folds', normaliseGerman('weiß') === normaliseGerman('weiss'));
ok('german u-umlaut folds', normaliseGerman('für') === normaliseGerman('fuer'));
ok('german o-umlaut folds', normaliseGerman('schön') === normaliseGerman('schoen'));
ok('german a-umlaut folds', normaliseGerman('spät') === normaliseGerman('spaet'));
// The umlaut fold is German-only: Italian is full of "ue" and "uo" that were
// never an umlaut, and folding them would rewrite perfectly ordinary words.
ok('italian ue is left alone', normalise('due') === 'due');
ok('italian que is left alone', normalise('questo') === 'questo');
ok('german fold would have eaten it', normaliseGerman('due') === 'du');

// --- answer checking
const parlare = words.find(w => w.italian === 'parlare');
ok('de-it exact', checkAnswer('parlare', parlare, 'de-it').correct);
ok('de-it case-insensitive', checkAnswer('Parlare', parlare, 'de-it').correct);
ok('de-it wrong', !checkAnswer('mangiare', parlare, 'de-it').correct);

const perche = words.find(w => w.italian === 'perché');
ok('de-it accent optional', checkAnswer('perche', perche, 'de-it').correct);
ok('de-it accent typed correctly', checkAnswer('perché', perche, 'de-it').correct);

const andare = words.find(w => w.italian === 'andare');
ok('it-de gloss', checkAnswer('gehen', andare, 'it-de').correct);
ok('it-de second gloss', checkAnswer('fahren', andare, 'it-de').correct);
ok('it-de wrong', !checkAnswer('kommen', andare, 'it-de').correct);

const ricordare = words.find(w => w.italian === 'ricordare');
ok('reflexive gloss in full', checkAnswer('sich erinnern', ricordare, 'it-de').correct);
ok('reflexive gloss without sich', checkAnswer('erinnern', ricordare, 'it-de').correct);

const il = words.find(w => w.italian === 'il');
ok('parenthetical stripped', checkAnswer('der', il, 'it-de').correct);

// --- article handling
const casa = words.find(w => w.italian === 'casa');
ok('noun without article accepted by default', checkAnswer('casa', casa, 'de-it').correct);
ok('noun with article accepted', checkAnswer('la casa', casa, 'de-it').correct);
ok('requireArticle rejects bare', !checkAnswer('casa', casa, 'de-it', { requireArticle: true }).correct);
ok('requireArticle accepts full', checkAnswer('la casa', casa, 'de-it', { requireArticle: true }).correct);
ok('requireArticle rejects wrong article', !checkAnswer('il casa', casa, 'de-it', { requireArticle: true }).correct);
ok('wrongArticle flagged', checkAnswer('il casa', casa, 'de-it', { requireArticle: true }).wrongArticle === true);
ok('missingArticle flagged', checkAnswer('casa', casa, 'de-it', { requireArticle: true }).missingArticle === true);
// il and la are one edit apart, so a typo budget would wave the gender through —
// exactly the thing being tested.
ok('gender is never a forgiven typo',
  !checkAnswer('il casa', casa, 'de-it', { requireArticle: true, allowTypos: true }).correct);
ok('article optional: wrong article ignored', checkAnswer('il casa', casa, 'de-it', { requireArticle: false }).correct);
ok('wrong noun still rejected with right article', !checkAnswer('la strada', casa, 'de-it').correct);

// An elided noun takes either spelling: l'acqua is what the card shows, la acqua
// spells out the gender the apostrophe hides. The other gender never passes.
const opt = { requireArticle: true };
ok('elided form accepted', checkAnswer("l'acqua", acqua, 'de-it', opt).correct);
ok('unelided form accepted', checkAnswer('la acqua', acqua, 'de-it', opt).correct);
ok('wrong gender behind the apostrophe rejected',
  checkAnswer('lo acqua', acqua, 'de-it', opt).wrongArticle === true);
ok('il for a feminine word rejected', checkAnswer('il acqua', acqua, 'de-it', opt).wrongArticle === true);
ok('masculine elided form accepted', checkAnswer("l'uomo", uomo, 'de-it', opt).correct);
ok('masculine unelided form accepted', checkAnswer('lo uomo', uomo, 'de-it', opt).correct);
ok('la for a masculine word rejected', checkAnswer('la uomo', uomo, 'de-it', opt).wrongArticle === true);
// lo studente does not elide, so the apostrophe form is not Italian.
ok('apostrophe rejected where nothing elides',
  checkAnswer("l'studente", studente, 'de-it', opt).wrongArticle === true);
ok('accepted articles list the elision', acceptedArticles(acqua).has('l') && acceptedArticles(acqua).has('la'));
ok('accepted articles stop at the gender', !acceptedArticles(acqua).has('lo'));
ok('no elision, no extra article', acceptedArticles(studente).has('lo') && !acceptedArticles(studente).has('l'));

// plural-only nouns keep their plural article
const soldi = words.find(w => w.italian === 'soldi');
ok('plural article parsed', soldi.article === 'i');
ok('plural article accepted', checkAnswer('i soldi', soldi, 'de-it', opt).correct);
ok('wrong plural article rejected', checkAnswer('le soldi', soldi, 'de-it', opt).wrongArticle === true);
const capelli = words.find(w => w.italian === 'capelli');
ok('gli parsed and matched', capelli.article === 'i' && checkAnswer('i capelli', capelli, 'de-it', opt).correct);

// --- typos
const strada = words.find((w) => w.italian === 'strada');
const r1 = checkAnswer('la stradda', strada, 'de-it', { allowTypos: true });
ok('typo forgiven + flagged', r1.correct && r1.typo);
ok('typo off rejects', !checkAnswer('la stradda', strada, 'de-it', { allowTypos: false }).correct);
ok('empty rejected', !checkAnswer('   ', casa, 'de-it').correct);
ok('far-off word rejected', !checkAnswer('albero', casa, 'de-it').correct);

// swapped letters count as one slip, not two
const r2 = checkAnswer('la starda', strada, 'de-it');
ok('transposition forgiven', r2.correct && r2.typo);
ok('two separate errors still rejected', !checkAnswer('la sxrxda', strada, 'de-it').correct);

// short words get no typo forgiveness: mai and mia are one transposition apart
const mai = words.find(w => w.italian === 'mai');
ok('short word no typo budget', !checkAnswer('mia', mai, 'de-it').correct);
ok('short word exact still works', checkAnswer('mai', mai, 'de-it').correct);

// --- German nouns accept a leading article on the answer side
ok('bare German noun', checkAnswer('Buch', libro, 'it-de').correct);
ok('German noun with das', checkAnswer('das Buch', libro, 'it-de').correct);
ok('German noun with ein', checkAnswer('ein Buch', libro, 'it-de').correct);
ok('article alone rejected', !checkAnswer('das', libro, 'it-de').correct);
ok('article + wrong word rejected', !checkAnswer('das Auto', libro, 'it-de').correct);
// Stripping applies to the German side only, never to the Italian one.
ok('de-it unaffected by the article strip',
  !checkAnswer('das libro', libro, 'de-it', { requireArticle: true }).correct);

// --- selection
// The range always counts positions among the chosen types.
const nounsTop100 = selectWords(words, { posFilter: ['noun'], start: 1, end: 100 });
ok('nouns 1-100 gives 100 nouns', nounsTop100.length === 100 && nounsTop100.every(w => w.pos === 'noun'));
ok('starts at the most common noun', nounsTop100[0].italian === 'anno');
ok('nouns stay in frequency order',
  nounsTop100.every((w, i) => i === 0 || nounsTop100[i - 1].rank < w.rank));

// With every type chosen, positions and ranks coincide on a contiguous deck.
const range200_400 = selectWords(words, { posFilter: null, start: 200, end: 400 });
ok('200-400 gives 201 words', range200_400.length === 201);
ok('200-400 lines up with ranks', range200_400[0].rank === 200 && range200_400[200].rank === 400);

// The selection width is predictable regardless of the filter.
ok('width matches the slider span', selectWords(words, { posFilter: ['verb'], start: 10, end: 40 }).length === 31);
ok('range beyond the pool just stops',
  selectWords(words, { posFilter: ['article'], start: 1, end: 100 }).length === 5);
ok('start past the pool selects nothing',
  selectWords(words, { posFilter: ['article'], start: 50, end: 100 }).length === 0);

const verbsAndNouns = selectWords(words, { posFilter: ['verb', 'noun'], start: 1, end: 500 });
ok('two-type filter', verbsAndNouns.length === 111 + 200);
ok('two-type filter keeps only those types',
  verbsAndNouns.every((w) => w.pos === 'verb' || w.pos === 'noun'));

const counts = countByPos(words);
ok('counts sum to 500', Object.values(counts).reduce((a, b) => a + b, 0) === 500);

// --- cards
const card = makeCard(libro, 'it-de');
ok('card prompt is italian', card.prompt === 'il libro');
ok('card expected is german', card.expected === 'Buch');
ok('card labels', card.fromLabel === 'Italienisch' && card.toLabel === 'Deutsch');
const card2 = makeCard(libro, 'de-it');
ok('reverse card prompt', card2.prompt === 'Buch');
ok('reverse card expected', card2.expected === 'il libro');
ok('reverse card labels', card2.fromLabel === 'Deutsch' && card2.toLabel === 'Italienisch');
ok('elided card shows the apostrophe', makeCard(acqua, 'de-it').expected === "l'acqua");

// forgiving custom deck: only two columns
const mini = toWords(parseCsv('wort,übersetzung\ncane,Hund\ngatto,Katze\n'));
ok('2-column deck parses', mini.length === 2);
ok('2-column deck defaults pos', mini[0].pos === 'other');
ok('2-column deck defaults rank', mini[0].rank === 1 && mini[1].rank === 2);
ok('2-column deck answers', checkAnswer('Hund', mini[0], 'it-de').correct);

// header aliases in three languages
const en = toWords(parseCsv('italian,german,pos\ncorrere,laufen,verb\n'));
ok('english headers work', en.length === 1 && en[0].pos === 'verb');
const it = toWords(parseCsv('italiano,traduzione,categoria\ncorrere,laufen,verbo\n'));
ok('all-italian headers work', it.length === 1 && it[0].pos === 'verb');
const de = toWords(parseCsv('wort,übersetzung,wortart\ncorrere,laufen,Verb\n'));
ok('german headers work', de.length === 1 && de[0].pos === 'verb');
const unknown = toWords(parseCsv('foo,bar\ncorrere,laufen\n'));
ok('unrecognised headers yield nothing', unknown.length === 0);
const art = toWords(parseCsv('parola,deutsch,articolo,categoria\nacqua,Wasser,la,sostantivo\n'));
ok('italian article column understood', art[0].article === 'la' && italianDisplay(art[0]) === "l'acqua");

// quoted field with embedded comma and doubled quote
const q = parseCsv('a,b\n"x, y","he said ""hi"""\n');
ok('embedded comma', q[0].a === 'x, y');
ok('doubled quote', q[0].b === 'he said "hi"');

// --- homographs that differ only by part of speech must both survive
const pianoNoun = words.find((w) => w.italian === 'piano' && w.pos === 'noun');
const pianoAdv = words.find((w) => w.italian === 'piano' && w.pos === 'adverb');
ok('both piano entries survive', Boolean(pianoNoun) && Boolean(pianoAdv));
ok('homograph ids differ', pianoNoun.id !== pianoAdv.id);
ok('piano is Stockwerk and leise',
  pianoNoun.german[0] === 'Stockwerk' && pianoAdv.german[0] === 'leise');
ok('all ids unique', new Set(words.map((w) => w.id)).size === words.length);

// --- hints
ok('mask reveals prefix', hintMask('casa', 1) === 'c···');
ok('mask reveals two', hintMask('casa', 2) === 'ca··');
ok('mask keeps spaces', hintMask('per favore', 2) === 'pe· ······');
ok('mask level 0 hides all', hintMask('casa', 0) === '····');
ok('hintLength counts letters only', hintLength('per favore') === 9);

const casaCard = makeCard(casa, 'de-it');
ok('hint hides the article', hintFor(casaCard, 1).startsWith('··'));
ok('hint reveals first letter', hintFor(casaCard, 1) === '·· c···');
ok('hintMax is word length', hintMax(casaCard) === 4);
// The apostrophe is part of the article, so it stays hidden too.
ok('elided hint hides the apostrophe as well', hintFor(makeCard(acqua, 'de-it'), 1) === '·· a····');

const libroDe = makeCard(libro, 'it-de');
ok('german hint has no article slot', hintFor(libroDe, 1) === 'B···');
ok('german hintMax from first gloss', hintMax(libroDe) === 4);

// --- a hinted answer counts but must not stretch the interval
const prog = {};
recordResult(prog, 'x', 'good');
const afterGood = { ...prog.x };
recordResult(prog, 'x', 'hint');
ok('hint counts as correct', prog.x.correct === 2);
ok('hint leaves box alone', prog.x.box === afterGood.box);
ok('hint records no wrong', prog.x.wrong === 0);
recordResult(prog, 'x', 'good');
ok('good still advances after hint', prog.x.box === afterGood.box + 1);

const prog2 = {};
recordResult(prog2, 'y', 'hint');
ok('hint from scratch stays box 1', prog2.y.box === 1);

// --- alternative Italian forms ----------------------------------------------
const opts = { requireArticle: true, allowTypos: true };
const adesso = words.find((w) => w.italian === 'adesso');

ok('headword accepted', checkAnswer('adesso', adesso, 'de-it', opts).correct);
ok('alternative accepted', checkAnswer('ora', adesso, 'de-it', opts).correct);
ok('alternative is case-insensitive', checkAnswer('Ora', adesso, 'de-it', opts).correct);
ok('unrelated word still wrong', checkAnswer('domani', adesso, 'de-it', opts).correct === false);
ok('both forms shown with the answer', expectedAnswer(adesso, 'de-it') === 'adesso / ora');
ok('alternatives do not leak into the German side', expectedAnswer(adesso, 'it-de') === 'jetzt');
ok('alternative in accepted set', acceptedAnswers(adesso, 'de-it', opts).has('ora'));
ok('alternative is not a separate card',
  words.filter((w) => w.italian === 'ora' && w.pos === 'adverb').length === 0);

// with an article, the alternative still has to carry the right gender — and
// elision is decided per form, so one entry can show both spellings.
const car = {
  italian: 'macchina', article: 'la', plural: 'macchine', german: ['Auto'],
  also: ['auto'], pos: 'noun', id: 'macchina:noun',
};
ok('noun headword accepted', checkAnswer('la macchina', car, 'de-it', opts).correct);
ok('noun alternative accepted', checkAnswer("l'auto", car, 'de-it', opts).correct);
ok('alternative without article rejected',
  checkAnswer('auto', car, 'de-it', opts).missingArticle === true);
ok('alternative with wrong article rejected',
  checkAnswer('lo auto', car, 'de-it', opts).wrongArticle === true);
ok('each form is written the way Italian writes it',
  expectedAnswer(car, 'de-it') === "la macchina / l'auto");

// a word with no alternatives must behave exactly as before
const plain = { italian: 'sempre', article: '', plural: '', german: ['immer'], pos: 'adverb' };
ok('missing also field is harmless', checkAnswer('sempre', plain, 'de-it', opts).correct);
ok('no separator when there is nothing to add', expectedAnswer(plain, 'de-it') === 'sempre');

// --- streak ---------------------------------------------------------------
// Local dates on purpose: the streak follows the day the user is living in.
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

let s = emptyStreak();
ok('fresh streak is 0', currentStreak(s, at(2026, 3, 1)) === 0);
ok('fresh streak not practised today', practisedToday(s, at(2026, 3, 1)) === false);

let r = recordPractice(s, at(2026, 3, 1, 9));
s = r.streak;
ok('first practice advances', r.advanced === true && s.current === 1);
ok('first practice sets best', s.best === 1);
ok('practised today', practisedToday(s, at(2026, 3, 1, 22)) === true);

r = recordPractice(s, at(2026, 3, 1, 22));
s = r.streak;
ok('second answer same day does not advance', r.advanced === false && s.current === 1);
ok('same day does not inflate totalDays', s.totalDays === 1);

s = recordPractice(s, at(2026, 3, 2, 8)).streak;
ok('next day continues streak', s.current === 2);
s = recordPractice(s, at(2026, 3, 3, 8)).streak;
ok('third day continues', s.current === 3 && s.best === 3);

// late night then early morning is two separate days, not one
let night = emptyStreak();
night = recordPractice(night, at(2026, 3, 1, 23)).streak;
night = recordPractice(night, at(2026, 3, 2, 7)).streak;
ok('23:00 then 07:00 counts as two days', night.current === 2);

// a missed day resets the count but keeps the record
s = recordPractice(s, at(2026, 3, 5, 8)).streak;
ok('gap resets to 1', s.current === 1);
ok('gap keeps best', s.best === 3);
ok('gap counts a new practice day', s.totalDays === 4); // Mar 1, 2, 3, 5

ok('yesterday still counts as live', currentStreak(s, at(2026, 3, 6)) === 1);
ok('two days later reads as broken', currentStreak(s, at(2026, 3, 7)) === 0);
ok('stored count survives the lapse', s.current === 1);

// month and year boundaries go through setDate, not millisecond arithmetic
let edge = emptyStreak();
edge = recordPractice(edge, at(2026, 3, 31)).streak;
edge = recordPractice(edge, at(2026, 4, 1)).streak;
ok('month boundary continues', edge.current === 2);
edge = recordPractice(edge, at(2026, 4, 2)).streak;
ok('month boundary keeps counting', edge.current === 3);

let ny = emptyStreak();
ny = recordPractice(ny, at(2026, 12, 31)).streak;
ny = recordPractice(ny, at(2027, 1, 1)).streak;
ok('year boundary continues', ny.current === 2);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
