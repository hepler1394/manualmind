# ManualMind — design contract (theme.md)

The identity below is **committed and loved**. Treat this file as the contract: extend it,
don't reinvent it. The 2026-07-07 anti-slop pass removed *structural* AI-grammar tells while
keeping every bit of the visual identity intact. Don't reintroduce the banned structures.

## Scene sentence

A tradesperson, renter, or tinkerer standing in front of a broken thing at night, phone in hand,
wanting one authoritative page instead of ten tabs. The interface is a black workshop wall; each
finished manual is a bright sheet of paper pinned to it. Confident, industrial, quiet — a concert
poster, not a SaaS dashboard.

## Type — three roles, no more

- **Anton** (`--font-display`) — compressed, uppercase, weight 400. Display only: hero H1, section
  H2 (`.big`), price figures, poster letters, audience names (`.audience dt`), 404. Letter-spacing
  stays near `0.01em`; it is meant to look packed.
- **Inter** (`--font-body`, 400/500) — all body copy, UI, buttons, labels. Never used for display.
- **Caveat** (`--font-cursive`) — the cursive signature. **Used exactly once, in the hero:**
  "The manual for *anything*." That single handwritten word is the brand's wink. It is NOT a
  per-heading tool — do not sprinkle it across section headings (that was the old slop; removed).

Pairing works because the three families sit on real contrast axes (compressed grotesque / humanist
sans / script), not two lookalike sans.

## Color tokens (dark, monochrome + one signal)

Canvas is true black; light "paper" islands carry the manuals. One accent (Signal Blue) for links
only. Defined in `:root` of `app/globals.css`; two alternate themes (`blueprint`, `terminal`) remap
the same tokens.

| Token | Value | Role |
|---|---|---|
| `--void` | `#000000` | Body canvas |
| `--whiteout` | `#ffffff` | Primary text / display |
| `--haze` | `#f5f5f5` | Light "paper" islands (manual body, primary buttons) |
| `--ink` | `#1b1b1b` | Text on haze |
| `--dim` | `rgba(255,255,255,.72)` | Body copy on dark — the default reading color |
| `--faint` | `rgba(255,255,255,.5)` | Meta / captions only (never long body) |
| `--twilight` | `#426188` | Step numbers / muted display accents |
| `--signal` | `#2b7fff` | Links and link-underlines ONLY — not a button fill |
| `--good/caution/danger` | green/amber/red | Status text + tinted full borders only |

Radii: input 4 · button 8 · card 12 · image 11 · pill 9999.
Buttons are ghost (transparent + 1px border) or haze-fill. **No colored/gradient CTAs, no shadows,
no gradients, no gradient text.** Body text uses `--dim` (≥4.5:1 on black); reserve `--faint` for
small meta.

## Icons

Real SVG or typographic marks only. No emoji as UI icons. Most "icons" here are deliberately absent —
the compressed type and hairlines carry the hierarchy.

## Motion

Hero fades up once (`herofade`); pipeline dots pulse while working; hovers are 0.2s border/bg swaps
on `--ease`. That's the whole budget — no fade-on-scroll per section. Every animation is inside the
global `prefers-reduced-motion: reduce` guard.

## Voice

Plain, direct, a little dry. "Stop searching. Start knowing." Short declaratives. No hype adjectives,
no exclamation stacking. Copy explains what the product *does*, then gets out of the way.

## Banned structural tells (the 2026-07-07 pass enforced these — keep them out)

These are about *grammar*, not looks. The look is fine; don't let the scaffolding creep back.

- **No uppercase tracked eyebrow/kicker above sections.** The old `.kicker` label over every
  section was removed. Sections lead with the Anton H2. Cadence comes from alternating **centered**
  display sections with **left-aligned** editorial ones (`.section.leftsec`), not from a repeated
  mini-label. One deliberate, named kicker could be voice someday — an eyebrow on all seven was AI.
- **No cursive-word-per-heading.** Caveat earns its one appearance in the hero. Section headings are
  plain Anton.
- **No identical card-grid stacks.** "Who it's for" is an editorial definition list (`.audience`,
  `dl/dt/dd`); "The library" is a hairline-ruled feature index (`.featindex`). The genuine
  3-step process (`.howgrid`) and the genuine 3-way comparison (`.compare`) keep their grids because
  they carry real structure. Don't convert every section back into repeated icon+heading+text cards.
- **No numbered section markers (01/02/03) as scaffolding.** The only numerals are the real
  1-2-3 steps in `.howgrid`, where order is information.
- **No side-stripe borders.** `.duebar`, `.banner.declined`, and `.err` use a full 1px tinted
  border + faint tint of the status hue — never a fat `border-left`.
- Shared bans still apply: gradient text, default glassmorphism, hero-metric template, colored/
  gradient default buttons, emoji-as-icons.

## Where things live

- `app/page.tsx` — home + the logged-out landing sections (the marketing surface).
- `app/globals.css` — the whole system (tokens, themes, components). Section styles under
  `/* landing sections */`.
- `app/library/page.tsx`, `app/m/[slug]/page.tsx` — library + public manual pages (same tokens).

Supabase auth, Stripe, and the API routes are load-bearing — design changes must stay CSS/markup-only.
