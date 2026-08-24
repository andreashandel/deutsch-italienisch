// End-to-end test: loads index.html into jsdom, shims the browser APIs the app
// touches, imports app.js for real, and drives the actual UI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name, extra); }
};

const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), {
  url: 'http://localhost:8765/',
  pretendToBeVisual: true,
});

const { window } = dom;

// Serve fetches straight off disk.
window.fetch = async (url) => {
  const rel = String(url).replace(/^https?:\/\/localhost:8765\//, '');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, text: async () => '', json: async () => { throw new Error('404'); } };
  }
  const body = fs.readFileSync(file, 'utf8');
  return { ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) };
};

// Not implemented by jsdom; the app only asks whether it has a fine pointer.
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.scrollTo = () => {};
window.confirm = () => true;

// Speech is absent from jsdom; stub it so the speaker buttons are exercisable.
const spoken = [];
// Swappable so the no-Italian-voice case can be exercised further down.
let stubVoices = [{ lang: 'it-IT', name: 'Test Italian' }];
const voiceListeners = [];
window.speechSynthesis = {
  getVoices: () => stubVoices,
  speak: (u) => spoken.push(u.text),
  cancel: () => {},
  addEventListener: (type, fn) => {
    if (type === 'voiceschanged') voiceListeners.push(fn);
  },
};
window.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};

for (const key of ['document', 'localStorage', 'fetch', 'Blob', 'confirm', 'Event',
                   'speechSynthesis', 'SpeechSynthesisUtterance']) {
  globalThis[key] = window[key];
}
globalThis.window = window;
globalThis.document = window.document;

const $ = (id) => window.document.getElementById(id);
const settle = () => new Promise((r) => setTimeout(r, 60));
const fire = (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true }));

await import('../js/app.js');
await settle();

/* ------------------------------------------------------------ setup screen */

ok('interface is in german', window.document.documentElement.lang === 'de');
ok('article required by default', $('opt-article').checked === true);

ok('deck loaded', $('deck-summary').textContent === '500 Wörter geladen', $('deck-summary').textContent);
ok('deck option present', $('deck-select').options.length >= 1);
ok('pos checkboxes built', $('pos-filter').querySelectorAll('.check').length === 10);
ok('pos labels are german', /Substantive/.test($('pos-filter').textContent), $('pos-filter').textContent);
ok('setup visible at boot', $('screen-setup').hidden === false);
ok('session hidden at boot', $('screen-session').hidden === true);
ok('help hidden at boot', $('screen-help').hidden === true);

// default 1-100, all types
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '100'; fire($('range-end'), 'input');
await settle();
ok('1-100 selects 100', $('selection-count').textContent.startsWith('100 Wörter'), $('selection-count').textContent);

// 200-400 on the full list
$('range-start').value = '200'; fire($('range-start'), 'input');
$('range-end').value = '400'; fire($('range-end'), 'input');
await settle();
ok('200-400 selects 201', $('selection-count').textContent.startsWith('201 Wörter'), $('selection-count').textContent);

$('btn-pos-none').click();
const nounBox = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'noun');
nounBox.checked = true; fire(nounBox, 'change');
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '50'; fire($('range-end'), 'input');
await settle();
ok('nouns 1-50 gives 50 nouns', $('selection-count').textContent.startsWith('50 Wörter'), $('selection-count').textContent);
ok('hint names the type', /Substantive/.test($('range-hint').textContent), $('range-hint').textContent);
ok('hint states the pool size', /200/.test($('range-hint').textContent), $('range-hint').textContent);
ok('hint states the positions', /1–50|1-50/.test($('range-hint').textContent), $('range-hint').textContent);

// Widening the type filter keeps the width but changes what falls inside it.
$('btn-pos-all').click();
await settle();
ok('width unchanged by filter', $('selection-count').textContent.startsWith('50 Wörter'),
  $('selection-count').textContent);
ok('hint switches to the whole list', /alle 500 Wörter der Liste/.test($('range-hint').textContent),
  $('range-hint').textContent);

// Two types ticked: not the whole list, and no single type to name.
$('btn-pos-none').click();
for (const v of ['noun', 'verb']) {
  const box = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === v);
  box.checked = true; fire(box, 'change');
}
await settle();
ok('hint counts the mixed pool', /311 Wörter, die du angehakt hast/.test($('range-hint').textContent),
  $('range-hint').textContent);

$('btn-pos-all').click();
await settle();
ok('all-types hint on the full deck', /alle 500 Wörter der Liste/.test($('range-hint').textContent),
  $('range-hint').textContent);

// empty selection disables the start buttons
$('btn-pos-none').click();
await settle();
ok('empty selection warns', $('selection-count').classList.contains('empty'));
ok('empty selection says so in german', /Keine Wörter/.test($('selection-count').textContent),
  $('selection-count').textContent);
ok('typing disabled when empty', $('btn-typing').disabled === true);
ok('flashcards disabled when empty', $('btn-flash').disabled === true);

$('btn-pos-core').click();
await settle();
ok('core preset re-enables', $('btn-typing').disabled === false);

/* -------------------------------------------------------- typing session */

$('opt-length').value = '10'; fire($('opt-length'), 'change');
window.document.querySelector('input[name="direction"][value="it-de"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="it-de"]'), 'change');

$('btn-typing').click();
await settle();
ok('session screen shown', $('screen-session').hidden === false);
ok('typing area shown', $('typing-area').hidden === false);
ok('flash area hidden', $('flash-area').hidden === true);
ok('counter starts at 1/10', $('session-counter').textContent === '1 / 10', $('session-counter').textContent);
ok('direction label in german', $('card-direction').textContent === 'Italienisch → Deutsch',
  $('card-direction').textContent);
ok('prompt is non-empty', $('card-prompt').textContent.length > 0);
ok('feedback hidden initially', $('feedback').hidden === true);

// answer the first card wrong on purpose
$('answer-input').value = 'ganz sicher nicht die antwort';
$('btn-check').click();
await settle();
ok('wrong answer gives feedback', $('feedback').hidden === false);
ok('wrong verdict', $('verdict').classList.contains('wrong'), $('verdict').textContent);
ok('wrong verdict in german', $('verdict').textContent === 'Leider nicht', $('verdict').textContent);
ok('correct answer revealed', $('correct-answer').textContent.length > 0);
ok('example sentence shown', $('example-line').textContent.length > 0);
ok('input locked after answering', $('answer-input').disabled === true);

$('btn-next').click();
await settle();
ok('advanced to card 2', $('session-counter').textContent === '2 / 10');
ok('input unlocked on new card', $('answer-input').disabled === false);
ok('input cleared on new card', $('answer-input').value === '');

// accent buttons insert into the field
$('answer-input').value = 'citt';
$('accent-row').querySelector('[data-ch="à"]').click();
ok('accent button inserts', $('answer-input').value === 'città', $('answer-input').value);
ok('accent row offers the six accented vowels',
  [...$('accent-row').querySelectorAll('button')].map((b) => b.dataset.ch).join('') === 'àèéìòù');

// work through the rest of the session
for (let i = 2; i <= 10; i++) {
  $('answer-input').value = '';
  $('btn-check').click();
  await settle();
  $('btn-next').click();
  await settle();
}
ok('summary shown after last card', $('screen-summary').hidden === false);
ok('session screen hidden', $('screen-session').hidden === true);
ok('score line present', /von 10 richtig/.test($('summary-score').textContent), $('summary-score').textContent);
ok('missed list populated', $('missed-list').children.length > 0);
ok('retry button offered', $('btn-retry-missed').hidden === false);

/* ------------------------------------------------------------- progress */

const stored = JSON.parse(window.localStorage.getItem('italiano:progress:v1:builtin:it-top500') || '{}');
ok('progress saved for 10 words', Object.keys(stored).length === 10, String(Object.keys(stored).length));
const anyRec = Object.values(stored)[0];
ok('record has box/seen/due', anyRec && 'box' in anyRec && 'seen' in anyRec && 'due' in anyRec);
ok('wrong answer reset box to 1', Object.values(stored).some((r) => r.box === 1 && r.wrong > 0));

$('btn-to-setup').click();
await settle();
ok('back to setup', $('screen-setup').hidden === false);
ok('stats line updated', /am Lernen|sitzen/.test($('progress-stats').textContent), $('progress-stats').textContent);

/* ----------------------------------------------------------- flashcards */

$('btn-flash').click();
await settle();
ok('flash area shown', $('flash-area').hidden === false);
ok('typing area hidden', $('typing-area').hidden === true);
ok('grade row hidden before reveal', $('grade-row').hidden === true);
ok('reveal button visible', $('btn-reveal').hidden === false);
ok('grade buttons in german',
  [...$('grade-row').querySelectorAll('button')].map((b) => b.textContent).join('/') === 'Nochmal/Gut/Leicht');

$('btn-reveal').click();
await settle();
ok('grade row shown after reveal', $('grade-row').hidden === false);
ok('answer shown after reveal', $('correct-answer').textContent.length > 0);
ok('next button hidden in flash mode', $('btn-next').hidden === true);

const beforeIdx = $('session-counter').textContent;
$('grade-row').querySelector('[data-grade="good"]').click();
await settle();
ok('grading advances the card', $('session-counter').textContent !== beforeIdx, $('session-counter').textContent);
ok('reveal button back for new card', $('btn-reveal').hidden === false);

$('btn-quit').click();
await settle();
ok('quit returns to setup', $('screen-setup').hidden === false);

/* --------------------------------------------------------------- browse */

$('btn-browse').click();
await settle();
ok('browse screen shown', $('screen-browse').hidden === false);
const rowCount = $('browse-body').children.length;
ok('browse renders rows', rowCount > 0, String(rowCount));
ok('browse title counts', /\d+ Wörter/.test($('browse-title').textContent), $('browse-title').textContent);
ok('browse columns are german',
  [...window.document.querySelectorAll('.word-table th')].map((t) => t.textContent).join('/') === '#/Italienisch/Deutsch/Art');

$('browse-search').value = 'casa';
fire($('browse-search'), 'input');
await settle();
ok('search filters', $('browse-body').children.length < rowCount && $('browse-body').children.length > 0,
  String($('browse-body').children.length));

$('browse-search').value = '';
fire($('browse-search'), 'input');
window.document.querySelector('.word-table th[data-sort="italian"]').click();
await settle();
ok('sort by italian works', $('browse-body').children.length === rowCount);
ok('sorted header marked', window.document.querySelector('th[data-sort="italian"]').classList.contains('sorted'));

$('btn-browse-back').click();
await settle();
ok('browse back to setup', $('screen-setup').hidden === false);

/* -------------------------------------------------- settings persistence */

const settings = JSON.parse(window.localStorage.getItem('italiano:settings:v1') || '{}');
ok('range start persisted', Number.isFinite(settings.start));
ok('session length persisted', settings.sessionLength === 10, String(settings.sessionLength));
ok('pos filter persisted', Array.isArray(settings.posFilter));
ok('direction persisted in the new scheme', ['it-de', 'de-it', 'mixed'].includes(settings.direction),
  settings.direction);

/* ------------------------------- regression: flashcards then typing ------ */
// The reveal handler hides Next; a following typing session must get it back.

$('btn-flash').click();
await settle();
$('btn-reveal').click();
await settle();
ok('flash reveal hides next', $('btn-next').hidden === true);
ok('flash reveal shows no verdict', $('verdict').textContent === '', $('verdict').textContent);
$('btn-quit').click();
await settle();

$('btn-typing').click();
await settle();
ok('typing after flash: next visible', $('btn-next').hidden === false);
$('answer-input').value = 'unsinn als antwort';
$('btn-check').click();
await settle();
ok('typing after flash: feedback usable', $('feedback').hidden === false && $('btn-next').hidden === false);
ok('typing after flash: verdict restored', $('verdict').textContent.length > 0, $('verdict').textContent);
$('btn-next').click();
await settle();
ok('typing after flash: advances', $('session-counter').textContent === '2 / 10', $('session-counter').textContent);
$('btn-quit').click();
await settle();

/* ------------------------------------------------ hints and pronunciation */

// Force Italienisch → Deutsch so the prompt side is the one carrying the speaker.
window.document.querySelector('input[name="direction"][value="it-de"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="it-de"]'), 'change');
$('btn-typing').click();
await settle();

ok('hint hidden until asked', $('hint-line').hidden === true);
ok('hint button offered', $('btn-hint').hidden === false);
ok('hint button in german', $('btn-hint').textContent === 'Tipp', $('btn-hint').textContent);

$('btn-hint').click();
await settle();
ok('hint appears', $('hint-line').hidden === false);
const firstHint = $('hint-line').textContent;
ok('hint masks with dots', firstHint.includes('·'), firstHint);

$('btn-hint').click();
await settle();
const secondHint = $('hint-line').textContent;
ok('second hint reveals more', secondHint.replace(/[^·]/g, '').length < firstHint.replace(/[^·]/g, '').length,
  firstHint + ' -> ' + secondHint);

// keep pressing; it must stop one short of spelling the whole answer
for (let i = 0; i < 30 && !$('btn-hint').disabled; i++) $('btn-hint').click();
await settle();
ok('hint stops short of the answer', $('hint-line').textContent.includes('·'), $('hint-line').textContent);
ok('hint button disables at the ceiling', $('btn-hint').disabled === true);

// answering after a hint must not re-enable hinting for that card
$('answer-input').value = $('hint-line').textContent.replace(/·/g, '') + 'zzz';
$('btn-check').click();
await settle();
ok('hint locks out further hints', $('btn-hint').disabled === true);

$('btn-next').click();
await settle();
$('btn-hint').click();
await settle();
$('answer-input').value = '';
$('btn-check').click();
await settle();
ok('hint verdict distinct', $('verdict').textContent.length > 0);

$('btn-quit').click();
await settle();

/* ---- speaker buttons ---- */

$('btn-typing').click();
await settle();
const spokenBefore = spoken.length;
ok('auto-speak off by default', spokenBefore === 0, String(spokenBefore));
ok('prompt speaker shown on it-de', $('btn-speak-prompt').hidden === false);
ok('answer speaker hidden before reveal', $('btn-speak-answer').hidden === true);

$('btn-speak-prompt').click();
await settle();
ok('speaker button speaks', spoken.length === spokenBefore + 1, String(spoken.length));
ok('speaks the italian headword', /\w/.test(spoken[spoken.length - 1] || ''), spoken[spoken.length - 1]);

$('answer-input').value = 'nein';
$('btn-check').click();
await settle();
ok('answer speaker stays hidden on it-de', $('btn-speak-answer').hidden === true);
$('btn-quit').click();
await settle();

// Deutsch → Italienisch puts the Italian on the answer side
window.document.querySelector('input[name="direction"][value="de-it"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="de-it"]'), 'change');
$('btn-typing').click();
await settle();
ok('prompt speaker hidden on de-it', $('btn-speak-prompt').hidden === true);
$('answer-input').value = 'nein';
$('btn-check').click();
await settle();
ok('answer speaker shown on de-it', $('btn-speak-answer').hidden === false);
const beforeAnswerSpeak = spoken.length;
$('btn-speak-answer').click();
await settle();
ok('answer speaker speaks', spoken.length === beforeAnswerSpeak + 1);

$('btn-quit').click();
await settle();
ok('requireArticle persisted true', JSON.parse(window.localStorage.getItem('italiano:settings:v1')).requireArticle === true);

/* ------------------------------------------------------ switching decks -- */

const topKey = 'italiano:progress:v1:builtin:it-top500';
const topCountBefore = Object.keys(JSON.parse(window.localStorage.getItem(topKey))).length;

const deckSel = $('deck-select');
const builtinOpts = [...deckSel.options].filter((o) => o.value.startsWith('builtin:'));
ok('all four decks offered', builtinOpts.length === 4, String(builtinOpts.length));
ok('food deck listed', builtinOpts.some((o) => o.value === 'builtin:it-food'));
ok('numbers deck listed', builtinOpts.some((o) => o.value === 'builtin:it-numbers'));
ok('time deck listed', builtinOpts.some((o) => o.value === 'builtin:it-time'));
ok('deck names are german', builtinOpts.some((o) => o.textContent === 'Zahlen & Zählen'),
  builtinOpts.map((o) => o.textContent).join(' | '));

deckSel.value = 'builtin:it-food';
fire(deckSel, 'change');
await settle();
ok('food deck loaded', $('deck-summary').textContent === '131 Wörter geladen', $('deck-summary').textContent);

$('btn-pos-all').click();
$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '131'; fire($('range-end'), 'input');
await settle();
ok('food range selects all 131', $('selection-count').textContent.startsWith('131 Wörter'), $('selection-count').textContent);

// the pos filter must rebuild for a deck with a different mix of types
const foodTypes = [...$('pos-filter').querySelectorAll('.check')].map((c) => c.textContent);
ok('food filter drops unused types', foodTypes.length < 10 && foodTypes.length >= 3, String(foodTypes.length));

// This deck has only four of the ten types, so "nothing excluded" cannot be
// detected by counting ticked types — it has to compare against the deck.
ok('all-types hint on a partial-type deck',
  /alle 131 Wörter der Liste/.test($('range-hint').textContent), $('range-hint').textContent);

const firstFoodBox = $('pos-filter').querySelector('input');
firstFoodBox.checked = false; fire(firstFoodBox, 'change');
await settle();
ok('unticking one type switches the wording',
  /die du angehakt hast/.test($('range-hint').textContent), $('range-hint').textContent);
firstFoodBox.checked = true; fire(firstFoodBox, 'change');
await settle();

// a session on the new deck runs, and writes to its own progress key
$('opt-length').value = '10'; fire($('opt-length'), 'change');
$('btn-typing').click();
await settle();
ok('food session starts', $('screen-session').hidden === false);
ok('food counter', $('session-counter').textContent === '1 / 10', $('session-counter').textContent);
$('answer-input').value = 'falsch';
$('btn-check').click();
await settle();
ok('food card grades', $('feedback').hidden === false);
$('btn-quit').click();
await settle();

const foodKey = 'italiano:progress:v1:builtin:it-food';
ok('food progress stored separately', window.localStorage.getItem(foodKey) !== null);
ok('top500 progress untouched by food session',
  Object.keys(JSON.parse(window.localStorage.getItem(topKey))).length === topCountBefore,
  String(Object.keys(JSON.parse(window.localStorage.getItem(topKey))).length));

// numbers deck: the range selector must cope with a deck of numerals
deckSel.value = 'builtin:it-numbers';
fire(deckSel, 'change');
await settle();
ok('numbers deck loaded', $('deck-summary').textContent === '116 Wörter geladen', $('deck-summary').textContent);
$('btn-pos-none').click();
const numBox = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'numeral');
ok('numeral type offered', Boolean(numBox));
numBox.checked = true; fire(numBox, 'change');
await settle();
ok('numerals selectable', /^\d+ (Wort|Wörter)/.test($('selection-count').textContent), $('selection-count').textContent);

deckSel.value = 'builtin:it-time';
fire(deckSel, 'change');
await settle();
ok('time deck loaded', $('deck-summary').textContent === '120 Wörter geladen', $('deck-summary').textContent);

/* -------------------------------------------------- streak, logo, audio -- */

const logo = window.document.querySelector('.app-header .logo');
ok('logo rendered in header', logo !== null);
ok('logo is the pizza', logo.textContent.trim() === '🍕', logo.textContent);
ok('logo is labelled for screen readers', logo.getAttribute('aria-label') === 'Pizza');
// The header mark and the streak chip must be the same glyph, or they read as
// two different brands sitting one above the other.
ok('logo matches the streak icon',
  logo.textContent.trim() === window.document.querySelector('.streak-icon').textContent.trim());

// A session ran earlier in this file, so today is already credited.
const streakRaw = window.localStorage.getItem('italiano:streak:v1');
ok('streak persisted', streakRaw !== null);
const streakRec = JSON.parse(streakRaw || '{}');
ok('streak counted one day', streakRec.current === 1, String(streakRec.current));
ok('streak recorded best', streakRec.best === 1);
ok('streak chip reads live', $('streak-chip').classList.contains('done-today'));
ok('streak chip not cold', $('streak-chip').classList.contains('cold') === false);
ok('streak label mentions the run', /1 Tag am Stück/.test($('streak-label').textContent),
  $('streak-label').textContent);

// The example speaker only appears once the answer is revealed.
deckSel.value = 'builtin:it-top500';
fire(deckSel, 'change');
await settle();
$('btn-pos-core').click();
$('opt-length').value = '10'; fire($('opt-length'), 'change');
window.document.querySelector('input[name="direction"][value="it-de"]').checked = true;
fire(window.document.querySelector('input[name="direction"][value="it-de"]'), 'change');
$('btn-typing').click();
await settle();

ok('example speaker hidden before answering', $('btn-speak-example').hidden === true);

$('answer-input').value = 'nein';
$('btn-check').click();
await settle();

const currentPrompt = $('card-prompt').textContent;
ok('example speaker shown after answering', $('btn-speak-example').hidden === false);
ok('example text rendered', $('example-text').textContent.length > 0);
ok('speaker sits beside the italian sentence',
  $('btn-speak-example').parentElement.tagName === 'EM');

const beforeExample = spoken.length;
$('btn-speak-example').click();
await settle();
ok('example speaker speaks', spoken.length === beforeExample + 1, String(spoken.length));

// The whole point: it must read the example sentence, not the headword.
const said = spoken[spoken.length - 1] || '';
const shownSentence = $('example-text').querySelector('em').textContent.replace('🔊', '').trim();
ok('speaks exactly the sentence on screen', said === shownSentence, `${said} | ${shownSentence}`);
ok('speaks more than the headword', said !== currentPrompt, said);
ok('sentence ends like a sentence', /[.!?]$/.test(said), said);

$('btn-quit').click();
await settle();

/* ------------------------------------------------- Enter key behaviour --- */
// Regression: Enter used to check the answer and then immediately advance,
// because the keydown bubbled to the document handler whose guard submit() had
// just satisfied. One press must check and stop.

const pressEnter = (el) => {
  const ev = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
};

$('btn-pos-core').click();
$('opt-length').value = '10'; fire($('opt-length'), 'input');
$('btn-typing').click();
await settle();
ok('enter test: session started', $('session-counter').textContent === '1 / 10');

$('answer-input').value = 'eindeutig falsch';
pressEnter($('answer-input'));
await settle();
ok('enter checks the answer', $('feedback').hidden === false);
ok('enter does not advance', $('session-counter').textContent === '1 / 10',
  $('session-counter').textContent);
ok('enter shows the correct answer', $('correct-answer').textContent.length > 0);
ok('enter locks the input', $('answer-input').disabled === true);

// A second press, now that the input is disabled, moves on.
pressEnter($('btn-next'));
await settle();
ok('second enter advances', $('session-counter').textContent === '2 / 10',
  $('session-counter').textContent);
ok('second enter advances exactly one card', $('feedback').hidden === true);

// Enter on an empty box should still grade (as wrong), not silently do nothing.
$('answer-input').value = '';
pressEnter($('answer-input'));
await settle();
ok('enter on empty input still checks', $('feedback').hidden === false);
ok('empty answer counts as wrong', $('verdict').classList.contains('wrong'));

$('btn-quit').click();
await settle();

/* ------------------------------------------------------------ sliders --- */

ok('range start is a slider', $('range-start').type === 'range');
ok('range end is a slider', $('range-end').type === 'range');
ok('length is a slider', $('opt-length').type === 'range');

$('range-start').value = '10'; fire($('range-start'), 'input');
$('range-end').value = '60'; fire($('range-end'), 'input');
await settle();
ok('slider values shown', $('range-start-out').textContent === '10' && $('range-end-out').textContent === '60',
  $('range-start-out').textContent + '/' + $('range-end-out').textContent);
ok('slider range selects', $('selection-count').textContent.startsWith('51 Wörter'),
  $('selection-count').textContent);

// Dragging start past end pushes end along rather than being blocked.
$('range-start').value = '90'; fire($('range-start'), 'input');
await settle();
ok('start pushes end', parseInt($('range-end').value, 10) === 90, $('range-end').value);
ok('pushed end shown', $('range-end-out').textContent === '90');
ok('pushed range is one word', $('selection-count').textContent.startsWith('1 Wort '),
  $('selection-count').textContent);

// Dragging end below start pushes start back down.
$('range-end').value = '40'; fire($('range-end'), 'input');
await settle();
ok('end pushes start', parseInt($('range-start').value, 10) === 40, $('range-start').value);

$('range-start').value = '1'; fire($('range-start'), 'input');
$('range-end').value = '200'; fire($('range-end'), 'input');
await settle();

// The length slider is bounded by the selection and says "alle" at the top.
const selNow = parseInt($('selection-count').textContent, 10);
ok('length slider max tracks selection',
  parseInt($('opt-length').max, 10) === Math.max(5, Math.min(selNow, 200)),
  $('opt-length').max + ' vs ' + selNow);

$('opt-length').value = '35'; fire($('opt-length'), 'input');
await settle();
ok('length value shown', $('opt-length-out').textContent === '35', $('opt-length-out').textContent);

$('opt-length').value = $('opt-length').max; fire($('opt-length'), 'input');
await settle();
ok('length at max reads as alle', /^alle /.test($('opt-length-out').textContent),
  $('opt-length-out').textContent);

$('opt-length').value = '10'; fire($('opt-length'), 'input');
await settle();

/* --------------------------------------------------- word type on card --- */

// Narrow to nouns so the label is predictable.
$('btn-pos-none').click();
const nounOnly = [...$('pos-filter').querySelectorAll('input')].find((i) => i.value === 'noun');
nounOnly.checked = true; fire(nounOnly, 'change');
await settle();
$('btn-typing').click();
await settle();
ok('word type shown on card', $('card-pos').hidden === false);
// Singular on the card, plural on the filter: "Substantive" over one word reads
// as a heading rather than a description of the word in front of you.
ok('word type says Substantiv', $('card-pos').textContent === 'Substantiv', $('card-pos').textContent);
ok('direction label still present', $('card-direction').textContent.includes('→'));

// The plural is a clue about the Italian word, so it only shows on the Italian
// side. Direction is it-de here, so a noun with a plural must show it.
ok('plural line uses the german word Mehrzahl',
  $('card-extra').textContent === '' || /^Mehrzahl: /.test($('card-extra').textContent),
  $('card-extra').textContent);

$('btn-quit').click();
await settle();

/* ----------------------------------------------------------- menu button - */

ok('back button is labelled', /Men/i.test($('btn-quit').textContent), $('btn-quit').textContent);
ok('back button explains itself', /Men/i.test($('btn-quit').getAttribute('aria-label')));

/* -------------------------------------- range survives a smaller deck ---- */
// A range set on the 500-word list must not outrun a 115-word one.

$('btn-pos-all').click();
deckSel.value = 'builtin:it-top500';
fire(deckSel, 'change');
await settle();
$('range-start').value = '300'; fire($('range-start'), 'input');
$('range-end').value = '480'; fire($('range-end'), 'input');
await settle();
ok('wide range set on big deck', $('selection-count').textContent.startsWith('181 Wörter'),
  $('selection-count').textContent);

deckSel.value = 'builtin:it-numbers';
fire(deckSel, 'change');
await settle();
ok('sliders rebounded to smaller deck', parseInt($('range-start').max, 10) === 116,
  $('range-start').max);
ok('start pulled back into range', parseInt($('range-start').value, 10) <= 116,
  $('range-start').value);
ok('end pulled back into range', parseInt($('range-end').value, 10) <= 116, $('range-end').value);
ok('start not past end', parseInt($('range-start').value, 10) <= parseInt($('range-end').value, 10));
ok('smaller deck still selects words', /^\d+ (Wort|Wörter)/.test($('selection-count').textContent),
  $('selection-count').textContent);
ok('outputs match the sliders',
  $('range-start-out').textContent === $('range-start').value &&
  $('range-end-out').textContent === $('range-end').value);

/* ------------------------------------- a browser with no Italian voice --- */
// Firefox on Windows offers only the voices Windows itself has installed, and a
// German machine with no Italian pack has none. Reading Italian aloud with a
// German voice teaches the wrong sounds, so the feature switches itself off
// rather than mispronounce with confidence.

ok('audio offered while an Italian voice exists', $('opt-audio').disabled === false);
ok('audio note hidden while an Italian voice exists', $('audio-note').hidden === true);

const itDe = window.document.querySelector('input[name="direction"][value="it-de"]');
itDe.checked = true;
fire(itDe, 'change');
$('btn-typing').click();
await settle();
ok('prompt speaker live while an Italian voice exists', $('btn-speak-prompt').hidden === false);

stubVoices = [{ lang: 'de-DE', name: 'Microsoft Hedda' }];
for (const fn of voiceListeners) fn();
await settle();

ok('prompt speaker hidden once the Italian voice is gone', $('btn-speak-prompt').hidden === true);
ok('example speaker hidden once the Italian voice is gone', $('btn-speak-example').hidden === true);

const beforeSilence = spoken.length;
$('btn-speak-prompt').click();
$('btn-speak-example').click();
await settle();
ok('nothing is spoken without an Italian voice', spoken.length === beforeSilence,
  String(spoken.length - beforeSilence));

$('btn-quit').click();
await settle();
ok('audio switched off without an Italian voice', $('opt-audio').disabled === true);
ok('audio note explains the silence', $('audio-note').hidden === false);
ok('audio note names the missing voice', /italienische Stimme/.test($('audio-note').textContent),
  $('audio-note').textContent);


/* ------------------------------------------------------ instructions ---- */
// The whole point of the in-app manual is that nobody has to find the
// repository to learn how the app works, so the link has to sit on the first
// screen and the text has to carry the parts that matter in daily use.

const helpBtn = $('btn-help');
ok('help link lives on the setup screen', $('screen-setup').contains(helpBtn));
ok('help link is labelled', /Anleitung/.test(helpBtn.textContent), helpBtn.textContent);

helpBtn.click();
await settle();
ok('help screen shown', $('screen-help').hidden === false);
ok('setup hidden while reading', $('screen-setup').hidden === true);

const helpText = $('screen-help').textContent;
for (const topic of [
  'Wortarten',
  'Karteikarten',
  'Tipp',
  'Leitner',
  'Serie',
  'Artikel',
  'Akzente',
  'Home-Bildschirm',
]) {
  ok(`help covers ${topic}`, helpText.includes(topic));
}
ok('help explains the box intervals', /21 Tagen/.test(helpText));
ok('help names what breaks the streak', /ganzer Tag ohne/.test(helpText));

// Everything a normal user does not need stays in the repository.
ok('help leaves the build out', !/npm test|http\.server|localStorage/.test(helpText), helpText.slice(0, 40));

const repoLink = $('screen-help').querySelector('a.ext-link');
ok('help points at the repository', /github\.com\/andreashandel\/deutsch-italienisch/.test(repoLink.href),
  repoLink.href);
ok('external link opens safely', repoLink.rel === 'noopener' && repoLink.target === '_blank');

$('btn-help-back').click();
await settle();
ok('help back to setup', $('screen-setup').hidden === false && $('screen-help').hidden === true);

helpBtn.click();
await settle();
$('btn-help-done').click();
await settle();
ok('help done returns to setup', $('screen-setup').hidden === false && $('screen-help').hidden === true);

// A round must never leave two screens on top of each other.
$('btn-typing').click();
await settle();
ok('help hidden during a round', $('screen-help').hidden === true);
$('btn-quit').click();
await settle();

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
