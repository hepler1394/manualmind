# ManualMind

**AI that finds — or builds — a manual for anything.**

Type any product, problem, or task (or upload a photo) and ManualMind runs a tiered pipeline:

1. **Identify** — if you upload a photo, Claude vision names the exact product/model.
2. **Find first** — it web-searches for the *official* manufacturer manual/PDF. If one exists, you get the real thing, linked.
3. **Synthesize** — when none exists, it pulls real Reddit threads + web results and builds a clean, step-by-step manual in real time, with sources cited.

Extras: photo upload, streamed output, Save-as-PDF, shareable links, and a saved manual **library**. Accounts + billing turn it into a subscription product.

---

## Tech

- **Next.js 14** (App Router) on Vercel
- **Anthropic API** (vision + web search + streamed synthesis)
- **Supabase** — auth (magic link + Google) and Postgres library
- **Stripe** — Pro subscription ($20/mo), customer portal, webhooks

## Free vs Pro

- **Free:** 5 manuals / month (3 / day for signed-out visitors), local + cloud library, PDF & share.
- **Pro ($20/mo):** unlimited manuals, unlimited cloud library.

Limits live in `lib/plan.ts`. Enforcement is server-side in `app/api/manual/route.ts`.

---

## Setup

### 1. Anthropic
Add `ANTHROPIC_API_KEY` (from https://console.anthropic.com/).

### 2. Supabase
1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/schema.sql` (creates tables, RLS, and the new-user trigger).
3. Copy Project URL + anon key + service-role key into env vars.
4. Auth → URL Configuration: add your site URL and `…/auth/callback` as a redirect URL. (Optional) enable Google provider.

### 3. Stripe
1. Create a **recurring $20/mo** product/price; copy the price ID into `STRIPE_PRICE_ID`.
2. Add `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint pointing to `https://your-domain.com/api/stripe/webhook` for events `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

### 4. Site
Set `NEXT_PUBLIC_SITE_URL` to your deployed URL (used for auth + Stripe redirects).

> The app **degrades gracefully**: with only `ANTHROPIC_API_KEY` set it still runs as the anonymous, local-library version. Auth/billing UI appears once Supabase env vars are present.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Roadmap

See `ManualMind-Product-Plan` (shared separately) for the full plan — Spaces/device libraries, per-manual follow-up chat, quick-start cards, maintenance reminders, and the Team plan.
