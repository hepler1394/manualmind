# ManualMind

**The answer engine for everything you own.** Live at [manualmind-six.vercel.app](https://manualmind-six.vercel.app).

Type any product, problem, or error code — or upload a photo or PDF — and ManualMind runs a tiered pipeline:

1. **Identify** — Claude vision names the exact product/model from a photo (including model plates and on-screen error codes); PDFs are treated as the authoritative source document.
2. **Find first** — it web-searches for the *official* manufacturer manual/PDF. If one exists, you get the real thing, linked.
3. **Synthesize** — when none exists, it pulls real Reddit threads, web results, and YouTube tutorials and builds a clean, step-by-step manual in real time, with every source cited.

Completed manuals can be **published to a public, searchable library** (`/library`, `/m/<slug>`) with full SEO treatment — sitemap, OG cards, JSON-LD — so each one becomes a Google-indexable answer page. The design follows an Apple-style system: fog/snow/ink palette, one azure CTA color, no icons, no shadows.

Extras: photo upload (reads model numbers and on-screen error codes), streamed output, Save-as-PDF, **quick-start cards** (1-page printable), shareable links, **public SEO manual pages** (publish any saved manual to `/m/<slug>`, with sitemap + JSON-LD), a saved manual **library**, **Spaces** (group by home / property / shop), per-manual **follow-up chat**, and **maintenance reminders** with AI suggestions. Accounts + billing make it a subscription product.

---

## Tech

- **Next.js 14** (App Router) on Vercel
- **Anthropic API** (vision + web search + streamed synthesis, chat, cards, reminder suggestions)
- **Supabase** — auth (magic link + Google) and Postgres (library, spaces, chat, reminders)
- **Stripe** — Pro subscription ($20/mo), customer portal, webhooks

## Free vs Pro

- **Free:** 5 manuals / month (3 / day signed-out), library, spaces, chat, reminders, PDF & share.
- **Pro ($20/mo):** unlimited manuals + quick-start cards.

Limits live in `lib/plan.ts`; enforcement is server-side in `app/api/manual/route.ts`.

---

## Setup

### 1. Anthropic
Add `ANTHROPIC_API_KEY` (https://console.anthropic.com/).

### 2. Supabase
1. Create a project at https://supabase.com.
2. In the SQL editor, run `supabase/schema.sql` (fresh install — creates everything through Phase 4).
   - Upgrading an existing DB? Run the migration for what you're missing: `supabase/phase2.sql` (spaces + chat), then `supabase/phase3.sql` (reminders), then `supabase/phase4.sql` (public manual pages).
3. Copy Project URL + anon key + service-role key into env vars.
4. Auth → URL Configuration: add your site URL and `…/auth/callback` as a redirect URL. (Optional) enable Google provider.

### 3. Stripe
1. Create a **recurring $20/mo** price; put its ID in `STRIPE_PRICE_ID`.
2. Add `STRIPE_SECRET_KEY`.
3. Add a webhook to `https://your-domain.com/api/stripe/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`; put its signing secret in `STRIPE_WEBHOOK_SECRET`.

### 4. Site
Set `NEXT_PUBLIC_SITE_URL` to your deployed URL.

> **Graceful degradation:** with only `ANTHROPIC_API_KEY` set, the app runs as the anonymous, local-library version. Auth, spaces, chat, reminders, and billing activate once the Supabase + Stripe env vars are present.

## Local dev

```bash
npm install
cp .env.example .env.local   # fill in values
npm run dev
```

## Roadmap

Delivered: tiered manual pipeline, photo ID, streaming, PDF/share (Phase 0–1), accounts + billing, Spaces + per-manual chat (Phase 2), quick-start cards + maintenance reminders (Phase 3), **public SEO manual pages + smart photo — model/serial/error-code reading (Phase 4)**, PWA install, CI build check.

Next: scheduled email delivery of due reminders (cron + email), Team plan, OG images for public pages.
