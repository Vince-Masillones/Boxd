# Boxd

A small full-stack app for browsing movies and TV shows and keeping your own ratings — like a simpler Letterboxd. Built with [TMDB](https://www.themoviedb.org/) (The Movie Database) as the data source.

**Live app:** _add your Netlify URL here after deploying_

## What it does

- Browse trending movies or TV shows (toggle between the two)
- Search for a title, with results updating as you type
- Click a poster to see an overview, genres, and top cast
- Rate anything 1–5 stars — from the grid or the detail view
- A "My Ratings" tab collects everything you've rated, sorted highest first
- Loading, error, and empty states are all handled (e.g. no search results, API not reachable)

Ratings are stored in your browser's `localStorage`. There's no account system and no database — closing your browser keeps your ratings (they live on that device/browser only), which keeps the project simple while still being genuinely useful.

## Architecture

This is "full stack" in the sense the assignment asks for: a static frontend plus a small serverless backend.

- **Frontend** — plain HTML/CSS/JS in `index.html`, `css/style.css`, `js/app.js`. No build step, no framework.
- **Backend** — a single Netlify Function at `netlify/functions/tmdb.js`. The frontend never talks to TMDB directly; it calls `/.netlify/functions/tmdb?path=...`, and that function attaches the real API key server-side before forwarding the request to TMDB.

### Why a serverless function instead of calling TMDB straight from the browser?

TMDB's API doesn't require a proxy for CORS (it allows browser requests directly). But if the key were used directly in frontend code, it would be visible to anyone who opens the browser's network tab or views the page source — even if it's never "committed" anywhere. Routing every request through a Netlify Function means:

- `TMDB_API_KEY` lives only in Netlify's environment variables (and in a local `.env` file that's git-ignored) — it never ships to the browser and never appears in the repository.
- The frontend only ever knows about `/.netlify/functions/tmdb`, not TMDB's real endpoint or key.

## Getting your own TMDB API key

1. Create a free account at [themoviedb.org](https://www.themoviedb.org/).
2. Go to **Settings → API** and request a free "Developer" API key (approval is usually instant).
3. Copy the key labeled **API Key (v3 auth)**.

## Running it locally

You'll need [Node.js](https://nodejs.org/) and the Netlify CLI (installed automatically via `npm install`, since it's listed as a dev dependency).

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/boxd.git
cd boxd

# 2. Install dependencies (this installs the Netlify CLI locally)
npm install

# 3. Add your API key
cp .env.example .env
# then open .env and paste your real TMDB key in place of the placeholder

# 4. Start the local dev server (serves the static site AND the function together)
npm run dev
```

`netlify dev` will print a local URL (typically `http://localhost:8888`). Open that — **not** a plain `http-server` or "Live Server" URL — because the serverless function only runs under `netlify dev` (or on Netlify itself). Requests to `/.netlify/functions/tmdb` won't resolve on a bare static server.

## Deploying to Netlify

1. Push this repo to GitHub.
2. In Netlify: **Add new site → Import an existing project** and pick the repo.
3. Build settings: publish directory `.`, no build command needed (leave it blank), functions directory `netlify/functions` (Netlify picks this up automatically from `netlify.toml`).
4. Before the first deploy (or right after), go to **Site configuration → Environment variables** and add:
   - `TMDB_API_KEY` = your real key
5. Deploy. The live site will call `/.netlify/functions/tmdb`, which Netlify runs on its own servers using the environment variable — the key is never bundled into the deployed frontend files.

## How the API key is handled (summary)

- **Not committed:** `.env` is listed in `.gitignore`. Only `.env.example` (with a placeholder) is committed.
- **Not exposed client-side:** all TMDB calls go through the Netlify Function, which reads `process.env.TMDB_API_KEY` on the server and injects it into the outgoing request to TMDB. The browser only ever sees responses, never the key itself.
- **Configured per environment:** locally via `.env`, in production via Netlify's dashboard environment variables.

## Project structure

```
boxd/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── netlify/
│   └── functions/
│       └── tmdb.js       # serverless proxy — attaches the API key server-side
├── netlify.toml
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Notes / known limits

- Ratings are per-browser (localStorage), not synced across devices — there's no account system.
- TMDB's free tier is generous for this kind of use, but if you hit a rate limit, wait a bit and retry.
- Adult content is filtered out of searches by default.
