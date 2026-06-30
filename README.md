# ManualMind

**AI that finds — or builds — a manual for anything.**

Type any product, problem, or task (or upload a photo of it) and ManualMind runs a tiered pipeline to get you a usable manual as fast as possible:

1. **Identify** — if you upload a photo, Claude vision names the exact product/model.
2. **Find first** — it web-searches for the *official* manufacturer manual or PDF. If one exists, you get the real thing, linked directly.
3. **Synthesize** — when no official manual exists, it pulls real Reddit threads + web results and builds a clean, step-by-step manual **in real time**, with sources cited.

Built with Next.js (App Router) and the Anthropic API. Deploys on Vercel.

## Setup

1. Set the `ANTHROPIC_API_KEY` environment variable (in Vercel: Project → Settings → Environment Variables).
2. Deploy. That's it.

Get a key at https://console.anthropic.com/

## Local dev

```bash
npm install
cp .env.example .env.local   # add your key
npm run dev
```
