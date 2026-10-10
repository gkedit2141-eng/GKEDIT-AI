# GKEDIT AI: public website

One Node service serves the site (`index.html`) and the secure AI endpoint (`/api/chat`).
Your Anthropic API key stays on the server only.

## Run locally
    ANTHROPIC_API_KEY=sk-ant-... node server.js
    open http://localhost:8787

## Deploy on Render (free tier available)
1. Put these files in a GitHub repo (do NOT commit your key).
2. Render.com > New > Web Service > connect the repo.
   Build command: (leave empty)   Start command: `node server.js`
3. Environment variables: `ANTHROPIC_API_KEY` (required).
   Optional: `ACCESS_CODE` (makes the site private: visitors must enter the code),
   `RATE_PER_MIN` (12), `RATE_PER_DAY` per visitor (150), `GLOBAL_PER_DAY` total (2000).
4. Deploy. Render gives you an https URL. Add your own domain in Render > Settings > Custom Domains.
Railway, Fly.io and any VPS with Node 18+ work the same way.

## Cost control
Every visitor message uses your API credit. Set a spend limit in the Anthropic Console,
and keep the rate limits (or set ACCESS_CODE) before sharing publicly.
Limits are in memory and reset when the server restarts.

## Notes
- Voice input uses the browser's speech recognition (best in Chrome). Replies use browser text-to-speech.
- Tasks/notes are stored in each visitor's own browser.
- Calls, WhatsApp, email and SMS only open a draft the user must tap to confirm.
