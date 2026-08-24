// UI wiring: setup screen, typing and flashcard sessions, summary, browse.
//
// Code and comments are English; everything the user reads is German.

import {
  parseCsv,
  toWords,
  italianDisplay,
  germanDisplay,
  POS_VALUES,
  POS_LABELS,
  POS_LABELS_ONE,
} from './csv.js';
import { selectWords, countByPos, shuffle, rankExtent } from './deck.js';
import { checkAnswer, makeCard, hintFor, hintMax } from './quiz.js';
import {
  loadProgress,
  saveProgress,
  recordResult,
  dueWords,
  hardWords,
  summarise,
  resetProgress,
  loadSettings,
  saveSettings,
  loadStreak,
  saveStreak,
  recordPractice,
  currentStreak,
  practisedToday,
} from './progress.js';

const CUSTOM_DECKS_KEY = 'italiano:decks:v1';

const $ = (id) => document.getElementById(id);

/** German plural agreement, for the many "1 Wort / 5 Wörter" lines. */
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const state = {
  deckId: '',
  deckName: '',
  words: [],
  progress: {},
  settings: {
    posFilter: [...POS_VALUES],
    start: 1,
    end: 100,
    direction: 'it-de',
    allowTypos: true,
    requireArticle: true,
    showExamples: true,
    audio: false,
    sessionLength: 20,
  },
  session: null,
  streak: { current: 0, best: 0, lastDay: null, totalDays: 0 },
  streakAdvancedThisSession: false,
};

/* ------------------------------------------------------------------ decks */

function readCustomDecks() {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_DECKS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeCustomDeck(id, name, csv) {
  const decks = readCustomDecks();
  decks[id] = { name, csv };
  try {
    localStorage.setItem(CUSTOM_DECKS_KEY, JSON.stringify(decks));
  } catch {
    // Too big for storage: the deck still works for this visit, it just will
    // not be remembered next time.
  }
}

async function loadBuiltInDecks() {
  try {
    const res = await fetch('data/manifest.json', { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {
    /* fall through to the default below */
  }
  return [{ id: 'it-top500', name: 'Italienisch — die 500 häufigsten Wörter', file: 'data/it-top500.csv' }];
}

function populateDeckSelect(builtIns) {
  const select = $('deck-select');
  select.innerHTML = '';

  for (const deck of builtIns) {
    const opt = document.createElement('option');
    opt.value = `builtin:${deck.id}`;
    opt.textContent = deck.name;
    opt.dataset.file = deck.file;
    select.append(opt);
  }

  const custom = readCustomDecks();
  for (const [id, deck] of Object.entries(custom)) {
    const opt = document.createElement('option');
    opt.value = `custom:${id}`;
    opt.textContent = `${deck.name} (eigene)`;
    select.append(opt);
  }
}

async function activateDeck(value) {
  const select = $('deck-select');
  select.value = value;
  const option = select.selectedOptions[0];
  if (!option) return;

  if (value.startsWith('builtin:')) {
    const res = await fetch(option.dataset.file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${option.dataset.file} konnte nicht geladen werden.`);
    state.words = toWords(parseCsv(await res.text()));
  } else {
    const deck = readCustomDecks()[value.slice('custom:'.length)];
    state.words = deck ? toWords(parseCsv(deck.csv)) : [];
  }

  state.deckId = value;
  state.deckName = option.textContent;
  state.progress = loadProgress(value);

  const extent = rankExtent(state.words);
  $('deck-summary').textContent = `${plural(state.words.length, 'Wort', 'Wörter')} geladen`;
  // Both sliders are rebounded to the new deck. A range left over from a bigger
  // deck would otherwise be clamped by the browser while the stored settings
  // kept the old numbers, and the two would disagree about what is selected.
  $('range-start').max = String(extent.max);
  $('range-end').max = String(extent.max);

  if (state.settings.end > extent.max) state.settings.end = Math.min(100, extent.max);
  if (state.settings.start > extent.max) state.settings.start = 1;
  if (state.settings.start > state.settings.end) state.settings.start = 1;

  $('range-start').value = String(state.settings.start);
  $('range-end').value = String(state.settings.end);

  buildPosFilter();
  refreshSelection();
}

/* --------------------------------------------------------- setup controls */

function buildPosFilter() {
  const container = $('pos-filter');
  const counts = countByPos(state.words);
  container.querySelectorAll('.check').forEach((el) => el.remove());

  for (const pos of POS_VALUES) {
    if (!counts[pos]) continue;
    const label = document.createElement('label');
    label.className = 'check';
    label.innerHTML = `
      <input type="checkbox" value="${pos}" ${state.settings.posFilter.includes(pos) ? 'checked' : ''} />
      <span>${POS_LABELS[pos]} <span class="pos-count">${counts[pos]}</span></span>`;
    label.querySelector('input').addEventListener('change', () => {
      state.settings.posFilter = [...container.querySelectorAll('input:checked')].map((i) => i.value);
      persistSettings();
      refreshSelection();
    });
    container.append(label);
  }
}

/** The words the current settings select, used for counts and for starting a session. */
function currentSelection() {
  return selectWords(state.words, {
    posFilter: state.settings.posFilter,
    start: Math.max(1, state.settings.start),
    end: Math.max(1, state.settings.end),
  });
}

function syncRangeOutputs() {
  $('range-start-out').textContent = $('range-start').value;
  $('range-end-out').textContent = $('range-end').value;
}

/**
 * The length slider is bounded by how many words are actually selected, and
 * reads "alle" at the top so picking everything is a deliberate position on the
 * scale rather than a magic number.
 */
function syncLengthOutput(selectedCount) {
  const count = typeof selectedCount === 'number' ? selectedCount : currentSelection().length;
  const slider = $('opt-length');
  const max = Math.max(5, Math.min(count || 5, 200));

  slider.max = String(max);
  if (parseInt(slider.value, 10) > max) {
    slider.value = String(max);
    state.settings.sessionLength = max;
  }

  const value = parseInt(slider.value, 10);
  $('opt-length-out').textContent =
    count > 0 && value >= count ? `alle ${count}` : String(value);
}

/**
 * Says what the two sliders currently mean, in words and with real numbers.
 *
 * The phrasing puts the word count after a colon on purpose: German nouns
 * decline, and "aus 242 Substantiven" would need a dative that the label
 * cannot know how to form for an arbitrary custom deck.
 */
function describeRange() {
  const pool = state.words.filter((w) => state.settings.posFilter.includes(w.pos));
  const { start, end } = state.settings;

  if (pool.length === 0) return 'Hake mindestens eine Wortart an.';

  const chosen = state.settings.posFilter;
  const label = chosen.length === 1 ? POS_LABELS[chosen[0]] : 'Wörter';

  if (start > pool.length) {
    return `Es gibt nur ${pool.length} ${label} — schiebe „Von“ zurück.`;
  }

  const positions = `Positionen ${start}–${Math.min(end, pool.length)}`;
  // Whether anything is actually excluded, rather than whether every possible
  // type is ticked — a deck need not contain all ten types.
  const basis =
    pool.length === state.words.length
      ? `alle ${pool.length} Wörter der Liste`
      : `${pool.length} ${label}, die du angehakt hast`;

  return `${positions} · Grundlage: ${basis}, nach Häufigkeit sortiert.`;
}

function refreshSelection() {
  const selected = currentSelection();
  const countEl = $('selection-count');
  countEl.textContent =
    selected.length === 0
      ? 'Keine Wörter — erweitere den Bereich oder hake mehr Wortarten an'
      : `${plural(selected.length, 'Wort', 'Wörter')} ausgewählt`;
  countEl.classList.toggle('empty', selected.length === 0);

  for (const id of ['btn-typing', 'btn-flash', 'btn-browse']) {
    $(id).disabled = selected.length === 0;
  }

  $('range-hint').textContent = describeRange();

  const stats = summarise(state.words, state.progress);
  const due = dueWords(state.words, state.progress).length;
  const hard = hardWords(state.words, state.progress).length;
  $('progress-stats').textContent =
    `${stats.mastered} sitzen · ${stats.learning} am Lernen · ${stats.unseen} noch nicht gesehen · ${due} jetzt fällig`;
  $('btn-due').textContent = `Fällige Wörter wiederholen (${due})`;
  $('btn-hard').textContent = `Schwierige Wörter üben (${hard})`;
  $('btn-due').disabled = due === 0;
  $('btn-hard').disabled = hard === 0;

  syncRangeOutputs();
  syncLengthOutput(selected.length);
}

function persistSettings() {
  saveSettings(state.settings);
}

function applySettingsToForm() {
  $('range-start').value = String(state.settings.start);
  $('range-end').value = String(state.settings.end);
  $('opt-typos').checked = state.settings.allowTypos;
  $('opt-article').checked = state.settings.requireArticle;
  $('opt-examples').checked = state.settings.showExamples;
  $('opt-audio').checked = state.settings.audio;
  $('opt-length').value = String(state.settings.sessionLength);
  syncRangeOutputs();
  document.querySelector(`input[name="direction"][value="${state.settings.direction}"]`).checked = true;
}

/* -------------------------------------------------------------- speaking */

let italianVoice = null;
// Until the browser has handed over a voice list at least once there is no way
// to tell a missing Italian voice from one that has simply not loaded yet, so
// nothing is switched off on the strength of an empty list.
let voicesEnumerated = false;

function speechAvailable() {
  return 'speechSynthesis' in window;
}

function pickItalianVoice() {
  if (!speechAvailable()) return;
  const voices = speechSynthesis.getVoices();
  if (voices.length === 0) return;
  voicesEnumerated = true;
  italianVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('it')) || null;
  applySpeechAvailability();
}

/**
 * Whether the browser can read Italian *as Italian*.
 *
 * A browser only offers the voices it has: Firefox on Windows exposes just the
 * ones Windows itself has installed, and a German machine with no Italian voice
 * pack has none. The utterance then falls back to the default German voice,
 * which reads "gnocchi" as if it were German — confident mispronunciation,
 * which is worse than silence for someone learning what the words sound like.
 */
function italianSpeechAvailable() {
  return speechAvailable() && (italianVoice !== null || !voicesEnumerated);
}

/** Reflect the presence or absence of an Italian voice in the controls. */
function applySpeechAvailability() {
  const available = italianSpeechAvailable();

  $('opt-audio').disabled = !available;
  $('audio-note').hidden = available;
  $('audio-note').textContent = speechAvailable()
    ? 'Dein Browser hat keine italienische Stimme, die Wörter würden also mit deutschem Akzent vorgelesen. Füge in den Sprachausgabe-Einstellungen deines Geräts eine italienische Stimme hinzu, um das einzuschalten.'
    : 'Dieser Browser kann keine Wörter vorlesen.';

  // Losing the voice mid-session hides the speakers straight away; gaining one
  // is picked up by the next card, which is soon enough for a bonus feature.
  if (!available) {
    for (const id of ['btn-speak-prompt', 'btn-speak-answer', 'btn-speak-example']) {
      $(id).hidden = true;
    }
  }
}

/** `force` is the speaker button: it plays even when auto-speak is off. */
function speakItalian(text, { force = false } = {}) {
  if (!force && !state.settings.audio) return;
  if (!italianSpeechAvailable() || !text) return;
  try {
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'it-IT';
    if (italianVoice) utter.voice = italianVoice;
    utter.rate = 0.9;
    speechSynthesis.speak(utter);
  } catch {
    /* speech is a bonus, never a blocker */
  }
}

/* --------------------------------------------------------------- screens */

function showScreen(name) {
  for (const id of ['setup', 'session', 'summary', 'browse']) {
    $(`screen-${id}`).hidden = id !== name;
  }
  window.scrollTo(0, 0);
}

/* --------------------------------------------------------------- session */

function startSession(mode, words) {
  if (words.length === 0) return;

  const limit = state.settings.sessionLength;
  const pool = shuffle(words);
  const chosen = limit > 0 ? pool.slice(0, limit) : pool;

  state.session = {
    mode,
    cards: chosen.map((w) => makeCard(w, state.settings.direction)),
    index: 0,
    results: [],
    sourceWords: words,
  };
  state.streakAdvancedThisSession = false;

  $('typing-area').hidden = mode !== 'typing';
  $('flash-area').hidden = mode !== 'flash';
  showScreen('session');
  renderCard();
}

function currentCard() {
  return state.session.cards[state.session.index];
}

function renderCard() {
  const session = state.session;
  const card = currentCard();

  $('session-counter').textContent = `${session.index + 1} / ${session.cards.length}`;
  $('progress-fill').style.width = `${(session.index / session.cards.length) * 100}%`;
  $('card-direction').textContent = `${card.fromLabel} → ${card.toLabel}`;

  // Which part of speech is being asked for. Without it a German prompt like
  // "Arbeit" is ambiguous between the noun and the verb, and there is no way to
  // know which Italian word is wanted.
  const posLabel = POS_LABELS_ONE[card.word.pos];
  const showPos = Boolean(posLabel) && card.word.pos !== 'other';
  $('card-pos').textContent = posLabel || '';
  $('card-pos').hidden = !showPos;
  $('card-prompt').textContent = card.prompt;

  // A plural is a hint about the word being asked, so it only shows on the
  // Italian side where it is not giving away the answer.
  $('card-extra').textContent =
    card.dir === 'it-de' && card.word.plural ? `Mehrzahl: ${card.word.plural}` : '';

  $('feedback').hidden = true;
  $('answer-input').value = '';
  $('answer-input').disabled = false;
  $('btn-check').disabled = false;
  $('btn-reveal').hidden = false;
  $('grade-row').hidden = true;
  // Flashcards advance via the grade buttons, typing advances via Weiter. Reset
  // it every card so a previous flashcard session cannot leave it hidden.
  $('btn-next').hidden = session.mode !== 'typing';

  // A one-letter answer has nothing to hint at without giving itself away.
  session.hintLevel = 0;
  $('hint-line').hidden = true;
  $('hint-line').textContent = '';
  $('btn-hint').hidden = session.mode !== 'typing' || hintMax(card) < 2;
  $('btn-hint').disabled = false;

  // The speaker follows the Italian: it is the prompt one way round and the
  // answer the other, so it only appears here when Italian is being shown.
  $('btn-speak-prompt').hidden = !(italianSpeechAvailable() && card.dir === 'it-de');
  $('btn-speak-answer').hidden = true;
  // Belongs to the revealed answer, so it starts hidden on every new card.
  $('btn-speak-example').hidden = true;

  if (session.mode === 'typing') {
    // Focus only on a device with a real keyboard: pulling up the iPad
    // keyboard automatically hides half the card.
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      $('answer-input').focus();
    }
  }

  if (card.dir === 'it-de') speakItalian(card.word.italian);
}

function showFeedback({ correct, typo, missingArticle, wrongArticle, hinted }) {
  const card = currentCard();
  const verdict = $('verdict');

  // Revealing a flashcard is not a judgement — the next step is self-grading.
  if (state.session.mode === 'flash') {
    verdict.textContent = '';
    verdict.className = 'verdict';
  } else if (correct && hinted) {
    verdict.textContent = 'Richtig — mit Tipp';
    verdict.className = 'verdict typo';
  } else if (correct && typo) {
    verdict.textContent = 'Fast — schau dir die Schreibweise an';
    verdict.className = 'verdict typo';
  } else if (correct) {
    verdict.textContent = 'Richtig';
    verdict.className = 'verdict correct';
  } else if (wrongArticle) {
    verdict.textContent = 'Richtiges Wort, falscher Artikel';
    verdict.className = 'verdict wrong';
  } else if (missingArticle) {
    verdict.textContent = 'Der Artikel fehlt';
    verdict.className = 'verdict wrong';
  } else {
    verdict.textContent = 'Leider nicht';
    verdict.className = 'verdict wrong';
  }

  $('correct-answer').textContent = card.expected;

  // The example is rebuilt each card. The speak button is a long-lived element
  // moved in and out of the sentence rather than recreated, so its listener
  // survives; it sits next to the Italian line because that is what it reads.
  const exampleText = $('example-text');
  const speakExample = $('btn-speak-example');
  const hasExample = state.settings.showExamples && Boolean(card.word.exampleIt);

  exampleText.replaceChildren();
  if (hasExample) {
    const it = document.createElement('em');
    it.textContent = card.word.exampleIt;
    if (italianSpeechAvailable()) it.append(' ', speakExample);
    exampleText.append(it);
    if (card.word.exampleDe) exampleText.append(document.createTextNode(card.word.exampleDe));
  }
  speakExample.hidden = !(hasExample && italianSpeechAvailable());

  $('btn-speak-answer').hidden = !(italianSpeechAvailable() && card.dir === 'de-it');
  $('feedback').hidden = false;
  if (card.dir === 'de-it') speakItalian(card.word.italian);
}

function gradeCard(grade) {
  const card = currentCard();
  recordResult(state.progress, card.word.id, grade);
  saveProgress(state.deckId, state.progress);
  state.session.results.push({ card, correct: grade !== 'again', hinted: grade === 'hint' });
  creditStreak();
}

/**
 * The first graded answer of the day extends the streak. Done here rather than
 * at the end of a session so that an abandoned session still counts — the words
 * were still practised.
 */
function creditStreak() {
  const { streak, advanced } = recordPractice(state.streak);
  if (!advanced) return;
  state.streak = streak;
  state.streakAdvancedThisSession = true;
  saveStreak(streak);
  renderStreak();
}

function renderStreak() {
  const days = currentStreak(state.streak);
  const el = $('streak-chip');
  const label = $('streak-label');
  const best = $('streak-best');

  el.classList.toggle('cold', days === 0);
  el.classList.toggle('done-today', practisedToday(state.streak));

  if (days === 0) {
    label.textContent = state.streak.best
      ? 'Heute üben und eine neue Serie starten'
      : 'Heute üben und eine Serie starten';
  } else {
    label.textContent = `${plural(days, 'Tag', 'Tage')} am Stück`;
  }

  best.textContent = state.streak.best > 1 ? `Bestwert ${state.streak.best}` : '';
  best.hidden = state.streak.best <= 1;
}

function nextCard() {
  const session = state.session;
  session.index += 1;
  if (session.index >= session.cards.length) finishSession();
  else renderCard();
}

function finishSession() {
  const { results } = state.session;
  const correct = results.filter((r) => r.correct).length;
  const missed = results.filter((r) => !r.correct);

  const hinted = results.filter((r) => r.hinted).length;
  $('summary-score').textContent =
    `${correct} von ${results.length} richtig` + (hinted ? ` · ${hinted} mit Tipp` : '');

  const days = currentStreak(state.streak);
  const streakEl = $('summary-streak');
  streakEl.hidden = days === 0;
  streakEl.textContent = state.streakAdvancedThisSession
    ? `🍕 ${plural(days, 'Tag', 'Tage')} am Stück — heute ist erledigt`
    : `🍕 ${plural(days, 'Tag', 'Tage')} am Stück`;
  $('missed-heading').textContent = missed.length
    ? 'Diese Wörter nochmal ansehen'
    : 'Nichts falsch — gut gemacht';

  const list = $('missed-list');
  list.innerHTML = '';
  for (const { card } of missed) {
    const li = document.createElement('li');
    const it = document.createElement('span');
    it.className = 'it';
    it.textContent = italianDisplay(card.word);
    const de = document.createElement('span');
    de.className = 'de';
    de.textContent = germanDisplay(card.word);
    li.append(it, de);
    list.append(li);
  }

  $('btn-retry-missed').hidden = missed.length === 0;
  showScreen('summary');
  refreshSelection();
}

/* ---------------------------------------------------------------- browse */

let browseSort = { key: 'rank', asc: true };

function renderBrowse(words) {
  const query = $('browse-search').value.trim().toLowerCase();
  const filtered = query
    ? words.filter(
        (w) =>
          w.italian.toLowerCase().includes(query) ||
          w.german.join(' ').toLowerCase().includes(query)
      )
    : words;

  const sorted = [...filtered].sort((a, b) => {
    const { key, asc } = browseSort;
    const va = key === 'rank' ? a.rank : key === 'german' ? a.german[0] : a[key];
    const vb = key === 'rank' ? b.rank : key === 'german' ? b.german[0] : b[key];
    // Sorted the Italian way: 'it' ignores the accents on città and perché
    // rather than filing them after z, which is where a code-point sort puts
    // them and nobody looks for them.
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'it');
    return asc ? cmp : -cmp;
  });

  const body = $('browse-body');
  body.innerHTML = '';
  for (const w of sorted) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="num">${w.rank}</td>
      <td class="it">${escapeHtml(italianDisplay(w))}</td>
      <td>${escapeHtml(germanDisplay(w))}</td>
      <td class="pos">${POS_LABELS_ONE[w.pos]}</td>`;
    body.append(tr);
  }

  document.querySelectorAll('.word-table th').forEach((th) => {
    const active = th.dataset.sort === browseSort.key;
    th.classList.toggle('sorted', active);
    th.classList.toggle('asc', active && browseSort.asc);
  });

  $('browse-title').textContent = plural(sorted.length, 'Wort', 'Wörter');
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/* ------------------------------------------------------------------ wire */

function wireSetup() {
  $('deck-select').addEventListener('change', (e) => {
    activateDeck(e.target.value).catch((err) => {
      $('deck-note').textContent = err.message;
    });
  });

  $('btn-load-csv').addEventListener('click', () => $('file-input').click());

  $('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = toWords(parseCsv(text));
      if (parsed.length === 0) {
        $('deck-note').textContent =
          'Keine brauchbaren Zeilen — die Datei braucht eine italienische und eine deutsche Spalte.';
        return;
      }
      const id = file.name.replace(/\.csv$/i, '');
      writeCustomDeck(id, id, text);
      const builtIns = await loadBuiltInDecks();
      populateDeckSelect(builtIns);
      await activateDeck(`custom:${id}`);
      $('deck-note').textContent =
        `${plural(parsed.length, 'Wort', 'Wörter')} aus ${file.name} geladen.`;
    } catch (err) {
      $('deck-note').textContent = `Die Datei konnte nicht gelesen werden: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  });

  // Two sliders over one range: whichever one is being dragged pushes the
  // other rather than being clamped by it, so neither can trap the other.
  const onRange = (moved) => {
    let start = parseInt($('range-start').value, 10) || 1;
    let end = parseInt($('range-end').value, 10) || 1;

    if (start > end) {
      if (moved === 'start') end = start;
      else start = end;
      $('range-start').value = String(start);
      $('range-end').value = String(end);
    }

    state.settings.start = start;
    state.settings.end = end;
    syncRangeOutputs();
    persistSettings();
    refreshSelection();
  };
  $('range-start').addEventListener('input', () => onRange('start'));
  $('range-end').addEventListener('input', () => onRange('end'));

  document.querySelectorAll('input[name="direction"]').forEach((el) =>
    el.addEventListener('change', () => {
      state.settings.direction = el.value;
      persistSettings();
    })
  );

  const setPos = (values) => {
    state.settings.posFilter = values;
    buildPosFilter();
    persistSettings();
    refreshSelection();
  };
  $('btn-pos-all').addEventListener('click', () => setPos([...POS_VALUES]));
  $('btn-pos-none').addEventListener('click', () => setPos([]));
  $('btn-pos-core').addEventListener('click', () => setPos(['noun', 'verb', 'adjective']));

  const bindOption = (id, key) =>
    $(id).addEventListener('change', (e) => {
      state.settings[key] = e.target.checked;
      persistSettings();
    });
  bindOption('opt-typos', 'allowTypos');
  bindOption('opt-article', 'requireArticle');
  bindOption('opt-examples', 'showExamples');
  bindOption('opt-audio', 'audio');

  $('opt-length').addEventListener('input', () => {
    state.settings.sessionLength = parseInt($('opt-length').value, 10) || 5;
    syncLengthOutput();
    persistSettings();
  });
  $('opt-length').addEventListener('change', (e) => {
    state.settings.sessionLength = parseInt(e.target.value, 10) || 5;
    syncLengthOutput();
    persistSettings();
  });

  $('btn-typing').addEventListener('click', () => startSession('typing', currentSelection()));
  $('btn-flash').addEventListener('click', () => startSession('flash', currentSelection()));
  $('btn-browse').addEventListener('click', () => {
    renderBrowse(currentSelection());
    showScreen('browse');
  });

  $('btn-due').addEventListener('click', () =>
    startSession('typing', dueWords(currentSelection(), state.progress))
  );
  $('btn-hard').addEventListener('click', () =>
    startSession('typing', hardWords(currentSelection(), state.progress))
  );

  $('btn-reset').addEventListener('click', () => {
    if (!confirm(`Allen Fortschritt für „${state.deckName}“ löschen? Das lässt sich nicht rückgängig machen.`)) return;
    resetProgress(state.deckId);
    state.progress = {};
    refreshSelection();
  });
}

function wireSession() {
  const submit = () => {
    const card = currentCard();
    const result = checkAnswer($('answer-input').value, card.word, card.dir, {
      allowTypos: state.settings.allowTypos,
      requireArticle: state.settings.requireArticle,
    });
    const hinted = state.session.hintLevel > 0;
    gradeCard(result.correct ? (hinted ? 'hint' : 'good') : 'again');
    $('answer-input').disabled = true;
    $('btn-check').disabled = true;
    $('btn-hint').disabled = true;
    showFeedback({ ...result, hinted });
    $('btn-next').focus();
  };

  $('btn-check').addEventListener('click', submit);
  $('answer-input').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    // Consume the key. The document-level handler below also acts on Enter,
    // and submit() reveals the feedback that its guard looks for — so without
    // this the one press would check the answer and skip straight past it.
    e.stopPropagation();
    submit();
  });

  // Each press uncovers one more letter, stopping one short of the whole word.
  $('btn-hint').addEventListener('click', () => {
    const card = currentCard();
    const ceiling = hintMax(card) - 1;
    state.session.hintLevel = Math.min(ceiling, state.session.hintLevel + 1);
    $('hint-line').textContent = hintFor(card, state.session.hintLevel);
    $('hint-line').hidden = false;
    $('btn-hint').disabled = state.session.hintLevel >= ceiling;
    $('answer-input').focus();
  });

  const speak = () => speakItalian(currentCard().word.italian, { force: true });
  $('btn-speak-prompt').addEventListener('click', speak);
  $('btn-speak-answer').addEventListener('click', speak);
  $('btn-speak-example').addEventListener('click', () => {
    speakItalian(currentCard().word.exampleIt, { force: true });
  });

  $('accent-row').addEventListener('click', (e) => {
    const ch = e.target.dataset?.ch;
    if (!ch) return;
    const input = $('answer-input');
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    input.value = input.value.slice(0, start) + ch + input.value.slice(end);
    input.setSelectionRange(start + 1, start + 1);
    input.focus();
  });

  $('btn-reveal').addEventListener('click', () => {
    $('btn-reveal').hidden = true;
    $('grade-row').hidden = false;
    showFeedback({ correct: true, typo: false });
    $('btn-next').hidden = true;
  });

  $('grade-row').addEventListener('click', (e) => {
    const grade = e.target.dataset?.grade;
    if (!grade) return;
    gradeCard(grade);
    nextCard();
  });

  $('btn-next').addEventListener('click', nextCard);

  document.addEventListener('keydown', (e) => {
    if ($('screen-session').hidden) return;
    if (e.key === 'Enter' && !$('feedback').hidden && !$('btn-next').hidden) {
      e.preventDefault();
      nextCard();
    }
  });

  $('btn-quit').addEventListener('click', () => {
    state.session = null;
    showScreen('setup');
    refreshSelection();
  });
}

function wireSummary() {
  $('btn-retry-missed').addEventListener('click', () => {
    const missed = state.session.results.filter((r) => !r.correct).map((r) => r.card.word);
    startSession(state.session.mode, missed);
  });
  $('btn-again-same').addEventListener('click', () => {
    startSession(state.session.mode, state.session.sourceWords);
  });
  $('btn-to-setup').addEventListener('click', () => showScreen('setup'));
}

function wireBrowse() {
  $('btn-browse-back').addEventListener('click', () => showScreen('setup'));
  $('browse-search').addEventListener('input', () => renderBrowse(currentSelection()));
  document.querySelectorAll('.word-table th').forEach((th) =>
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      browseSort = { key, asc: browseSort.key === key ? !browseSort.asc : true };
      renderBrowse(currentSelection());
    })
  );
}

/* ------------------------------------------------------------------ boot */

async function init() {
  const stored = loadSettings();
  Object.assign(state.settings, stored);

  // A stored filter naming a type this deck lacks would silently select nothing.
  state.settings.posFilter = state.settings.posFilter.filter((p) => POS_VALUES.includes(p));

  // Guard against a stored length below the slider's floor, which would clamp
  // to the minimum rather than to what was meant.
  if (!Number.isFinite(state.settings.sessionLength) || state.settings.sessionLength < 5) {
    state.settings.sessionLength = 20;
  }

  // A direction stored by a sibling app on the same origin — the Danish
  // trainer writes da-de — would match no radio button here.
  if (!['it-de', 'de-it', 'mixed'].includes(state.settings.direction)) {
    state.settings.direction = 'it-de';
  }

  state.streak = loadStreak();
  renderStreak();

  applySettingsToForm();
  wireSetup();
  wireSession();
  wireSummary();
  wireBrowse();

  if (speechAvailable()) {
    pickItalianVoice();
    // Voices commonly arrive after first paint, and a browser that has none in
    // Italian is only knowable once they have.
    speechSynthesis.addEventListener?.('voiceschanged', pickItalianVoice);
  }
  applySpeechAvailability();

  const builtIns = await loadBuiltInDecks();
  populateDeckSelect(builtIns);

  const saved = loadSettings().deckId;
  const options = [...$('deck-select').options].map((o) => o.value);
  const wanted = saved && options.includes(saved) ? saved : options[0];

  try {
    await activateDeck(wanted);
  } catch (err) {
    $('deck-summary').textContent = 'Die Wortliste konnte nicht geladen werden.';
    $('deck-note').textContent = err.message;
    return;
  }

  $('deck-select').addEventListener('change', () => {
    state.settings.deckId = $('deck-select').value;
    persistSettings();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Offline support is optional; the app works without it.
    });
  }
}

init();
