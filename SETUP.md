# Song of the Day — file placement guide

Drop these files into your existing Vite project (the one you scaffolded with
`npm create vite@latest . -- --template react`) at these exact paths:

```
song-of-the-day/
├── src/
│   ├── App.jsx        ← replace the existing src/App.jsx with this one
│   └── firebase.js     ← new file
├── api/
│   └── pick-song.js    ← new folder + file, at the project ROOT (not inside src/)
└── .env.example         ← new file, project root (reference only, not used directly)
```

## Steps

1. Copy `App.jsx` into `src/App.jsx`, overwriting the Vite default.
2. Copy `firebase.js` into `src/firebase.js`.
3. Create an `api` folder at your project root (same level as `src`, `package.json`),
   and put `pick-song.js` inside it. Vercel auto-detects anything in `/api` as a
   serverless function once deployed — no extra config needed.
4. Copy `.env.example` to your project root as-is (for reference). Then create
   your real `.env.local` (also project root) with actual values — see below.
5. Make sure `src/main.jsx` (Vite's default entry file) still does:
   ```jsx
   import App from './App'
   ```
   This should already be there from the Vite scaffold — no change needed
   unless you renamed something.

## Your `.env.local` (create this yourself — don't commit it)

```
VITE_FIREBASE_API_KEY=your_actual_value
VITE_FIREBASE_AUTH_DOMAIN=your_actual_value
VITE_FIREBASE_PROJECT_ID=your_actual_value
VITE_FIREBASE_STORAGE_BUCKET=your_actual_value
VITE_FIREBASE_SENDER_ID=your_actual_value
VITE_FIREBASE_APP_ID=your_actual_value
ANTHROPIC_API_KEY=your_actual_value
```

Values come from:
- The six `VITE_FIREBASE_*` ones: Firebase console → Project settings → your web app's config
- `ANTHROPIC_API_KEY`: console.anthropic.com → API Keys

## Install the one missing dependency

```bash
npm install firebase
```

## Run it locally

```bash
npm run dev
```

Note: the `/api/pick-song` serverless function won't run under plain
`npm run dev` (that's Vite's dev server, not Vercel's). To test the full
flow — including the "pick a song" button — locally, either:

- Install the Vercel CLI and run `vercel dev` instead of `npm run dev`, or
- Just deploy to Vercel (push to GitHub, Vercel auto-deploys) and test on
  the live URL — the serverless function only exists once deployed there
  (or run via `vercel dev`).

Everything else (rating, history, Power Rankings, import, settings) works
fine under plain `npm run dev` since those only touch Firestore, not the
API route.
