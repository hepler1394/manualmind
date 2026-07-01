# ManualMind

**AI that finds — or builds — a manual for anything.**

Type any product, problem, or task (or upload a photo) and ManualMind runs a tiered pipeline:

1. **Identify** — if you upload a photo, Claude vision names the exact product/model.
2. **Find first** — it web-searches for the *official* manufacturer manual/PDF. If one exists, you get the real thing, linked.
3. **Synthesize** — when none exists, it pulls real Reddit threads + web results and builds a clean, step-by-step manual in real time, with sources cited.

Extras: photo upload, streamed output, Save-as-PDF, shareable links, a saved manual **library**, **Spaces** (group manuals by home / property / shop), and per-manual **follow-up chat**. Accounts + billing make it a subscription product.

---

## Tech

- **Next.js 14** (App Router) on Vercel
- **Anthropic API** (vision + web search + streamed synthesis and chat)
- **Supabase** — auth (magic link + Google) and Postgres (library, spaces, chat)
- **Stripe** — Pro subscription ($20/mo), customer portal, webhooks

## Free vs Pro

- **Free:** 5 manuals / month (3 / day signed-out), library, spaces, chat, PDF & share.
- **Pro ($20/mo):** unlimited manuals.

Limits live in `lib/plan.ts`; enforcement is server-side in `app/api/manual/route.ts`.

---

## Setup

### 1. Anthropic
Add `ANTHROPIC_API_KEY` (https://console.anthropic.com/).

### 2. Supabase
1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/schema.sql` (fresh install — creates everything incl. spaces + chat).
   - If you already ran the Phase 1 schema, run `supabase/phase2.sql` instead to add spaces + chat.
3. Copy Project URL + anon key + service-role key into env vars.
4. Auth → URL Configuration: add your site URL and `…/auth/callback` as a redirect URL. (Optional) enable Google provider.

### 3. Stripe
1. Create a **recurring $20/mo** price; put its ID in `STRIPE_PRICE_ID`.
2. Add `STRIPE_SECRET_KEY`.
3. Add a webhook to `https://your-domain.com/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.

### 4. Site
Set `NEXT_PUBLIC_SITE_URL` to your deployed URL.

> **Graceful degradation:** with only `ANTHROPIC_API_KEY` set, the app runs as the anonymous, local-library version. Auth, spaces, chat persistence, and billing activate once the Supabase + Stripe env vars are present.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Roadmap

Delivered: tiered manual pipeline, photo ID, streaming, PDF/share, accounts + billing (Phase 1), **Spaces + per-manual chat (Phase 2)**.

Next (see `ManualMind-Product-Plan`): quick-start cards, smart photo (model/serial/error-code reading), maintenance reminders, public SEO manual pages, Team plan.
