# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

# VocabStory — دليل العمل في المشروع

اقرأه قبل أي تعديل.

---

## 1. ما هو المشروع

**VocabStory** — تطبيق ويب لتعلّم الإنجليزية للمتحدثين بالعربية. يحتوي على ٣ أنماط للتعلّم:

1. **Story Mode (Today)** — المستخدم يضيف كلمات → الموقع يُولّد قصة قصيرة (B1–B2) تستخدم كل الكلمات + سؤال للتفكير. كل كلمة تُحفظ في **Dictionary** (Story Words tab) مع جملة داعمة + تعريف، وكل قصة تُحفظ في **Archive** (آخر 50). **Streak** يومي.
2. **Sentence Mode (Sentences)** — المستخدم يُدخل كلمة واحدة → الذكاء الاصطناعي يتحقق منها ويُولّد ٣ جمل في سياقات/أحداث مختلفة (At work / With friends / Facing a problem...). تظهر الكلمات كـ session cards (تختفي عند الرفرش) + تُحفظ دائماً في **Dictionary** (Sentence Words tab).
3. **Think Fast** — quiz موقّت (15s لكل سؤال) يربط التعريف الإنجليزي بالكلمة الإنجليزية، مع ترتيب أولوية مبني على الأخطاء السابقة وفترة الغياب منذ آخر مراجعة. **يعمل على Story Words فقط** (لأنه يستخدم `definition_en`).

تصميم مستوحى من Duolingo: أخضر، أزرار "pushable"، Nunito font، mobile-first.

---

## 2. الستاك التقني (مهم — لا تفترض غير ذلك)

- **Frontend**: Vanilla HTML + CSS + JavaScript — لا build tools، لا framework، لا npm.
- **Storage**: **Supabase** (Postgres) لكل البيانات المستمرة (الكلمات، القصص، إحصائيات الـ quiz، الـ streak). الـ client SDK (`@supabase/supabase-js@2`) يُحمَّل من CDN في `index.html`.
- **AI**: **Groq API** (`llama-3.1-8b-instant`) عبر **Vercel serverless functions** في `api/` — المتصفح **لا** يستدعي Groq مباشرة. مفتاح `GROQ_API_KEY` يبقى server-side فقط.
- **localStorage**: مقتصر على flags بسيطة فقط (`vs_welcome_dismissed`, `vs_examples_enabled`). لا توجد بيانات مستخدم في localStorage بعد الـ migration إلى Supabase.
- **Hosting**: Vercel (يخدم static files + الـ functions على نفس origin).
- **Google Fonts**: Nunito + Inter.

> ⚠️ لا توجد Next.js / React / TypeScript / Tailwind / shadcn هنا. لو احتاج المشروع تحويل لذلك، اطلب تأكيداً صريحاً قبل البدء.

---

## 3. ملفات المشروع

```
english projact/
├── index.html        — البنية: sidebar (desktop) + bottom-nav (mobile) + 4 صفحات
├── style.css         — design system كامل بمتغيرات CSS (Duolingo palette)
├── app.js            — كل منطق الـ frontend: state, Supabase calls, API helpers, rendering, Think Fast, Sentence Mode
├── api/
│   ├── generate.js   — POST /api/generate — يولّد القصة + سؤال التفكير
│   ├── translate.js  — POST /api/translate — يترجم القصة إلى العربية
│   ├── word-info.js  — POST /api/word-info — يولّد example + English definition لكلمة
│   └── sentences.js  — POST /api/sentences — يتحقق من الكلمة + يولّد 3 جمل في سياقات مختلفة
├── migration.sql     — schema migration (يُشغَّل يدوياً في Supabase SQL Editor)
├── vercel.json       — rewrites لـ /api/* endpoints
└── CLAUDE.md         — هذا الملف
```

### جداول Supabase (الـ schema)

| الجدول | الأعمدة الرئيسية |
|---|---|
| `dictionary` | `word_en`, `word_ar`, `example_en`, `definition_en`, `quiz_correct`, `quiz_wrong`, `quiz_last_seen`, `quiz_avg_ms`, `added_at` |
| `today_words` | `id`, `word_en`, `word_ar`, `added_at` (تُمسح بعد توليد القصة) |
| `stories` | `id`, `story_text`, `question`, `words` (jsonb), `created_at` |
| `streak` | `id` (single row, =1), `count`, `last_day` (date) |
| `sentences_words` | `id`, `word_en`, `word_ar`, `sentences` (jsonb: `[{event, sentence}]`), `added_at` |

أي تعديل على الـ schema يجب أن يُضاف إلى `migration.sql` بصيغة `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`، ثم نبّه المستخدم لتشغيله في Supabase.

### مفاتيح localStorage

| Key | الغرض |
|---|---|
| `vs_welcome_dismissed` | هل أُغلقت بطاقة الترحيب |
| `vs_examples_enabled` | toggle "إظهار الجمل الداعمة" في Dictionary (default: on) |

---

## 4. لغة التواصل

- **حاورني بالعربية دائماً.** الأكواد والمتغيرات بالإنجليزية.
- موجز ومباشر. لا شروحات طويلة إلا لو طلبت "اشرح" أو "فكر".

---

## 5. معايير التصميم (UI/UX)

- التزم بـ **design system** الموجود في `:root` داخل `style.css` — لا تُدخل ألواناً أو radii جديدة بدون سبب.
- **Mobile-first**: ابدأ من الشاشات الصغيرة، ثم `@media (min-width: 700px)` و `1024px` و `1280px`.
- **Accessibility**: `aria-label`, `aria-expanded`, semantic HTML, keyboard nav (Enter/Space).
- **Micro-interactions**: استخدم `--transition` المعرّف. الـ animations (`popIn`, `slideUp`, `toastIn`, `tf-clue-anim`) قابلة لإعادة الاستخدام.
- لا "AI slop": لا ظلال أو تدرجات عشوائية. حافظ على Duolingo style النظيف.
- RTL داخل بطاقات عربية: `direction: rtl` على الحاوية فقط، لا تقلب الـ layout كله.

---

## 6. أسلوب الكود

### JavaScript (frontend — `app.js`)
- **Vanilla ES6+** — لا libraries خارج Supabase SDK.
- `'use strict'`، `const`/`let` فقط.
- **Event delegation** (chip-remove، archive-list، tf-options) — حافظ عليه.
- **Escape HTML** عبر `escHtml()` لأي بيانات مستخدم تُحقن في `innerHTML`.
- **تسلسل التحديث**: استدعاء Supabase → تحديث `state` → `render*()` → `toggleGenerateBtn()`.
- استخدم `apiPost(path, body)` لكل استدعاءات `/api/*` — لا تكرّر الـ fetch boilerplate.
- المطابقة على الكلمة في Supabase تستخدم `ilike('word_en', en)` (case-insensitive).

### Serverless functions (`api/*.js`)
- صيغة `module.exports = async function handler(req, res) { ... }` (Vercel Node.js runtime).
- كل endpoint يبدأ بـ CORS headers + معالجة `OPTIONS` + التحقق من `POST`.
- مفتاح Groq من `process.env.GROQ_API_KEY` فقط — **لا تُدخله في الكود ولا ترفعه في git.**
- تحقق من شكل الـ body وأرجع 400 برسالة واضحة عند الخطأ. أخطاء Groq → 502، أخطاء داخلية → 500.

### CSS
- استخدم متغيرات `:root` بدلاً من قيم hardcoded.
- أسماء classes بـ `kebab-case`.
- جروب الـ rules تحت تعليق قسم (`/* ===== WELCOME CARD ===== */`).

### HTML
- IDs للعناصر التفاعلية الفريدة، classes للأنماط القابلة للإعادة.
- لا inline styles.

---

## 7. Think Fast — تفاصيل مهمة

- يتطلب **4 كلمات على الأقل** في Dictionary، وكل كلمة لازم يكون عندها `definition_en` مولّد.
- لو لم تتوفر تعريفات كافية: الـ UI يعرض toast ويُشغّل `fetchWordInfoFor()` على الكلمات الناقصة في الخلفية.
- ترتيب الأولوية في `tfBuildQueue()`: الكلمات التي أُخطئت سابقاً أولاً، ثم التي لم تُختبر أبداً، ثم القديمة (`> 3 days`)، مع dampening للكلمات التي أُجيب عليها صحيحاً مؤخراً + jitter عشوائي.
- الـ distractors في `tfPickDistractors()` تُفضّل كلمات بطول مقارب (±3 حروف) لتجنب الـ visual hints.
- timer 15s عبر `requestAnimationFrame` + معالجة `visibilitychange` لتجميد المؤقت عند إخفاء التبويب.
- الإحصائيات تُحدَّث في Supabase fire-and-forget بعد كل سؤال (`quiz_correct`, `quiz_wrong`, `quiz_avg_ms`, `quiz_last_seen`).
- **لا يستخدم `state.sentenceWords`** — Sentence Mode ليس لها `definition_en`.

---

## 7.5. Sentence Mode — تفاصيل مهمة

- صفحة `#page-sentences` بحقل إدخال (كلمة + معنى عربي اختياري) + زر "Generate Sentences".
- **Pre-validation** على client: regex `/^[a-zA-Z\-']+$/` يرفض الأحرف غير اللاتينية فوراً قبل API call.
- Endpoint `/api/sentences` يدمج التحقق + التوليد في Groq call واحد:
  - لو الكلمة غير حقيقية: `{ valid: false, error: "..." }`
  - لو صحيحة: `{ valid: true, sentences: [{event, sentence}, {event, sentence}, {event, sentence}] }`
  - يتحقق من الـ output: 3 عناصر، الكلمة موجودة في كل جملة (regex `\\b{word}\\b`), retry تلقائي مرة واحدة.
- **Session vs Persistent**:
  - `state.sentenceCards` — session-only، مرتبطة بالـ runtime، تختفي عند الرفرش. Newest on top (`unshift`).
  - `state.sentenceWords` — تُجلب من Supabase في `loadWords()`، تظهر دائماً في Dictionary > Sentence Words tab.
- **منع التكرار في Supabase**: قبل insert، نفحص `state.sentenceWords` — لو الكلمة موجودة، نعرض الـ session card فقط بدون insert (الجمل الجديدة لا تُحفظ).
- **التمييز البصري**: الكلمة في الجملة تُلَفّ بـ `<mark class="sent-mark">` (أزرق فاتح) لتمييزها عن mark الأخضر في Story Mode.
- **Dictionary tabs**: `state.dictTab ∈ {'story', 'sentences'}` — `switchDictTab()` يبدّل الـ rendering ويخفي `toggle-examples-row` في Sentence tab.

---

## 8. سير العمل

1. **افهم الطلب** — اسأل بالعربية لو الـ brief غامض.
2. **خطّط** للتعديلات الكبيرة (3+ ملفات أو ميزة جديدة)، تنفيذ مباشر للصغيرة.
3. **عدّل الملفات الموجودة** — منطق الـ frontend في `app.js`، الستايل في `style.css`، استدعاءات Groq في `api/*.js`. لا تُنشئ ملفات بدون داعٍ.
4. أي تغيير في schema → أضف `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` في `migration.sql` ونبّه المستخدم.
5. **راجع** الـ responsive (mobile + tablet + desktop) والـ a11y بعد التنفيذ.
6. **اختبر يدوياً** عبر `vercel dev` (أو preview deploy) قبل الإعلان عن الانتهاء — فتح `index.html` مباشرة لن يعمل لأن `/api/*` غير متاح.

---

## 9. تشغيل / نشر

- **التطوير المحلي**: `vercel dev` (يخدم static + functions على نفس origin).
- **النشر**: `git push` → Vercel يبني تلقائياً. متغير `GROQ_API_KEY` يجب أن يكون مُعرَّفاً في Vercel project settings.
- **Supabase**: أي تعديل schema يتطلب تشغيل `migration.sql` يدوياً في SQL Editor.

---

## 10. حل المشكلات

ترتيب الفحص: **Console → Network (`/api/*` و Supabase) → Supabase Studio → state → DOM**.
- أخطاء Groq تظهر في `error-box` داخل story-card + toast.
- الكلمات لا تظهر في Dictionary → افحص استجابة `sb.from('dictionary').select(...)` في Network، وتحقق من RLS policies.
- streak لا يزيد → افحص صف `streak` بـ `id=1` (يعتمد على `YYYY-MM-DD` من `toISOString().slice(0,10)`).
- Think Fast لا يبدأ → تحقق أن كلمات Dictionary لها `definition_en` (الكلمات القديمة قد تحتاج backfill — يجري تلقائياً عبر `backfillExamples()` عند فتح Dictionary).

بعد الإصلاح، اشرح بسطر السبب الجذري.

---

## 11. تنبيهات أمنية

- ✅ مفتاح Groq أصبح server-side فقط (env var في Vercel).
- ⚠️ مفتاح Supabase **publishable key** موجود في `app.js` — هذا متوقع لـ client-side، لكن الأمان يعتمد كلياً على **RLS policies** في Supabase. أي جدول جديد يحتاج policies مناسبة.
- لا تُخزّن بيانات حساسة في localStorage.

---

## 12. قيود التواصل لتوفير التوكنات

- ردود قصيرة، حلول مباشرة.
- لا تكرّر التعليمات الواضحة.
- لا تُضِف ميزات لم تُطلب.
- لا تكتب comments إلا لشرح "لماذا" غير الواضح.
