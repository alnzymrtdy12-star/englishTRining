/* =============================================
   VocabStory — app.js
   Stack: Vanilla JS + Groq API + Supabase
   ============================================= */

'use strict';

// ─── Config ──────────────────────────────────
const SUPABASE_URL = 'https://cwglfrpecnvqonjinlvz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_nbf_7ePmzV3Kaz4g2OdWwA_IuOzrPYJ';

// ─── Supabase client ─────────────────────────
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Welcome flag (localStorage only) ────────
const isWelcomeDismissed = () => localStorage.getItem('vs_welcome_dismissed') === 'true';
const setWelcomeDismissed = () => localStorage.setItem('vs_welcome_dismissed', 'true');

// ─── Examples toggle (localStorage, default ON) ──
const isExamplesEnabled = () => localStorage.getItem('vs_examples_enabled') !== 'false';
const setExamplesEnabled = v => localStorage.setItem('vs_examples_enabled', v ? 'true' : 'false');

// ─── State ───────────────────────────────────
let state = {
  today:      [],   // [{en, ar, date}]
  dictionary: [],   // [{en, ar, example, definition, date, correct, wrong, lastSeen, avgMs}]
  storyWords: [],
  story:      '',
  storyAr:    '',
  showingAr:  false,
  question:   '',
  generating: false,
  // Sentence Mode
  sentenceCards:      [],     // session-only: [{wordEn, wordAr, sentences, date}]
  sentenceWords:      [],     // from Supabase sentences_words
  sentenceGenerating: false,
  dictTab: 'story',           // 'story' | 'sentences'
  quiz: {
    active: false,
    total: 10,
    queue: [],
    idx: 0,
    score: 0,
    wrong: [],
    rafId: null,
    deadline: 0,
    questionStart: 0,
    responseTimes: [],
    currentQ: null,
    frozenRemaining: null,
    hiddenAt: 0,
    locked: false,
  },
};

// ─── DOM refs ────────────────────────────────
const $ = id => document.getElementById(id);

const ui = {
  wordEn:       $('word-en'),
  wordAr:       $('word-ar'),
  addWordBtn:   $('add-word-btn'),
  wordChips:    $('word-chips'),
  generateBtn:  $('generate-story-btn'),
  storyCard:    $('story-card'),
  storyText:    $('story-text'),
  translateBtn: $('translate-btn'),
  compCard:     $('comprehension-card'),
  compQuestion: $('comp-question'),
  compAnswer:   $('comp-answer'),
  streakCount:  $('streak-count'),
  dictSearch:   $('dict-search'),
  dictList:     $('dict-list'),
  dictEmpty:    $('dict-empty'),
  archiveList:  $('archive-list'),
  archiveEmpty: $('archive-empty'),
  welcomeCard:  $('welcome-card'),
  welcomeClose: $('welcome-close'),
  toast:        $('error-toast'),
  toggleExamples: $('toggle-examples'),
  tfEmpty:      $('tf-empty'),
  tfStart:      $('tf-start'),
  tfGame:       $('tf-game'),
  tfSummary:    $('tf-summary'),
  tfIdx:        $('tf-idx'),
  tfTotal:      $('tf-total'),
  tfScore:      $('tf-score'),
  tfClue:       $('tf-clue'),
  tfOptions:    $('tf-options'),
  tfReveal:     $('tf-reveal'),
  tfTimerFill:  null,
  tfFinal:      $('tf-final'),
  tfAvgTime:    $('tf-avg-time'),
  tfMissedCount: $('tf-missed-count'),
  tfWrongList:  $('tf-wrong-list'),
  tfRetry:      $('tf-retry'),
  tfPracticeMissed: $('tf-practice-missed'),
  // Sentence Mode
  sentWordEn:       $('sent-word-en'),
  sentWordAr:       $('sent-word-ar'),
  sentGenerateBtn:  $('sent-generate-btn'),
  sentCards:        $('sent-cards'),
  sentEmpty:        $('sent-empty'),
  sentDictList:     $('sent-dict-list'),
  sentDictEmpty:    $('sent-dict-empty'),
  toggleExamplesRow: $('toggle-examples-row'),
};

// ─── Toast ───────────────────────────────────
let toastTimer = null;
function showToast(msg, duration = 6000) {
  ui.toast.textContent = msg;
  ui.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.add('hidden'), duration);
}

function showStoryError(err) {
  void err;
  ui.storyText.innerHTML = `<div class="error-box"><strong>Error</strong></div>`;
  ui.storyCard.classList.remove('hidden');
}

// ─── API helpers (Vercel serverless) ─────────
async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ─── Streak ──────────────────────────────────
async function loadStreak() {
  const { data, error } = await sb.from('streak').select('*').eq('id', 1).single();
  if (error) { console.error('[streak load]', error); return; }
  ui.streakCount.textContent = data?.count || 0;
}

async function updateStreak() {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const { data } = await sb.from('streak').select('*').eq('id', 1).single();
  const last  = data?.last_day;
  let count = data?.count || 0;

  if (last === today) return;

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  count = last === yesterday ? count + 1 : 1;
  await sb.from('streak').upsert({ id: 1, count, last_day: today });
  ui.streakCount.textContent = count;
}

// ─── Words ───────────────────────────────────
async function loadWords() {
  const [dictRes, todayRes, sentRes] = await Promise.all([
    sb.from('dictionary').select('*').order('added_at', { ascending: true }),
    sb.from('today_words').select('*').order('added_at', { ascending: true }),
    sb.from('sentences_words').select('*').order('added_at', { ascending: false }),
  ]);

  if (dictRes.error)  console.error('[loadWords dict]',  dictRes.error);
  if (todayRes.error) console.error('[loadWords today]', todayRes.error);
  if (sentRes.error)  console.error('[loadWords sent]',  sentRes.error);

  state.dictionary = (dictRes.data || []).map(r => ({
    en:         r.word_en,
    ar:         r.word_ar || '',
    example:    r.example_en || '',
    definition: r.definition_en || '',
    date:       r.added_at,
    correct:    r.quiz_correct || 0,
    wrong:      r.quiz_wrong || 0,
    lastSeen:   r.quiz_last_seen || null,
    avgMs:      r.quiz_avg_ms || 0,
  }));
  state.today = (todayRes.data || []).map(r => ({ en: r.word_en, ar: r.word_ar || '', date: r.added_at }));
  state.sentenceWords = (sentRes.data || []).map(r => ({
    id:        r.id,
    wordEn:    r.word_en,
    wordAr:    r.word_ar || '',
    sentences: Array.isArray(r.sentences) ? r.sentences : [],
    date:      r.added_at,
  }));

  renderChips();
  renderDictionary();
  toggleGenerateBtn();
}

async function addWord() {
  const en = ui.wordEn.value.trim();
  const ar = ui.wordAr.value.trim();
  if (!en) { ui.wordEn.focus(); return; }

  const todayHit = state.today.find(w => w.en.toLowerCase() === en.toLowerCase());
  if (todayHit) {
    if (ar && ar !== todayHit.ar) {
      await sb.from('today_words').update({ word_ar: ar }).ilike('word_en', en);
      await sb.from('dictionary').update({ word_ar: ar }).ilike('word_en', en);
      todayHit.ar = ar;
      const dHit = state.dictionary.find(w => w.en.toLowerCase() === en.toLowerCase());
      if (dHit) dHit.ar = ar;
      showToast('Updated Arabic meaning ✓');
    } else {
      showToast('Word already added to today!');
    }
    ui.wordEn.value = '';
    ui.wordAr.value = '';
    ui.wordEn.focus();
    renderChips();
    renderDictionary();
    return;
  }

  // Add to today_words
  const { error: todayErr } = await sb.from('today_words').insert({ word_en: en, word_ar: ar });
  if (todayErr) {
    console.error('[addWord today]', todayErr);
    showToast('Error');
    return;
  }
  state.today.push({ en, ar, date: new Date().toISOString() });

  // Add to dictionary if new
  const dictHit = state.dictionary.find(w => w.en.toLowerCase() === en.toLowerCase());
  if (!dictHit) {
    const { error: dictErr } = await sb.from('dictionary').insert({ word_en: en, word_ar: ar });
    if (!dictErr) {
      state.dictionary.push({
        en, ar,
        example: '', definition: '',
        date: new Date().toISOString(),
        correct: 0, wrong: 0, lastSeen: null, avgMs: 0,
      });
      if (isExamplesEnabled()) fetchWordInfoFor(en);
    } else if (dictErr.code !== '23505') {
      console.error('[addWord dict]', dictErr);
    }
  } else if (ar && !dictHit.ar) {
    await sb.from('dictionary').update({ word_ar: ar }).ilike('word_en', en);
    dictHit.ar = ar;
  }

  ui.wordEn.value = '';
  ui.wordAr.value = '';
  ui.wordEn.focus();
  renderChips();
  renderDictionary();
  toggleGenerateBtn();
  updateWelcomeVisibility();
}

async function removeWord(index) {
  const word = state.today[index];
  await sb.from('today_words').delete().ilike('word_en', word.en);
  state.today.splice(index, 1);
  renderChips();
  toggleGenerateBtn();
  updateWelcomeVisibility();
}

function renderChips() {
  ui.wordChips.innerHTML = state.today.map((w, i) => `
    <span class="chip">
      ${escHtml(w.en)}
      ${w.ar ? `<span class="chip-ar">(${escHtml(w.ar)})</span>` : ''}
      <button class="chip-remove" data-i="${i}" aria-label="Remove ${escHtml(w.en)}">×</button>
    </span>
  `).join('');
}

function toggleGenerateBtn() {
  ui.generateBtn.disabled = state.today.length === 0 || state.generating;
}

// ─── Story Generation ────────────────────────
async function generateStory() {
  if (!state.today.length || state.generating) return;

  state.generating = true;
  toggleGenerateBtn();
  ui.generateBtn.innerHTML = '<span class="spinner"></span> Generating…';

  const wordsForStory = state.today.slice();

  try {
    const { story, question } = await apiPost('/api/generate', { words: wordsForStory.map(w => w.en) });

    state.question   = question || '';
    state.story      = story   || '';
    state.storyWords = wordsForStory.slice();
    state.storyAr    = '';
    state.showingAr  = false;

    renderStory();

    // Save to Supabase archive
    await sb.from('stories').insert({
      story_text: state.story,
      question:   state.question,
      words:      wordsForStory.map(w => ({ en: w.en, ar: w.ar })),
    });

    // Clear today_words from Supabase
    await sb.from('today_words').delete().gt('id', 0);
    state.today = [];
    renderChips();
    toggleGenerateBtn();

    await updateStreak();
    await renderArchive();
    updateWelcomeVisibility();

  } catch (err) {
    console.error('[generateStory] Failed:', err);
    showToast('Error', 8000);
    showStoryError(err);
  } finally {
    state.generating = false;
    toggleGenerateBtn();
    ui.generateBtn.innerHTML = '✨ Generate Story';
  }
}

function renderStory() {
  const vocabSet = new Set(state.storyWords.map(w => w.en.toLowerCase()));
  const raw = state.showingAr && state.storyAr ? state.storyAr : state.story;

  const formatted = escHtml(raw)
    .replace(/\*\*(.+?)\*\*/g, (_, w) => `<mark>${w}</mark>`)
    .replace(/\b(\w+)\b/g, (match) => {
      const lower = match.toLowerCase();
      return vocabSet.has(lower) ? `<mark>${match}</mark>` : match;
    })
    .replace(/\n/g, '<br>');

  ui.storyText.innerHTML = formatted;
  ui.storyCard.classList.remove('hidden');
  ui.translateBtn.textContent = state.showingAr ? '🌐 English' : '🌐 Arabic';

  if (state.question) {
    ui.compQuestion.textContent = state.question;
    ui.compCard.classList.remove('hidden');
  }

  ui.storyCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function translateStory() {
  if (state.showingAr) { state.showingAr = false; renderStory(); return; }
  if (state.storyAr)   { state.showingAr = true;  renderStory(); return; }

  ui.translateBtn.textContent = '⏳ Translating…';
  ui.translateBtn.disabled = true;

  try {
    const { storyAr } = await apiPost('/api/translate', { story: state.story });
    state.storyAr   = storyAr;
    state.showingAr = true;
    renderStory();
  } catch (err) {
    console.error('[translateStory] Failed:', err);
    showToast('Error', 8000);
  } finally {
    ui.translateBtn.disabled = false;
  }
}

// ─── Archive ─────────────────────────────────
async function renderArchive() {
  const { data, error } = await sb
    .from('stories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { console.error('[renderArchive]', error); return; }
  const archive = data || [];

  if (!archive.length) {
    ui.archiveList.innerHTML = '';
    ui.archiveEmpty.classList.remove('hidden');
    return;
  }

  ui.archiveEmpty.classList.add('hidden');
  ui.archiveList.innerHTML = archive.map((item, i) => {
    const d = new Date(item.created_at);
    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const words = Array.isArray(item.words) ? item.words : [];
    const wordChips = words.map(w =>
      `<span class="archive-chip">${escHtml(w.en)}${w.ar ? ` <span class="archive-chip-ar">${escHtml(w.ar)}</span>` : ''}</span>`
    ).join('');
    const preview = (item.story_text || '').replace(/\*\*(.+?)\*\*/g, '$1');
    return `
      <div class="archive-item" data-i="${i}" role="button" tabindex="0" aria-expanded="false">
        <div class="archive-date">${dateStr}</div>
        <div class="archive-words-label">Words used (${words.length}):</div>
        <div class="archive-words">${wordChips}</div>
        <div class="archive-preview">${escHtml(preview)}</div>
        <div class="archive-detail hidden">${formatStoryHtml(item.story_text || '')}</div>
      </div>`;
  }).join('');
}

function formatStoryHtml(story) {
  return story
    .replace(/\*\*(.+?)\*\*/g, (_, w) => `<mark>${escHtml(w)}</mark>`)
    .replace(/\n/g, '<br>');
}

// ─── Dictionary ──────────────────────────────
const wordInfoFailures = new Set();

async function fetchWordInfoFor(en) {
  const key = en.toLowerCase();
  try {
    const { example, definition } = await apiPost('/api/word-info', { word: en });
    await sb.from('dictionary')
      .update({ example_en: example, definition_en: definition })
      .ilike('word_en', en);
    const e = state.dictionary.find(w => w.en.toLowerCase() === key);
    if (e) { e.example = example; e.definition = definition; }
    wordInfoFailures.delete(key);
    const dictPage = document.getElementById('page-dictionary');
    if (dictPage && dictPage.classList.contains('active')) {
      renderDictionary(ui.dictSearch.value.toLowerCase().trim());
    }
  } catch (err) {
    wordInfoFailures.add(key);
    console.warn('[word-info]', en, err.message || err);
    const dictPage = document.getElementById('page-dictionary');
    if (dictPage && dictPage.classList.contains('active')) {
      renderDictionary(ui.dictSearch.value.toLowerCase().trim());
    }
  }
}

function renderDictionary(filter = '') {
  if (state.dictTab === 'sentences') {
    ui.dictList.innerHTML = '';
    ui.dictEmpty.classList.add('hidden');
    renderSentDictTab(filter);
    return;
  }

  // Story Words tab
  ui.sentDictList.classList.add('hidden');
  ui.sentDictEmpty.classList.add('hidden');

  const list = filter
    ? state.dictionary.filter(w =>
        w.en.toLowerCase().includes(filter) ||
        (w.ar && w.ar.includes(filter))
      )
    : state.dictionary;

  if (!list.length) {
    ui.dictList.innerHTML = '';
    ui.dictEmpty.classList.remove('hidden');
    return;
  }

  const showExamples = isExamplesEnabled();

  ui.dictEmpty.classList.add('hidden');
  ui.dictList.classList.remove('hidden');
  ui.dictList.innerHTML = [...list].reverse().map(w => {
    const failed      = wordInfoFailures.has(w.en.toLowerCase());
    const showLoading = showExamples && !w.example && !failed;
    const showFailed  = showExamples && !w.example && failed;
    return `
    <div class="word-item">
      <div class="word-badge">${escHtml(w.en.slice(0, 2).toUpperCase())}</div>
      <div class="word-meta">
        <div class="word-en">${escHtml(w.en)}</div>
        ${w.ar ? `<div class="word-ar">${escHtml(w.ar)}</div>` : ''}
        ${showExamples && w.example ? `<div class="word-example">${escHtml(w.example)}</div>` : ''}
        ${showLoading ? `<div class="word-example word-example-loading">⏳ جاري توليد الجملة…</div>` : ''}
        ${showFailed ? `<div class="word-example word-example-failed">Error</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderSentDictTab(filter = '') {
  ui.dictList.classList.add('hidden');
  ui.dictEmpty.classList.add('hidden');

  const list = filter
    ? state.sentenceWords.filter(w =>
        w.wordEn.toLowerCase().includes(filter) ||
        (w.wordAr && w.wordAr.includes(filter))
      )
    : state.sentenceWords;

  if (!list.length) {
    ui.sentDictList.innerHTML = '';
    ui.sentDictList.classList.add('hidden');
    ui.sentDictEmpty.classList.remove('hidden');
    return;
  }

  ui.sentDictEmpty.classList.add('hidden');
  ui.sentDictList.classList.remove('hidden');
  ui.sentDictList.innerHTML = list.map(w => {
    const sentRows = (w.sentences || []).map(s => {
      const safeSentence = escHtml(s.sentence || '')
        .replace(/\*\*(.+?)\*\*/g, '<mark class="sent-mark">$1</mark>');
      return `
        <div class="sent-item">
          <span class="sent-event-label">${escHtml(s.event || '')}</span>
          <p class="sent-sentence">${safeSentence}</p>
        </div>`;
    }).join('');

    return `
      <div class="sent-dict-item">
        <div class="sent-dict-header">
          <div class="sent-dict-badge">${escHtml(w.wordEn.slice(0, 2).toUpperCase())}</div>
          <div class="word-meta">
            <div class="word-en">${escHtml(w.wordEn)}</div>
            ${w.wordAr ? `<div class="word-ar">${escHtml(w.wordAr)}</div>` : ''}
          </div>
        </div>
        <div class="sent-dict-sentences">${sentRows}</div>
      </div>`;
  }).join('');
}

function switchDictTab(tabName) {
  if (state.dictTab === tabName) return;
  state.dictTab = tabName;
  document.querySelectorAll('.dict-tab').forEach(btn => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });
  // Hide/show toggle-examples row (only relevant for Story Words)
  if (ui.toggleExamplesRow) {
    ui.toggleExamplesRow.classList.toggle('hidden', tabName !== 'story');
  }
  renderDictionary(ui.dictSearch.value.toLowerCase().trim());
}

// Backfill missing example sentences in small throttled batches
let backfillRunning = false;
async function backfillExamples() {
  if (backfillRunning) return;
  if (!isExamplesEnabled()) return;
  const missing = state.dictionary.filter(
    w => !w.example && !wordInfoFailures.has(w.en.toLowerCase())
  );
  if (!missing.length) return;
  backfillRunning = true;
  let shownErrorToast = false;
  try {
    const batch = missing.slice(0, 8);
    for (const w of batch) {
      await fetchWordInfoFor(w.en);
      if (wordInfoFailures.has(w.en.toLowerCase()) && !shownErrorToast) {
        showToast('Error', 5000);
        shownErrorToast = true;
      }
      await new Promise(r => setTimeout(r, 250));
    }
  } finally {
    backfillRunning = false;
  }
}

// ─── Sentence Mode ───────────────────────────
async function generateSentences() {
  const en = ui.sentWordEn.value.trim();
  const ar = ui.sentWordAr.value.trim();
  if (!en || state.sentenceGenerating) return;

  if (!/^[a-zA-Z\-']+$/.test(en)) {
    showToast('Error', 5000);
    ui.sentWordEn.focus();
    return;
  }

  state.sentenceGenerating = true;
  ui.sentGenerateBtn.disabled = true;
  ui.sentGenerateBtn.innerHTML = '<span class="spinner"></span> Generating…';

  try {
    const result = await apiPost('/api/sentences', { word: en.toLowerCase() });

    if (!result.valid) {
      showToast('Error', 7000);
      return;
    }

    const card = {
      wordEn:    en,
      wordAr:    ar,
      sentences: result.sentences,
      date:      new Date().toISOString(),
    };

    // Newest card on top
    state.sentenceCards.unshift(card);
    renderSentenceCards();

    // Persist only if not already in dictionary (prevent duplicates)
    const existing = state.sentenceWords.find(
      w => w.wordEn.toLowerCase() === en.toLowerCase()
    );

    if (!existing) {
      const tempEntry = {
        id:        `temp-${Date.now()}`,
        wordEn:    en,
        wordAr:    ar,
        sentences: result.sentences,
        date:      new Date().toISOString(),
      };
      state.sentenceWords.unshift(tempEntry);
      const dictPage = document.getElementById('page-dictionary');
      if (dictPage && dictPage.classList.contains('active') && state.dictTab === 'sentences') {
        renderSentDictTab(ui.dictSearch.value.toLowerCase().trim());
      }

      const { data, error } = await sb.from('sentences_words')
        .insert({
          word_en:   en,
          word_ar:   ar || null,
          sentences: result.sentences,
        })
        .select();

      if (error) {
        console.error('[generateSentences persist]', error);
        const i = state.sentenceWords.findIndex(w => w.id === tempEntry.id);
        if (i !== -1) state.sentenceWords.splice(i, 1);
        if (dictPage && dictPage.classList.contains('active') && state.dictTab === 'sentences') {
          renderSentDictTab(ui.dictSearch.value.toLowerCase().trim());
        }
        showToast('Error', 5000);
      } else if (data && data[0]) {
        tempEntry.id   = data[0].id;
        tempEntry.date = data[0].added_at;
      }
    }

    ui.sentWordEn.value = '';
    ui.sentWordAr.value = '';
    ui.sentWordEn.focus();

  } catch (err) {
    console.error('[generateSentences]', err);
    showToast('Error', 8000);
  } finally {
    state.sentenceGenerating = false;
    ui.sentGenerateBtn.disabled = false;
    ui.sentGenerateBtn.innerHTML = '✏️ Generate Sentences';
  }
}

function renderSentenceCards() {
  if (!state.sentenceCards.length) {
    ui.sentCards.innerHTML = '';
    ui.sentEmpty.classList.remove('hidden');
    return;
  }

  ui.sentEmpty.classList.add('hidden');
  ui.sentCards.innerHTML = state.sentenceCards.map(card => {
    const sentItems = (card.sentences || []).map(s => {
      const safeSentence = escHtml(s.sentence || '')
        .replace(/\*\*(.+?)\*\*/g, '<mark class="sent-mark">$1</mark>');
      return `
        <div class="sent-item">
          <span class="sent-event-label">${escHtml(s.event || '')}</span>
          <p class="sent-sentence">${safeSentence}</p>
        </div>`;
    }).join('');

    return `
      <div class="sent-card">
        <div class="sent-card-header">
          <span class="sent-card-word">${escHtml(card.wordEn)}</span>
          ${card.wordAr ? `<span class="sent-card-ar">${escHtml(card.wordAr)}</span>` : ''}
        </div>
        <div class="sent-card-divider"></div>
        <div class="sent-items">${sentItems}</div>
      </div>`;
  }).join('');
}

// ─── Welcome guide ───────────────────────────
function updateWelcomeVisibility() {
  if (!ui.welcomeCard) return;
  const hasActivity =
    state.dictionary.length > 0 ||
    state.today.length > 0 ||
    state.sentenceWords.length > 0;
  if (!isWelcomeDismissed() && !hasActivity) {
    ui.welcomeCard.classList.remove('hidden');
  } else {
    ui.welcomeCard.classList.add('hidden');
  }
}

function dismissWelcome() {
  setWelcomeDismissed();
  ui.welcomeCard.classList.add('hidden');
}

// ─── Navigation ──────────────────────────────
function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(`page-${name}`);
  if (page) page.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.page === name)
  );

  if (name === 'dictionary') { renderDictionary(ui.dictSearch.value.toLowerCase()); backfillExamples(); }
  if (name === 'archive')    renderArchive();
  if (name === 'thinkfast')  tfReset();
  if (name === 'sentences')  renderSentenceCards();
}

// ─── Think Fast (timed MCQ quiz) ─────────────
function tfShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function tfStaleBoost(lastSeen) {
  if (!lastSeen) return 0;
  const days = (Date.now() - new Date(lastSeen).getTime()) / 86400000;
  return days > 3 ? 1 : 0;
}

function tfBuildQueue(total, pool) {
  // Score each entry — Quizlet-style prioritization
  const scored = pool.map(w => {
    const totalAttempts = (w.correct || 0) + (w.wrong || 0);
    const recentCorrect = totalAttempts > 0 && (w.correct || 0) > (w.wrong || 0) ? 1 : 0;
    const score =
      3 * (w.wrong || 0)                              // missed-before words first
      + (totalAttempts === 0 ? 2 : 0)                 // never-quizzed next
      + tfStaleBoost(w.lastSeen)                      // stale words boosted
      - 0.5 * recentCorrect                           // recent-correct pushed down
      + Math.random() * 0.4;                          // jitter
    return { w, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, total).map(s => s.w);
}

function tfPickDistractors(correctEntry) {
  const targetLen = correctEntry.en.length;
  const correctLow = correctEntry.en.toLowerCase();
  const all = state.dictionary.filter(w => w.en.toLowerCase() !== correctLow);
  const close = all.filter(w => Math.abs(w.en.length - targetLen) <= 3);
  const pool = close.length >= 3 ? close : all;
  // dedup by lowercase
  const seen = new Set();
  const unique = [];
  for (const w of tfShuffle(pool)) {
    const k = w.en.toLowerCase();
    if (!seen.has(k)) { seen.add(k); unique.push(w); }
    if (unique.length >= 3) break;
  }
  return unique;
}

async function tfStart(total, queueOverride) {
  if (state.dictionary.length < 4) {
    if (ui.tfEmpty)  ui.tfEmpty.classList.remove('hidden');
    if (ui.tfStart)  ui.tfStart.classList.add('hidden');
    if (ui.tfGame)   ui.tfGame.classList.add('hidden');
    if (ui.tfSummary) ui.tfSummary.classList.add('hidden');
    return;
  }

  let queue;
  if (Array.isArray(queueOverride) && queueOverride.length) {
    queue = queueOverride.slice();
  } else {
    const eligible = state.dictionary.filter(w => w.definition);
    if (eligible.length < 4) {
      showToast('جارٍ توليد التعريفات…', 2500);
      const missing = state.dictionary.filter(w => !w.definition).slice(0, 8);
      await Promise.all(missing.map(w => fetchWordInfoFor(w.en)));
      const eligibleAfter = state.dictionary.filter(w => w.definition);
      if (eligibleAfter.length < 4) {
        showToast('Error', 4000);
        return;
      }
      queue = tfBuildQueue(total, eligibleAfter);
    } else {
      queue = tfBuildQueue(total, eligible);
    }
  }

  state.quiz.active = true;
  state.quiz.total = queue.length;
  state.quiz.queue = queue;
  state.quiz.idx = 0;
  state.quiz.score = 0;
  state.quiz.wrong = [];
  state.quiz.responseTimes = [];
  state.quiz.frozenRemaining = null;
  state.quiz.locked = false;

  ui.tfEmpty.classList.add('hidden');
  ui.tfStart.classList.add('hidden');
  ui.tfSummary.classList.add('hidden');
  ui.tfGame.classList.remove('hidden');
  if (!ui.tfTimerFill) ui.tfTimerFill = ui.tfGame.querySelector('.timer-bar-fill');
  ui.tfTotal.textContent = String(state.quiz.total);
  ui.tfScore.textContent = '0';

  tfNext();
}

function tfNext() {
  const correct = state.quiz.queue[state.quiz.idx];
  const distractors = tfPickDistractors(correct);
  const options = tfShuffle([correct, ...distractors]);
  state.quiz.currentQ = { correct, options };
  state.quiz.locked = false;

  ui.tfIdx.textContent = String(state.quiz.idx + 1);
  ui.tfClue.textContent = correct.definition || '(missing definition)';
  ui.tfClue.classList.remove('tf-clue-anim');
  // restart slideUp animation
  void ui.tfClue.offsetWidth;
  ui.tfClue.classList.add('tf-clue-anim');

  ui.tfOptions.innerHTML = options.map((opt, i) =>
    `<button class="tf-option" data-choice="${i}">${escHtml(opt.en)}</button>`
  ).join('');

  ui.tfReveal.classList.add('hidden');
  ui.tfReveal.querySelector('.tf-reveal-ar').textContent = '';
  ui.tfReveal.querySelector('.tf-reveal-example').textContent = '';

  if (ui.tfTimerFill) {
    ui.tfTimerFill.classList.remove('warn', 'danger');
    ui.tfTimerFill.style.setProperty('--remaining', '1');
  }

  state.quiz.questionStart = Date.now();
  tfStartTimer();
}

function tfStartTimer() {
  state.quiz.deadline = Date.now() + 15000;
  cancelAnimationFrame(state.quiz.rafId);
  state.quiz.rafId = requestAnimationFrame(tfTick);
}

function tfTick() {
  if (!state.quiz.active) return;
  if (state.quiz.frozenRemaining != null) return; // paused
  const remaining = Math.max(0, state.quiz.deadline - Date.now());
  const ratio = remaining / 15000;
  if (ui.tfTimerFill) {
    ui.tfTimerFill.style.setProperty('--remaining', String(ratio));
    ui.tfTimerFill.classList.toggle('warn', ratio <= 0.33 && ratio > 0.15);
    ui.tfTimerFill.classList.toggle('danger', ratio <= 0.15);
  }
  if (remaining <= 0) {
    tfAnswer(null);
    return;
  }
  state.quiz.rafId = requestAnimationFrame(tfTick);
}

function tfAnswer(choiceIdx) {
  if (state.quiz.locked || !state.quiz.active) return;
  state.quiz.locked = true;
  cancelAnimationFrame(state.quiz.rafId);
  state.quiz.rafId = null;

  const { correct, options } = state.quiz.currentQ;
  const responseMs = Date.now() - state.quiz.questionStart;
  state.quiz.responseTimes.push(responseMs);

  const isCorrect = choiceIdx !== null && options[choiceIdx].en.toLowerCase() === correct.en.toLowerCase();
  if (isCorrect) state.quiz.score++;

  // Mark buttons
  const btns = ui.tfOptions.querySelectorAll('.tf-option');
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (options[i].en.toLowerCase() === correct.en.toLowerCase()) btn.classList.add('correct');
    else if (i === choiceIdx) btn.classList.add('wrong');
  });
  ui.tfScore.textContent = String(state.quiz.score);

  // Reveal block (Arabic + example) — only AFTER lock
  ui.tfReveal.querySelector('.tf-reveal-ar').textContent = correct.ar || '';
  ui.tfReveal.querySelector('.tf-reveal-example').textContent = correct.example || '';
  ui.tfReveal.classList.remove('hidden');

  // Persist stats to Supabase + state (fire-and-forget)
  const newCorrect = (correct.correct || 0) + (isCorrect ? 1 : 0);
  const newWrong   = (correct.wrong   || 0) + (isCorrect ? 0 : 1);
  const totalSeen  = newCorrect + newWrong;
  const oldAvg     = correct.avgMs || 0;
  const newAvg     = oldAvg
    ? Math.round((oldAvg * (totalSeen - 1) + responseMs) / totalSeen)
    : responseMs;
  sb.from('dictionary').update({
    quiz_correct:   newCorrect,
    quiz_wrong:     newWrong,
    quiz_avg_ms:    newAvg,
    quiz_last_seen: new Date().toISOString(),
  }).ilike('word_en', correct.en).then(({ error }) => {
    if (error) console.warn('[tfAnswer persist]', error);
  });
  correct.correct = newCorrect;
  correct.wrong = newWrong;
  correct.avgMs = newAvg;
  correct.lastSeen = new Date().toISOString();

  if (!isCorrect) {
    state.quiz.wrong.push({
      ...correct,
      userPick: choiceIdx === null ? null : options[choiceIdx].en,
    });
  }

  setTimeout(() => {
    if (!state.quiz.active) return;
    state.quiz.idx++;
    if (state.quiz.idx < state.quiz.queue.length) tfNext();
    else tfEnd();
  }, 1600);
}

function tfEnd() {
  state.quiz.active = false;
  cancelAnimationFrame(state.quiz.rafId);
  state.quiz.rafId = null;
  ui.tfGame.classList.add('hidden');
  ui.tfSummary.classList.remove('hidden');

  const total = state.quiz.total;
  const score = state.quiz.score;
  ui.tfFinal.textContent = `${score} / ${total}`;

  const times = state.quiz.responseTimes;
  const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;
  ui.tfAvgTime.textContent = avg ? `${(avg / 1000).toFixed(1)}s` : '—';
  ui.tfAvgTime.classList.remove('fast', 'medium', 'slow');
  if (avg > 0 && avg < 5000) ui.tfAvgTime.classList.add('fast');
  else if (avg < 10000) ui.tfAvgTime.classList.add('medium');
  else ui.tfAvgTime.classList.add('slow');

  ui.tfMissedCount.textContent = String(state.quiz.wrong.length);

  if (state.quiz.wrong.length === 0) {
    ui.tfWrongList.innerHTML = '<div class="tf-perfect">Perfect — no words to review!</div>';
  } else {
    ui.tfWrongList.innerHTML = state.quiz.wrong.map(w => `
      <div class="tf-wrong-item">
        <div class="tf-wrong-en">${escHtml(w.en)}</div>
        ${w.ar ? `<div class="tf-wrong-ar">${escHtml(w.ar)}</div>` : ''}
        ${w.example ? `<div class="tf-wrong-example">${escHtml(w.example)}</div>` : ''}
        ${w.userPick ? `<div class="tf-wrong-pick">you picked: ${escHtml(w.userPick)}</div>` : `<div class="tf-wrong-pick">⏱ time out</div>`}
      </div>
    `).join('');
  }

  if (ui.tfPracticeMissed) {
    ui.tfPracticeMissed.disabled = state.quiz.wrong.length === 0;
  }
}

function tfReset() {
  state.quiz.active = false;
  state.quiz.locked = false;
  state.quiz.frozenRemaining = null;
  cancelAnimationFrame(state.quiz.rafId);
  state.quiz.rafId = null;
  if (ui.tfGame)    ui.tfGame.classList.add('hidden');
  if (ui.tfSummary) ui.tfSummary.classList.add('hidden');
  if (ui.tfEmpty) {
    if (state.dictionary.length < 4) ui.tfEmpty.classList.remove('hidden');
    else ui.tfEmpty.classList.add('hidden');
  }
  if (ui.tfStart) {
    if (state.dictionary.length >= 4) ui.tfStart.classList.remove('hidden');
    else ui.tfStart.classList.add('hidden');
  }
}

document.addEventListener('visibilitychange', () => {
  if (!state.quiz.active) return;
  if (document.hidden) {
    state.quiz.frozenRemaining = state.quiz.deadline - Date.now();
    state.quiz.hiddenAt = Date.now();
    cancelAnimationFrame(state.quiz.rafId);
    state.quiz.rafId = null;
  } else if (state.quiz.frozenRemaining != null) {
    const hiddenDuration = Date.now() - state.quiz.hiddenAt;
    state.quiz.deadline = Date.now() + Math.max(0, state.quiz.frozenRemaining);
    state.quiz.questionStart += hiddenDuration; // exclude hidden time from response time
    state.quiz.frozenRemaining = null;
    if (!state.quiz.locked) state.quiz.rafId = requestAnimationFrame(tfTick);
  }
});

// ─── Utility ─────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Event Listeners ─────────────────────────
function bindEvents() {
  ui.addWordBtn.addEventListener('click', addWord);
  ui.wordEn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ui.wordAr.focus(); } });
  ui.wordAr.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addWord(); } });

  ui.wordChips.addEventListener('click', e => {
    const btn = e.target.closest('.chip-remove');
    if (btn) removeWord(Number(btn.dataset.i));
  });

  ui.generateBtn.addEventListener('click', generateStory);
  ui.translateBtn.addEventListener('click', translateStory);

  if (ui.welcomeClose) ui.welcomeClose.addEventListener('click', dismissWelcome);

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
  });

  ui.dictSearch.addEventListener('input', e => renderDictionary(e.target.value.toLowerCase().trim()));

  ui.archiveList.addEventListener('click', e => {
    const item = e.target.closest('.archive-item');
    if (!item) return;
    const detail  = item.querySelector('.archive-detail');
    const preview = item.querySelector('.archive-preview');
    const expanded = item.getAttribute('aria-expanded') === 'true';
    item.setAttribute('aria-expanded', String(!expanded));
    detail.classList.toggle('hidden', expanded);
    preview.classList.toggle('hidden', !expanded);
  });

  ui.archiveList.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const item = e.target.closest('.archive-item');
      if (item) item.click();
    }
  });

  // Examples toggle
  if (ui.toggleExamples) {
    ui.toggleExamples.checked = isExamplesEnabled();
    ui.toggleExamples.addEventListener('change', e => {
      setExamplesEnabled(e.target.checked);
      renderDictionary(ui.dictSearch.value.toLowerCase().trim());
    });
  }

  // Think Fast — start length buttons
  if (ui.tfStart) {
    ui.tfStart.addEventListener('click', e => {
      const btn = e.target.closest('.tf-length-btn');
      if (!btn) return;
      const total = Number(btn.dataset.total) || 10;
      tfStart(total);
    });
  }

  // Think Fast — option clicks
  if (ui.tfOptions) {
    ui.tfOptions.addEventListener('click', e => {
      const btn = e.target.closest('.tf-option');
      if (!btn || btn.disabled) return;
      tfAnswer(Number(btn.dataset.choice));
    });
  }

  // Think Fast — summary actions
  if (ui.tfRetry) {
    ui.tfRetry.addEventListener('click', () => tfStart(state.quiz.total || 10));
  }
  if (ui.tfPracticeMissed) {
    ui.tfPracticeMissed.addEventListener('click', () => {
      const wrongPool = state.quiz.wrong.slice();
      if (!wrongPool.length) return;
      // Strip userPick before re-quizzing
      const queue = wrongPool.map(w => state.dictionary.find(d => d.en.toLowerCase() === w.en.toLowerCase()) || w);
      tfStart(queue.length, queue);
    });
  }

  // ─── Sentence Mode ───────────────────────────
  if (ui.sentGenerateBtn) {
    ui.sentGenerateBtn.addEventListener('click', generateSentences);
  }
  if (ui.sentWordEn) {
    ui.sentWordEn.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); ui.sentWordAr.focus(); }
    });
  }
  if (ui.sentWordAr) {
    ui.sentWordAr.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); generateSentences(); }
    });
  }

  // Dictionary tabs (event delegation)
  const dictTabsEl = document.querySelector('.dict-tabs');
  if (dictTabsEl) {
    dictTabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.dict-tab');
      if (btn && btn.dataset.tab) switchDictTab(btn.dataset.tab);
    });
  }
}

// ─── Init ────────────────────────────────────
async function init() {
  bindEvents();
  await Promise.all([loadWords(), loadStreak()]);
  updateWelcomeVisibility();
  renderSentenceCards();
  if (ui.toggleExamples) ui.toggleExamples.checked = isExamplesEnabled();
  // Backfill missing example sentences for legacy words (throttled)
  backfillExamples();
}

document.addEventListener('DOMContentLoaded', init);
