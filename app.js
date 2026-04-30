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

// ─── State ───────────────────────────────────
let state = {
  today:      [],   // [{en, ar, date}]
  dictionary: [],   // [{en, ar, date}]
  storyWords: [],
  story:      '',
  storyAr:    '',
  showingAr:  false,
  question:   '',
  generating: false,
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
  const msg = (err && err.message) || String(err);
  ui.storyText.innerHTML =
    `<div class="error-box">
       <strong>⚠️ Failed to generate story</strong>
       <div class="error-detail">${escHtml(msg)}</div>
       <div class="error-hint">Open DevTools → Console for full details.</div>
     </div>`;
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
  const [dictRes, todayRes] = await Promise.all([
    sb.from('dictionary').select('*').order('added_at', { ascending: true }),
    sb.from('today_words').select('*').order('added_at', { ascending: true }),
  ]);

  if (dictRes.error)  console.error('[loadWords dict]',  dictRes.error);
  if (todayRes.error) console.error('[loadWords today]', todayRes.error);

  state.dictionary = (dictRes.data  || []).map(r => ({ en: r.word_en, ar: r.word_ar || '', date: r.added_at }));
  state.today      = (todayRes.data || []).map(r => ({ en: r.word_en, ar: r.word_ar || '', date: r.added_at }));

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
    showToast('⚠️ Error saving word. Check connection.');
    return;
  }
  state.today.push({ en, ar, date: new Date().toISOString() });

  // Add to dictionary if new
  const dictHit = state.dictionary.find(w => w.en.toLowerCase() === en.toLowerCase());
  if (!dictHit) {
    const { error: dictErr } = await sb.from('dictionary').insert({ word_en: en, word_ar: ar });
    if (!dictErr) {
      state.dictionary.push({ en, ar, date: new Date().toISOString() });
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
    showToast(`❌ ${err.message}`, 8000);
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
    showToast(`Translation failed: ${err.message}`, 8000);
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
function renderDictionary(filter = '') {
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

  ui.dictEmpty.classList.add('hidden');
  ui.dictList.innerHTML = [...list].reverse().map(w => `
    <div class="word-item">
      <div class="word-badge">${escHtml(w.en.slice(0, 2).toUpperCase())}</div>
      <div class="word-meta">
        <div class="word-en">${escHtml(w.en)}</div>
        ${w.ar ? `<div class="word-ar">${escHtml(w.ar)}</div>` : ''}
        <div class="word-date">${new Date(w.date || Date.now()).toLocaleDateString()}</div>
      </div>
    </div>
  `).join('');
}

// ─── Welcome guide ───────────────────────────
function updateWelcomeVisibility() {
  if (!ui.welcomeCard) return;
  const hasActivity = state.dictionary.length > 0 || state.today.length > 0;
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

  if (name === 'dictionary') renderDictionary(ui.dictSearch.value.toLowerCase());
  if (name === 'archive')    renderArchive();
}

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
}

// ─── Init ────────────────────────────────────
async function init() {
  bindEvents();
  await Promise.all([loadWords(), loadStreak()]);
  updateWelcomeVisibility();
}

document.addEventListener('DOMContentLoaded', init);
