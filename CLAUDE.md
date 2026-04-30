# CLAUDE.md — VocabStory

دليل العمل في هذا المشروع. اقرأه قبل أي تعديل.

---

## 1. ما هو المشروع

**VocabStory** — تطبيق ويب لتعلّم الإنجليزية للمتحدثين بالعربية.
- المستخدم يضيف كلمات إنجليزية (مع معناها بالعربية اختيارياً).
- الموقع يُولّد قصة قصيرة (B1–B2) تستخدم كل الكلمات بشكل طبيعي + سؤال للتفكير.
- الكلمات تُحفظ في **Dictionary**، والقصص في **Archive**، مع **Streak** يومي.

تصميم مستوحى من Duolingo: أخضر، أزرار "pushable"، Nunito font، mobile-first.

---

## 2. الستاك التقني (مهم — لا تفترض غير ذلك)

- **Vanilla HTML + CSS + JavaScript** — لا توجد build tools، لا framework، لا npm.
- **Groq API** عبر `fetch` مباشرة من المتصفح (`llama-3.1-8b-instant`).
- **localStorage** للتخزين (لا توجد قاعدة بيانات أو خادم).
- **Google Fonts**: Nunito + Inter.

> ⚠️ لا توجد Next.js / React / TypeScript / Tailwind / shadcn هنا. لو احتاج المشروع تحويل لذلك، اطلب تأكيداً صريحاً قبل البدء.

---

## 3. ملفات المشروع

```
english projact/
├── index.html   — البنية: sidebar (desktop) + bottom-nav (mobile) + 3 صفحات
├── style.css    — design system كامل بمتغيرات CSS (Duolingo palette)
├── app.js       — كل المنطق: state, storage, Groq calls, rendering
└── CLAUDE.md    — هذا الملف
```

### مفاتيح localStorage (في `app.js → STORAGE`)

| Key | الغرض |
|---|---|
| `vs_dictionary` | كل كلمة أُضيفت يوماً (دائم) |
| `vs_today` | كلمات اليوم المختارة للقصة (تُمسح بعد التوليد) |
| `vs_archive` | آخر 50 قصة |
| `vs_streak` / `vs_last_day` | عداد الأيام المتتالية |
| `vs_welcome_dismissed` | هل أُغلقت بطاقة الترحيب |

---

## 4. لغة التواصل

- **حاورني بالعربية دائماً.** الأكواد والمتغيرات بالإنجليزية.
- موجز ومباشر. لا شروحات طويلة إلا لو طلبت "اشرح" أو "فكر".

---

## 5. معايير التصميم (UI/UX)

- التزم بـ **design system** الموجود في `:root` داخل `style.css` — لا تُدخل ألواناً أو radii جديدة بدون سبب.
- **Mobile-first**: ابدأ من الشاشات الصغيرة، ثم `@media (min-width: 700px)` و `1024px` و `1280px`.
- **Accessibility**: `aria-label`, `aria-expanded`, semantic HTML, keyboard nav (Enter/Space).
- **Micro-interactions**: استخدم `--transition` المعرّف. الـ animations (`popIn`, `slideUp`, `toastIn`) قابلة لإعادة الاستخدام.
- لا "AI slop": لا ظلال أو تدرجات عشوائية. حافظ على Duolingo style النظيف.
- RTL داخل بطاقات عربية: `direction: rtl` على الحاوية فقط، لا تقلب الـ layout كله.

---

## 6. أسلوب الكود

### JavaScript
- **Vanilla ES6+** — لا libraries.
- `'use strict'` (موجود)، `const`/`let` فقط.
- **Event delegation** (chip-remove، archive-list) — حافظ عليه.
- **Escape HTML** عبر `escHtml()` لأي بيانات مستخدم تُحقن في `innerHTML`.
- **Render functions** تعتمد على `state` و localStorage فقط، تكتب في DOM عبر `ui`.
- **تسلسل التحديث**: state → `save*()` → `render*()` → `toggleGenerateBtn()`.

### CSS
- استخدم متغيرات `:root` بدلاً من قيم hardcoded.
- أسماء classes بـ `kebab-case`.
- جروب الـ rules تحت تعليق قسم (`/* ===== WELCOME CARD ===== */`).

### HTML
- IDs للعناصر التفاعلية الفريدة، classes للأنماط القابلة للإعادة.
- لا inline styles.

---

## 7. سير العمل

1. **افهم الطلب** — اسأل بالعربية لو الـ brief غامض.
2. **خطّط** للتعديلات الكبيرة (3+ ملفات أو ميزة جديدة)، تنفيذ مباشر للصغيرة.
3. **عدّل الملفات الموجودة** — كل المنطق في `app.js`، كل الستايل في `style.css`. لا تُنشئ ملفات بدون داعٍ.
4. **راجع** الـ responsive (mobile + tablet + desktop) والـ a11y بعد التنفيذ.
5. **اختبر يدوياً** عبر فتح `index.html` (أو Live Server) قبل الإعلان عن الانتهاء.

---

## 8. حل المشكلات

ترتيب الفحص: **Console → Network (Groq) → localStorage → state → DOM**.
- Groq errors تُعرض في `error-box` داخل story-card + toast.
- لو الكلمات لا تظهر في Dictionary: افحص `vs_dictionary` في localStorage.
- لو streak لا يزيد: افحص `vs_last_day` (يعتمد على `Date.toDateString()`).

بعد الإصلاح، اشرح بسطر السبب الجذري.

---

## 9. تشغيل / نشر

- لا أوامر build. افتح `index.html` مباشرة أو شغّل Live Server.
- النشر: أي static host (Netlify/Vercel/GitHub Pages) — ارفع الـ 3 ملفات.

---

## 10. تنبيهات أمنية معروفة

- 🚨 **`GROQ_API_KEY` في `app.js` مكشوف بالكامل في المتصفح.** هذا نموذج تجريبي. قبل أي نشر عام: انقل المفتاح إلى backend proxy أو edge function مع rate limiting.
- لا تُخزّن بيانات حساسة في localStorage.

---

## 11. قيود التواصل لتوفير التوكنات

- ردود قصيرة، حلول مباشرة.
- لا تكرّر التعليمات الواضحة.
- لا تُضِف ميزات لم تُطلب.
- لا تكتب comments إلا لشرح "لماذا" غير الواضح.
