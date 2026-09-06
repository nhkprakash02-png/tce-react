# TCE - The Competitive Edge — React Rebuild

A modular Vite + React port of the original single-file `index.html` coaching-institute site.
See `MIGRATION_MAP.md` for exactly where every original feature/function ended up.

## Project structure

```
src/
  main.jsx                 Entry point
  App.jsx                  Root shell: Navbar, Ticker, Hero, page router, floating buttons, modals
  firebase.js               Firebase init (Auth, Firestore, Storage)
  context/AppContext.jsx    Global state (DB, user, admin, theme, active tab, modal) via useApp()
  lib/
    db.js                   Firestore chunked read/write + realtime listeners
    seedData.js             Seed/demo data + DB normalization
    utils.js                uid, priceLabel, timeAgo, TABS, SUBCATEGORIES, etc.
    examEngine.js           Pure CBT logic: scoring, leaderboard, scorecard canvas, speed classification
    watermark.js            PDF watermarking (pdf-lib)
  hooks/useExam.js          Stateful hook for a running exam (timer, anti-cheat, navigation)
  components/
    Navbar.jsx, Footer.jsx, Ticker.jsx, HeroCarousel.jsx, Mentors.jsx, Modal.jsx
    AuthModal.jsx, EnrollModal.jsx, AdminLoginModal.jsx
    exam/                   ExamFlow, ExamInstructions, ExamRunner, ResultScreen, ReviewScreen, AttemptSelector
    admin/                  One file per Admin Panel tab (see MIGRATION_MAP.md)
  pages/
    Home.jsx, MockTest.jsx, Quiz.jsx, PyqHub.jsx, StudyMaterials.jsx,
    Batches.jsx, Dashboard.jsx, Notices.jsx, AdminPanel.jsx
```

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and fill in your Firebase project's config (or leave it — the
values already match your live `tce-nahata` Firebase project as a fallback default in
`src/firebase.js`, but env vars are the safer place to keep them going forward):

```bash
cp .env.example .env
```

## Run locally

```bash
npm run dev
```

Opens at `http://localhost:5173`.

## Build for production

```bash
npm run build
```

Output goes to `dist/`. Preview it locally with `npm run preview`.

## Deploy

### Vercel

1. Push this project to a GitHub repo.
2. In Vercel: **New Project** → import the repo.
3. Framework preset: **Vite**. Build command `npm run build`, output directory `dist` (Vercel
   usually auto-detects both).
4. Add your Firebase env vars (from `.env.example`) under **Settings → Environment Variables**.
5. Deploy. Then under **Settings → Domains**, add `tcenahata.in` (and `www.tcenahata.in` if you
   want both) and follow Vercel's DNS instructions (usually an `A` record to Vercel's IP or a
   `CNAME` for the `www` subdomain, set at your domain registrar).

### Netlify

1. Push to GitHub, then **Add new site → Import an existing project** in Netlify.
2. Build command: `npm run build`. Publish directory: `dist`.
3. Add the same Firebase env vars under **Site configuration → Environment variables**.
4. Under **Domain management**, add `tcenahata.in` as a custom domain and follow Netlify's DNS
   instructions.

### Either platform — one more step for Google Sign-In

Firebase Auth only allows sign-in from domains you've explicitly authorized. After deploying:

Firebase Console → Authentication → Settings → **Authorized domains** → add `tcenahata.in`
(and your Vercel/Netlify preview domain, e.g. `your-project.vercel.app`, if you want Google
Sign-In to work on preview deployments too).

## Before going live: two things worth fixing

1. **Admin password.** Currently a plaintext client-side constant (ported as-is from the
   original — see `MIGRATION_MAP.md`). Fine for internal testing, not for production. Ask me to
   wire up proper Firebase Auth + custom-claim admin check when you're ready.
2. **Firestore Security Rules.** This app reads/writes `tce_app_data/*` directly from the
   client using your Firebase project's public API key (normal and expected for a Firebase web
   app), but your actual data protection comes from your **Firestore Security Rules** — make
   sure they restrict writes appropriately (e.g., only authenticated admin users can write to
   `mockTests`, `pyqSets`, `batches`, etc., while students can only write their own submission/
   student records). If you haven't set custom rules yet, check the Firebase Console →
   Firestore Database → Rules tab.

## What's a direct port vs. what changed

Full detail in `MIGRATION_MAP.md`, but in short: **all business logic and data is unchanged** —
same Firestore documents, same seed data, same scoring/marking rules, same access-control logic.
The differences are structural only (React components instead of DOM string templates, modular
Firebase SDK instead of compat, Tailwind compiled at build time instead of loaded from a CDN).
