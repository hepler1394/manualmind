-- Seed manuals for the public library (run in Supabase SQL editor).
-- Owner: attaches to the first (oldest) account — you. Change the select if you want another owner.
-- Safe to re-run: skips slugs that already exist.

with owner as (
  select id from auth.users order by created_at asc limit 1
)
insert into public.manuals (user_id, title, type, body, meta, official_manual, public_slug, published_at)
select owner.id, m.title, m.type, m.body, m.meta::jsonb, m.official_manual, m.slug, now()
from owner,
(values

-- ============================================================
-- 1. How to Make Money With AI (2026)
-- ============================================================
(
  'How to Make Money With AI (2026)',
  'synthesized',
  $manual$A realistic, hype-free guide to earning your first income with AI tools — from first gig to steady side income.

## Overview

Real AI income comes from real work: freelancing, content, or building something people pay for. It typically takes 3–6 months of consistency, not a weekend. Anyone promising a shortcut is selling the shortcut, not the income. The good news: beginners applying AI to freelance services commonly reach **$500–$2,000/month within about 90 days**, and [freelancers who mention AI tools in their profiles earn 30–50% more per project](https://rightblogger.com/blog/make-money-ai) than those who don't.

## What You Need

- One AI assistant subscription (Claude, ChatGPT, or Gemini — free tiers work to start)
- A profile on one freelance platform (Upwork or Fiverr) **or** one client channel (LinkedIn, local businesses)
- 5–10 hours a week you will actually protect
- A portfolio of 2–3 sample pieces (make them yourself before you have clients)

## Step-by-Step

1. **Pick ONE lane.** The most consistent advice across every serious guide: [pick one method and stay consistent for 3–6 months](https://emergent.sh/learn/how-to-make-money-with-ai). Good starter lanes: AI-assisted copywriting, chatbot setup for small businesses, product descriptions for e-commerce stores, or résumé/LinkedIn rewrites.
2. **Specialize fast.** Generalist AI writing rates are being compressed; specialists hold or grow rates. A beginner generalist earns roughly $30–60/hour, while a [specialist in a regulated niche (healthcare, legal, finance) can command $150–400/hour](https://freeapihub.com/blog/how-to-make-money-with-ai) with a track record. Pick an industry you already know from a day job or hobby.
3. **Build 3 samples before your first client.** Use AI for the first draft, then edit heavily — the editing is the product. Publish them anywhere linkable.
4. **Price your first 3 gigs low, then raise.** The first gigs buy reviews, not rent. After three 5-star reviews, raise prices 30–50%.
5. **Use AI to deliver faster, not to deliver slop.** Clients now assume you use AI; [the differentiation is quality and domain knowledge](https://www.coursera.org/articles/how-to-make-money-using-ai). Always fact-check AI output before sending — one hallucinated claim can end a client relationship.
6. **Reinvest: turn services into products.** Once a service sells, package it: templates, a mini-course, a Notion kit, or a micro-SaaS. [Service income funds product income](https://www.shopify.com/blog/how-to-make-money-using-ai).

## Tips & Common Mistakes

- **Mistake:** starting five income streams at once. Pick one; add a second only after the first pays monthly.
- **Mistake:** selling "AI content" as the offer. Sell the outcome (more leads, faster support, better listings) — AI is just your tooling.
- **Tip:** track hours honestly for a month. If your effective rate isn't rising by month three, change niche, not effort.
- **Tip:** local businesses are underserved — a plumber doesn't browse Fiverr, but they'll pay for a chatbot that books jobs.

## Troubleshooting

- **No responses to proposals?** Your first line is about you; rewrite it to be about their problem. Attach a relevant sample.
- **Clients ghost after delivery?** Move to 50% upfront. This is standard and filters bad clients.
- **Rates stuck?** Add a niche credential (a short certificate or 3 niche case studies) and reposition.

## Sources

- [RightBlogger — Make Money With AI in 2026: 11 Real Ways That Work](https://rightblogger.com/blog/make-money-ai)
- [Emergent — How to Make Money with AI in 2026: 12 Proven Ideas](https://emergent.sh/learn/how-to-make-money-with-ai)
- [FreeAPIHub — How to Make Money With AI in 2026: 12 Realistic Ways](https://freeapihub.com/blog/how-to-make-money-with-ai)
- [Coursera — How to Make Money Using AI in 2026](https://www.coursera.org/articles/how-to-make-money-using-ai)
- [Shopify — How To Make Money With AI: 19 Ideas](https://www.shopify.com/blog/how-to-make-money-using-ai)$manual$,
  '{"product":"How to Make Money With AI (2026)","officialManual":"","type":"synthesized","confidence":"high"}',
  null,
  'how-to-make-money-with-ai-2026'
),

-- ============================================================
-- 2. Speed Up a Slow Windows 11 PC
-- ============================================================
(
  'Speed Up a Slow Windows 11 PC (DISM, SFC & Cleanup)',
  'community',
  $manual$The two commands technicians run first, plus the built-in cleanup that actually reclaims gigabytes — no third-party "optimizer" apps needed.

## Overview

Most Windows 11 slowdowns come from three things: corrupted system files, gigabytes of update leftovers, and too many startup apps. Windows ships supported tools for all three — [DISM, SFC, Disk Cleanup, and Storage Sense are Microsoft's documented maintenance methods](https://learn.microsoft.com/en-us/answers/questions/4266710/pc-is-very-slow-how-to-speed-up-pc). This takes 30–45 minutes, mostly unattended.

## What You Need

- Administrator access to the PC
- An internet connection (DISM downloads replacement files from Microsoft)
- 30–45 minutes (the scans run unattended)

## Step-by-Step

1. **Open an elevated terminal.** Right-click Start → **Terminal (Admin)** — or search "cmd", right-click, **Run as administrator**.
2. **Run DISM first.** It repairs the component store that SFC relies on, so [DISM comes before SFC](https://www.majorgeeks.com/content/page/windows_11_repair_playbook.html):

   ```
   DISM /Online /Cleanup-Image /RestoreHealth
   ```

   Expect 15–20 minutes. The progress bar often stalls around 62% — that's normal; let it finish.
3. **Then run SFC.** System File Checker scans every protected system file and [replaces corrupted ones from the repaired store](https://www.geeksdigit.com/run-sfc-scannow-windows-11/):

   ```
   sfc /scannow
   ```

   "Windows Resource Protection found corrupt files and successfully repaired them" is a good result. Reboot afterward.
4. **Deep-clean the disk.** Search **Disk Cleanup** → select C: → click **Clean up system files** → tick everything, especially *Windows Update Cleanup* (often [several gigabytes of old update files](https://windowsforum.com/threads/speed-up-windows-11-with-focused-cache-and-temp-file-cleanup.390500/)) → OK.
5. **Automate it.** Settings → System → Storage → turn on **Storage Sense** so temp files are cleaned on a schedule.
6. **Cut startup apps.** Ctrl+Shift+Esc → **Startup apps** tab → disable anything marked "High impact" you don't need at boot (keep antivirus and audio/GPU drivers).
7. **Reboot and test.** Cold boot twice — the first boot after repairs rebuilds caches and is not representative.

## Tips & Common Mistakes

- **Order matters:** DISM → SFC, not the reverse — SFC repairs *from* the store DISM just fixed.
- **Don't run "PC optimizer" apps.** They mostly re-run these free tools and add their own startup bloat.
- **Still slow with a hard drive?** No cleanup fixes an aging spinning disk; an SSD upgrade is the real cure.
- Add a maintenance reminder to re-run steps 2–4 every 3 months.

## Troubleshooting

- **DISM fails with error 0x800f081f:** it can't reach Windows Update. Check your connection, or point it at a mounted Windows ISO with the `/Source` switch.
- **SFC finds errors it can't fix:** run DISM again, reboot, then SFC again. Persisting after that suggests deeper corruption — consider **Reset this PC → Keep my files**.
- **Slow only after a recent update:** check Settings → Windows Update → Update history; a known-bad update can be uninstalled from there ([updates occasionally cause regressions](https://windows101tricks.com/windows-11-slow-after-update/)).

## Safety

These are Microsoft-supported, non-destructive tools — they don't touch personal files. Even so, back up important files before major repairs; that's good practice for any system maintenance.

## Sources

- [Microsoft Q&A — PC is very slow, how to speed up PC](https://learn.microsoft.com/en-us/answers/questions/4266710/pc-is-very-slow-how-to-speed-up-pc)
- [MajorGeeks — Windows 11 Repair Playbook: SFC, DISM, CHKDSK Without Breaking Stuff](https://www.majorgeeks.com/content/page/windows_11_repair_playbook.html)
- [Windows Forum — Speed Up Windows 11 with Focused Cache and Temp File Cleanup](https://windowsforum.com/threads/speed-up-windows-11-with-focused-cache-and-temp-file-cleanup.390500/)
- [GeeksDigit — How to Run SFC /Scannow in Windows 11](https://www.geeksdigit.com/run-sfc-scannow-windows-11/)$manual$,
  '{"product":"Speed Up a Slow Windows 11 PC","officialManual":"https://learn.microsoft.com/en-us/answers/questions/4266710/pc-is-very-slow-how-to-speed-up-pc","type":"community","confidence":"high"}',
  'https://learn.microsoft.com/en-us/answers/questions/4266710/pc-is-very-slow-how-to-speed-up-pc',
  'speed-up-slow-windows-11-pc'
),

-- ============================================================
-- 3. Free Up iPhone Storage
-- ============================================================
(
  'Free Up iPhone Storage Without Deleting Your Photos',
  'official',
  $manual$Reclaim gigabytes using Apple's built-in tools — optimized photos, offloaded apps, and Messages cleanup — without losing anything.

## Overview

"iPhone Storage Full" almost always comes from three places: full-resolution photos, apps you rarely open, and years of Messages attachments. Apple's own tools handle all three, and none of them delete your actual content. Time required: about 15 minutes, plus background syncing.

## What You Need

- Your iPhone (iOS 17 or later — steps are similar on earlier versions)
- An iCloud account (the free 5 GB tier works, but photo optimization benefits from iCloud+)
- Wi-Fi for the initial photo sync

## Step-by-Step

1. **See what's eating the space.** Settings → General → **iPhone Storage**. The color bar shows usage by category, and [Apple lists per-app usage with recommendations](https://support.apple.com/en-us/108429) right on this screen.
2. **Turn on Optimize iPhone Storage for photos.** Settings → Photos → select **Optimize iPhone Storage**. [Full-resolution photos and videos live in iCloud while space-saving copies stay on the device](https://support.apple.com/en-us/105061) — you keep every photo, at a fraction of the space. This is usually the single biggest win.
3. **Enable Offload Unused Apps.** Settings → Apps → App Store → turn on **Offload Unused Apps**. When storage runs low, [iOS removes the app itself but keeps your documents and data](https://support.apple.com/guide/iphone/manage-storage-on-iphone-iph47c931112/ios); the icon stays with a cloud symbol, and one tap reinstalls it exactly as it was.
4. **Clean Messages attachments.** Settings → General → iPhone Storage → **Messages** → Review Large Attachments. Years of videos and GIFs hide here; delete the big ones you don't need.
5. **Empty the photo trash.** Photos → Albums → **Recently Deleted** → Select → Delete All. Deleted photos otherwise hold their space for 30 days.
6. **Follow the built-in recommendations.** Back in iPhone Storage, Apple surfaces suggestions ("Review Personal Videos", "Auto Delete Old Conversations") — apply the ones that fit.
7. **Check iCloud too.** If iCloud itself is full, [delete duplicates and unused backups from iCloud storage](https://support.apple.com/en-us/108922): Settings → your name → iCloud → Manage Account Storage.

## Tips & Common Mistakes

- **Mistake:** deleting photos after turning on iCloud Photos — that deletes them from iCloud too. Optimize Storage already freed the space; don't delete.
- **Tip:** offloading is reversible and automatic — it's safe to leave on permanently.
- **Tip:** streaming apps (Spotify, Netflix, YouTube) hide downloads in their own settings; clear in-app downloads there.
- **Mistake:** buying a "cleaner" app. iOS sandboxing means they can't clean anything Settings can't.

## Troubleshooting

- **Storage bar shows huge "System Data":** restart the phone, then leave it plugged in on Wi-Fi overnight — iOS trims caches on its own schedule. Persistent multi-GB System Data usually clears after an iOS update.
- **"Optimize Storage" on but no space freed:** the sync isn't done. Plug in, stay on Wi-Fi, and check Photos → your profile icon → sync status.
- **Can't offload one specific app:** offload it manually — iPhone Storage → the app → **Offload App**.

## Sources

- [Apple Support — Manage your photo and video storage](https://support.apple.com/en-us/105061)
- [Apple Support — Manage storage on iPhone](https://support.apple.com/guide/iphone/manage-storage-on-iphone-iph47c931112/ios)
- [Apple Support — How to check the storage on your iPhone and iPad](https://support.apple.com/en-us/108429)
- [Apple Support — Manage your iCloud storage](https://support.apple.com/en-us/108922)$manual$,
  '{"product":"Free Up iPhone Storage","officialManual":"https://support.apple.com/guide/iphone/manage-storage-on-iphone-iph47c931112/ios","type":"official","confidence":"high"}',
  'https://support.apple.com/guide/iphone/manage-storage-on-iphone-iph47c931112/ios',
  'free-up-iphone-storage'
)

) as m(title, type, body, meta, official_manual, slug)
where not exists (select 1 from public.manuals where public_slug = m.slug);
