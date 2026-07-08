'use client';

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { createClient } from '@/lib/supabase/client';

marked.setOptions({ breaks: true, gfm: true });

type Meta = {
  product?: string;
  officialManual?: string;
  type?: string;
  confidence?: string;
  videos?: { id: string; title: string }[];
};

const THEMES = ['air', 'blueprint', 'terminal'] as const;
const THEME_LABEL: Record<string, string> = { air: 'Air', blueprint: 'Blueprint', terminal: 'Terminal' };
type Space = { id: string; name: string };
type Reminder = { id: string; manual_id: string | null; label: string; interval_days: number; next_due: string };
type LibItem = {
  id: string;
  title: string;
  type: string;
  body: string;
  meta: Meta | null;
  space_id?: string | null;
  public_slug?: string | null;
  verified?: boolean;
};
type ChatMsg = { role: 'user' | 'assistant'; content: string };
type Me = {
  signedIn: boolean;
  email?: string;
  plan?: string;
  usedThisMonth?: number;
  limit?: number | null;
  manuals?: any[];
  spaces?: Space[];
  reminders?: Reminder[];
};

const STAGES = [
  { key: 'identify', label: 'Reading upload' },
  { key: 'reddit', label: 'Scanning communities' },
  { key: 'youtube', label: 'Finding video walkthroughs' },
  { key: 'searching', label: 'Checking official docs & web' },
  { key: 'generate', label: 'Building manual' },
];

type Video = { id: string; title: string };
type Featured = { slug: string; title: string; type: string; published_at: string | null; verified?: boolean };

function typeLabel(type?: string | null): string {
  return type === 'official' ? 'Official'
    : type === 'community' ? 'Community'
    : type === 'declined' ? 'Declined'
    : 'AI-built';
}

const EXAMPLES = [
  'Reset a Nest thermostat to factory settings',
  'Samsung washer flashing error code 4C',
  'Replace the brake pads on a Trek mountain bike',
  'Mac and cheese in a Ninja Speedi',
  'Sourdough starter from scratch',
  'Install RetroArch on a Steam Deck',
];

const PLACEHOLDERS = [
  'What do you need a manual for?',
  'Try "LG dishwasher OE error"…',
  'Try "jailbreak an iPhone X"…',
  'Try "sharpen a chainsaw chain"…',
  'Try "best settings for a Ninja Speedi"…',
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is ManualMind free?',
    a: 'Yes. You get 3 manuals a day with no account, and 5 a month with a free account — plus the library, spaces, chat, and reminders. Pro is $20/month for unlimited manuals and quick-start cards.',
  },
  {
    q: 'Where do the answers come from?',
    a: 'The manufacturer’s official documentation first. Then real fixes from people who actually solved the problem — community forums, Reddit, Stack Exchange, repair wikis like iFixit, expert sites, and video tutorials. Every manual ends with its sources, linked.',
  },
  {
    q: 'Why is this better than Google or a chatbot?',
    a: 'A chatbot gives you an answer that scrolls away. ManualMind gives you a document: a finished, sourced manual you can download as a PDF, save to your profile, print, share as a link, and come back to — with reminders and follow-up chat attached. Search gives you ten tabs; this gives you the one page you actually needed.',
  },
  {
    q: 'Can I upload the manual I already have?',
    a: 'Yes — upload any PDF and ManualMind treats it as the authoritative source, then layers real-world tips and troubleshooting on top of it. Pro users can also pour in up to 3 source links per manual — docs pages, forum threads, spec sheets — and the manual is built from those first.',
  },
  {
    q: 'What does "Complete manual" do?',
    a: 'It publishes your finished manual to the public library as its own web page. It becomes searchable here and indexable by Google, so the next person with your exact problem gets the answer instantly.',
  },
  {
    q: 'Can I trust it for safety-critical repairs?',
    a: 'Treat it like an expert friend, not a licensed technician. Every step is sourced so you can verify against the official manual — and for gas, mains electrical, or structural work, hire a professional.',
  },
  {
    q: 'Does it work on my phone?',
    a: 'Yes. The site installs as an app on iPhone and Android — open it in your browser and choose "Add to Home Screen."',
  },
  {
    q: 'How do the video walkthroughs work?',
    a: 'For every manual, ManualMind finds real tutorial videos for the same task — because some steps are just easier to watch. Free plans get the single best video with each manual; Pro unlocks the full set of walkthroughs, and the AI references the most relevant one inline.',
  },
  {
    q: 'Will it write a manual for anything?',
    a: 'Almost. It refuses anything dangerous or illegal — weapons, breaking into things you don’t own, defeating security, anything meant to harm someone. Fixing, building, cooking, configuring, and maintaining the things in your life: all fair game.',
  },
  {
    q: 'Can I unpublish a manual?',
    a: 'Any time. Your manuals are private by default — publishing is a deliberate click, and Unpublish takes the page down immediately. Nothing is published without you choosing it.',
  },
];

const HISTORY_KEY = 'mm_history_v1';
const RECENT_KEY = 'mm_recent_v1';
const SPACE_KEY = 'mm_space_v1';
const hasAuth =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function splitMeta(raw: string): { meta: Meta | null; body: string; metaClosed: boolean } {
  const fence = '```meta';
  const start = raw.indexOf(fence);
  if (start < 0) {
    const looksLikeFenceComing = raw.trimStart().startsWith('`');
    return { meta: null, body: looksLikeFenceComing ? '' : raw, metaClosed: false };
  }
  const afterTag = start + fence.length;
  const end = raw.indexOf('```', afterTag);
  if (end < 0) return { meta: null, body: '', metaClosed: false };
  let meta: Meta | null = null;
  try {
    meta = JSON.parse(raw.slice(afterTag, end).trim());
  } catch {
    meta = null;
  }
  return { meta, body: raw.slice(end + 3).replace(/^\s+/, ''), metaClosed: true };
}

function encodeShare(meta: Meta | null, body: string): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify({ m: meta, b: body }))));
}
function decodeShare(s: string): { meta: Meta | null; body: string } | null {
  try {
    const parsed = JSON.parse(decodeURIComponent(escape(atob(s))));
    return { meta: parsed.m || null, body: parsed.b || '' };
  } catch {
    return null;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function cardHtml(title: string, inner: string): string {
  const safe = title.replace(/</g, '&lt;');
  return (
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' +
    safe +
    ' — Quick-start card</title><style>' +
    'body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:720px;margin:24px auto;padding:0 20px;color:#111;}' +
    'h1{font-size:22px;margin:0 0 4px;}h2{font-size:16px;margin:18px 0 6px;}' +
    '.head{border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:baseline;gap:10px;}' +
    '.brand{font-size:12px;color:#666;white-space:nowrap;}ol,ul{padding-left:20px;}li{margin:4px 0;line-height:1.45;}' +
    '.btn{margin:18px 0;padding:10px 16px;border:1px solid #111;background:#111;color:#fff;border-radius:8px;cursor:pointer;font-size:14px;}' +
    '@media print{.btn{display:none;}body{margin:0;}}' +
    '</style></head><body><div class="head"><h1>' +
    safe +
    '</h1><span class="brand">ManualMind quick-start</span></div>' +
    inner +
    '<button class="btn" onclick="window.print()">Print / Save as PDF</button></body></html>'
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [libHits, setLibHits] = useState<{ slug: string; title: string; type: string | null }[]>([]);
  const [raw, setRaw] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [doneStages, setDoneStages] = useState<Set<string>>(new Set());
  const [identified, setIdentified] = useState<string | null>(null);
  const [redditCount, setRedditCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<LibItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [me, setMe] = useState<Me>({ signedIn: false });
  const [activeSpace, setActiveSpace] = useState<string | null>(null);
  const [targetSpace, setTargetSpace] = useState<string>('');
  const [currentManualId, setCurrentManualId] = useState<string | null>(null);
  const [currentTitle, setCurrentTitle] = useState<string>('');
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatRunning, setChatRunning] = useState(false);
  const [remLabel, setRemLabel] = useState('');
  const [remInterval, setRemInterval] = useState('90');
  const [busyCard, setBusyCard] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [phIdx, setPhIdx] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const [libSearched, setLibSearched] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busyPublish, setBusyPublish] = useState(false);
  const [buildSeconds, setBuildSeconds] = useState<number | null>(null);
  const [featured, setFeatured] = useState<Featured[]>([]);
  const [busySave, setBusySave] = useState(false);
  const [theme, setTheme] = useState<string>('air');
  const [showTop, setShowTop] = useState(false);
  const [playing, setPlaying] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [busyEdit, setBusyEdit] = useState(false);
  const [sourceUrls, setSourceUrls] = useState<string[]>([]);
  const [sourceInput, setSourceInput] = useState('');

  function addSource() {
    const u = sourceInput.trim();
    if (!/^https?:\/\/.+\..+/.test(u)) {
      flash('Enter a full link, like https://…');
      return;
    }
    if (sourceUrls.length >= 3 || sourceUrls.includes(u)) return;
    setSourceUrls([...sourceUrls, u]);
    setSourceInput('');
  }
  const searchAbort = useRef<AbortController | null>(null);
  const msgsRef = useRef<HTMLDivElement>(null);
  const [supabase] = useState(() => (hasAuth ? createClient() : null));

  // Rotate the search placeholder while the field is empty.
  useEffect(() => {
    const t = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 3500);
    return () => clearInterval(t);
  }, []);

  // Theme: restore from storage; cycleTheme writes the attribute + storage.
  useEffect(() => {
    try {
      const t = localStorage.getItem('mm_theme');
      if (t && THEMES.includes(t as any)) setTheme(t);
    } catch {}
  }, []);
  function cycleTheme() {
    const next = THEMES[(THEMES.indexOf(theme as any) + 1) % THEMES.length];
    setTheme(next);
    try { localStorage.setItem('mm_theme', next); } catch {}
    if (next === 'air') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', next);
    flash('Theme: ' + THEME_LABEL[next]);
  }

  // Scroll-to-top button visibility.
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 600);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Focus search on load (desktop only — avoids popping the mobile keyboard).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth > 760) searchRef.current?.focus();
  }, []);

  // Press "/" anywhere to jump to search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || (el as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { meta, body, metaClosed } = splitMeta(raw);
  const spaces: Space[] = me.spaces || [];
  const reminders: Reminder[] = me.reminders || [];

  async function loadMe() {
    if (!hasAuth) return;
    try {
      const res = await fetch('/api/me');
      setMe(await res.json());
    } catch {}
  }

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
      const rec = localStorage.getItem(RECENT_KEY);
      if (rec) setRecent(JSON.parse(rec));
      const sp = localStorage.getItem(SPACE_KEY);
      if (sp) setTargetSpace(sp);
    } catch {}
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#m=')) {
      const decoded = decodeShare(window.location.hash.slice(3));
      if (decoded) {
        setRaw('```meta\n' + JSON.stringify(decoded.meta || {}) + '\n```\n\n' + decoded.body);
        setDoneStages(new Set(['identify', 'reddit', 'searching', 'generate']));
      }
    }
    loadMe();
    if (hasAuth) {
      fetch('/api/featured')
        .then((r) => r.json())
        .then((d) => setFeatured(d.manuals || []))
        .catch(() => {});
    }
    if (typeof window !== 'undefined' && window.location.search.includes('upgraded=1')) {
      flash('Welcome to Pro! Unlimited manuals unlocked.');
      window.history.replaceState(null, '', '/');
    }
    // Support /?q=… deep links (search engines' sitelinks box, shared searches).
    if (typeof window !== 'undefined') {
      const qp = new URLSearchParams(window.location.search).get('q');
      if (qp) {
        setQuery(qp.slice(0, 500));
        window.history.replaceState(null, '', '/');
        setTimeout(() => searchRef.current?.focus(), 200);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  const dbManuals: LibItem[] = (me.manuals || []).map((m: any) => ({
    id: m.id,
    title: m.title,
    type: m.type || 'synthesized',
    body: m.body,
    meta: m.meta || (m.official_manual ? { officialManual: m.official_manual, type: m.type } : null),
    space_id: m.space_id || null,
    public_slug: m.public_slug || null,
    verified: !!m.verified,
  }));
  const allLibrary: LibItem[] = me.signedIn ? dbManuals : history;
  const library: LibItem[] =
    me.signedIn && activeSpace ? allLibrary.filter((m) => m.space_id === activeSpace) : allLibrary;

  const today = todayISO();
  const dueReminders = reminders.filter((r) => r.next_due <= today);
  const currentReminders = reminders.filter((r) => currentManualId && r.manual_id === currentManualId);

  function persistLocal(next: LibItem[]) {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 30)));
    } catch {}
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 3.5 * 1024 * 1024) {
      flash('File too large — keep it under 3.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImage(reader.result as string);
      setFileName(f.type === 'application/pdf' ? f.name : null);
    };
    reader.readAsDataURL(f);
  }

  // Live search of the public manual library while typing.
  useEffect(() => {
    const q = query.trim();
    if (!hasAuth || q.length < 3 || running) {
      setLibHits([]);
      setLibSearched(false);
      return;
    }
    const t = setTimeout(async () => {
      searchAbort.current?.abort();
      const controller = new AbortController();
      searchAbort.current = controller;
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q), { signal: controller.signal });
        const data = await res.json();
        setLibHits(data.results || []);
        setLibSearched(true);
      } catch {
        if (!controller.signal.aborted) {
          setLibHits([]);
          setLibSearched(false);
        }
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, running]);

  // Warn before closing the tab mid-generation.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [running]);

  // The browser tab (and any saved PDF) takes the manual's name while viewing it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (currentTitle && body) document.title = currentTitle + ' — ManualMind';
    else document.title = 'ManualMind — the manual for anything';
  }, [currentTitle, body]);

  // Keep the follow-up chat scrolled to the newest message.
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chat]);

  function rememberSearch(text: string) {
    if (!text) return;
    setRecent((prev) => {
      const next = [text, ...prev.filter((r) => r !== text)].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function clearRecent() {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch {}
  }

  function saveLocal(finalRaw: string) {
    const parsed = splitMeta(finalRaw);
    if (!parsed.body) return;
    const item: LibItem = {
      id: Date.now().toString(36),
      title: (parsed.meta && parsed.meta.product) || identified || query || 'Manual',
      type: (parsed.meta && parsed.meta.type) || 'synthesized',
      body: parsed.body,
      // Keep the found videos with the manual so they come back when it's reopened.
      meta: { ...(parsed.meta || {}), videos: videos.slice(0, 4) },
    };
    persistLocal([item, ...history].slice(0, 30));
  }

  async function loadItem(item: LibItem) {
    setError(null);
    setLimitHit(false);
    setRunning(false);
    setIdentified(null);
    setRedditCount(null);
    setVideos(item.meta?.videos || []);
    setPlaying(new Set());
    setEditing(false);
    setRaw('```meta\n' + JSON.stringify(item.meta || {}) + '\n```\n\n' + item.body);
    setDoneStages(new Set(['identify', 'reddit', 'youtube', 'searching', 'generate']));
    setCurrentManualId(item.id);
    setCurrentTitle(item.title);
    setChat([]);
    if (me.signedIn) {
      try {
        const res = await fetch('/api/chat?manualId=' + encodeURIComponent(item.id));
        const data = await res.json();
        setChat((data.messages || []).map((m: any) => ({ role: m.role, content: m.content })));
      } catch {}
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openManualById(id: string | null) {
    if (!id) return;
    const item = dbManuals.find((m) => m.id === id);
    if (item) loadItem(item);
  }

  async function deleteItem(item: LibItem) {
    if (me.signedIn) {
      await fetch('/api/manuals?id=' + encodeURIComponent(item.id), { method: 'DELETE' });
      loadMe();
    } else {
      persistLocal(history.filter((h) => h.id !== item.id));
    }
  }

  async function assignSpace(item: LibItem, space_id: string) {
    await fetch('/api/manuals', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, space_id: space_id || null }),
    });
    loadMe();
  }

  async function createSpace() {
    const raw = typeof window !== 'undefined' ? window.prompt('Name your space (e.g. "My Home", "Unit 4B", "The Shop")') : '';
    const name = (raw || '').trim().slice(0, 40);
    if (!name) return;
    const res = await fetch('/api/spaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (data.space) {
      flash('Space created');
      await loadMe();
      setActiveSpace(data.space.id);
    } else {
      flash(data.error || 'Could not create space');
    }
  }

  async function deleteSpace(id: string) {
    if (typeof window !== 'undefined' && !window.confirm('Delete this space? Its manuals stay in your library.')) return;
    await fetch('/api/spaces?id=' + encodeURIComponent(id), { method: 'DELETE' });
    if (activeSpace === id) setActiveSpace(null);
    loadMe();
  }

  function copyManual() {
    if (!body) return;
    navigator.clipboard.writeText(body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  function newManual() {
    setRaw('');
    setError(null);
    setLimitHit(false);
    setIdentified(null);
    setRedditCount(null);
    setVideos([]);
    setPlaying(new Set());
    setEditing(false);
    setSourceUrls([]);
    setSourceInput('');
    setCurrentManualId(null);
    setCurrentTitle('');
    setChat([]);
    setQuery('');
    setImage(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => searchRef.current?.focus(), 300);
  }
  function shareManual() {
    if (!body) return;
    // Published manuals share their clean public URL; otherwise fall back to a hash link.
    const currentSlug = currentManualId
      ? dbManuals.find((m) => m.id === currentManualId)?.public_slug
      : null;
    if (currentSlug) {
      navigator.clipboard
        .writeText(window.location.origin + '/m/' + currentSlug)
        .then(() => flash('Public link copied'));
      return;
    }
    const code = encodeShare(meta, body);
    const url = window.location.origin + window.location.pathname + '#m=' + code;
    navigator.clipboard.writeText(url).then(() => flash('Shareable link copied'));
    try {
      window.history.replaceState(null, '', '#m=' + code);
    } catch {}
  }

  function stopGeneration() {
    abortRef.current?.abort();
    flash('Stopped');
  }
  function savePdf() {
    window.print();
  }

  async function makeCard() {
    if (!body) return;
    if (hasAuth && me.signedIn && me.plan !== 'pro') {
      flash('Quick-start cards are a Pro feature. Upgrade to unlock.');
      return;
    }
    setBusyCard(true);
    flash('Building your quick-start card…');
    try {
      const res = await fetch('/api/card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTitle: currentTitle, manualBody: body }),
      });
      const data = await res.json();
      if (!data.card) {
        flash(data.error || 'Could not build card.');
        return;
      }
      const html = cardHtml(data.title || currentTitle, marked.parse(data.card) as string);
      const w = window.open('', '_blank');
      if (w) {
        w.document.write(html);
        w.document.close();
      } else {
        flash('Allow pop-ups to view the card.');
      }
    } catch {
      flash('Could not build card.');
    } finally {
      setBusyCard(false);
    }
  }

  // Save a manual you're viewing (shared link, example, or device-local) to your cloud profile.
  async function saveToProfile() {
    if (!body || busySave) return;
    if (!me.signedIn) {
      window.location.href = '/login';
      return;
    }
    setBusySave(true);
    try {
      const res = await fetch('/api/manuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: currentTitle || (meta && meta.product) || 'Manual',
          body,
          meta: { ...(meta || {}), videos: videos.slice(0, 4) },
          type: (meta && meta.type) || 'synthesized',
        }),
      });
      const data = await res.json();
      if (data.id) {
        setCurrentManualId(data.id);
        flash('Saved to your profile');
        loadMe();
      } else {
        flash(data.error || 'Could not save.');
      }
    } catch {
      flash('Could not save.');
    } finally {
      setBusySave(false);
    }
  }

  const [busyVerify, setBusyVerify] = useState(false);
  async function verifyManual() {
    if (!currentManualId || busyVerify) return;
    setBusyVerify(true);
    flash('Running verification checks…');
    try {
      const res = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentManualId }),
      });
      const data = await res.json();
      if (data.verified) {
        flash('Verified — badge restored');
        loadMe();
      } else {
        flash(data.reason ? 'Not verified: ' + data.reason : data.error || 'Verification failed.');
      }
    } catch {
      flash('Verification failed.');
    } finally {
      setBusyVerify(false);
    }
  }

  function startEdit() {
    if (!body) return;
    setEditText(body);
    setEditing(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function saveEdit() {
    const text = editText.trim();
    if (!currentManualId || text.length < 20 || busyEdit) return;
    setBusyEdit(true);
    try {
      const res = await fetch('/api/manuals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentManualId, body: text }),
      });
      const data = await res.json();
      if (data.ok) {
        setRaw('```meta\n' + JSON.stringify(meta || {}) + '\n```\n\n' + text);
        setEditing(false);
        flash('Manual updated');
        loadMe();
      } else {
        flash(data.error || 'Could not save edits.');
      }
    } catch {
      flash('Could not save edits.');
    } finally {
      setBusyEdit(false);
    }
  }

  async function publishManual() {
    if (!currentManualId || busyPublish) return;
    setBusyPublish(true);
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentManualId }),
      });
      const data = await res.json();
      if (!data.slug) {
        flash(data.error || 'Could not publish.');
        return;
      }
      const url = window.location.origin + '/m/' + data.slug;
      try {
        await navigator.clipboard.writeText(url);
        flash('Published — public link copied');
      } catch {
        flash('Published at ' + url);
      }
      loadMe();
    } catch {
      flash('Could not publish.');
    } finally {
      setBusyPublish(false);
    }
  }

  function copyPublicLink(slug: string) {
    const url = window.location.origin + '/m/' + slug;
    navigator.clipboard.writeText(url).then(() => flash('Public link copied'));
  }

  async function unpublishManual() {
    if (!currentManualId) return;
    await fetch('/api/publish?id=' + encodeURIComponent(currentManualId), { method: 'DELETE' });
    flash('Manual is private again');
    loadMe();
  }

  async function upgrade() {
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else flash(data.error || 'Could not start checkout.');
    } catch {
      flash('Could not start checkout.');
    }
  }
  async function manageBilling() {
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else flash(data.error || 'Could not open billing.');
    } catch {
      flash('Could not open billing.');
    }
  }
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setMe({ signedIn: false });
    flash('Signed out');
  }

  async function addReminder(label: string, interval: number) {
    if (!label.trim() || !currentManualId) return;
    if (currentReminders.some((r) => r.label.toLowerCase() === label.trim().toLowerCase())) {
      flash('That reminder already exists for this manual.');
      return;
    }
    await fetch('/api/reminders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manual_id: currentManualId, label, interval_days: interval }),
    });
    setRemLabel('');
    loadMe();
  }
  async function reminderDone(id: string) {
    await fetch('/api/reminders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    flash('Nice — rescheduled for next time');
    loadMe();
  }
  async function reminderDelete(id: string) {
    await fetch('/api/reminders?id=' + encodeURIComponent(id), { method: 'DELETE' });
    loadMe();
  }
  async function suggestReminders() {
    if (!currentManualId || !body) return;
    flash('Thinking of maintenance tasks…');
    try {
      const res = await fetch('/api/reminders/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTitle: currentTitle, manualBody: body }),
      });
      const data = await res.json();
      const suggestions = data.suggestions || [];
      if (suggestions.length === 0) {
        flash('No suggestions found.');
        return;
      }
      for (const s of suggestions) {
        await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ manual_id: currentManualId, label: s.label, interval_days: s.interval_days }),
        });
      }
      flash('Added ' + suggestions.length + ' maintenance reminders');
      loadMe();
    } catch {
      flash('Could not suggest reminders.');
    }
  }

  async function run(q?: string) {
    const text = (q !== undefined ? q : query).trim().slice(0, 500);
    if (!text && !image) return;
    if (q !== undefined) setQuery(q);
    setLastRun(text);
    rememberSearch(text);
    setBuildSeconds(null);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
    setRaw('');
    setError(null);
    setLimitHit(false);
    setIdentified(null);
    setRedditCount(null);
    setVideos([]);
    setPlaying(new Set());
    setEditing(false);
    setLibHits([]);
    setDoneStages(new Set());
    setActive(image ? 'identify' : 'reddit');
    setRunning(true);
    setCurrentManualId(null);
    setChat([]);
    setCurrentTitle(text || 'Manual');

    let finalRaw = '';
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await fetch('/api/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          image,
          spaceId: me.signedIn ? targetSpace || null : null,
          sources: isPro ? sourceUrls : [],
        }),
        signal: controller.signal,
      });
      if (!res.body) throw new Error('No response stream.');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      const markDone = (k: string) =>
        setDoneStages((prev) => {
          const n = new Set(prev);
          n.add(k);
          return n;
        });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let evt: any;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          switch (evt.stage) {
            case 'identify': setActive('identify'); break;
            case 'identified':
              setIdentified(evt.product); setCurrentTitle(evt.product || 'Manual');
              markDone('identify'); setActive('reddit'); break;
            case 'reddit': setActive('reddit'); break;
            case 'reddit_done':
              setRedditCount(evt.count); markDone('reddit'); setActive('youtube'); break;
            case 'youtube_done':
              setVideos(evt.videos || []); markDone('youtube'); setActive('searching'); break;
            case 'searching': setActive('searching'); break;
            case 'generate': markDone('searching'); setActive('generate'); break;
            case 'token':
              finalRaw += evt.text || '';
              setRaw((r) => r + (evt.text || ''));
              break;
            case 'saved': setCurrentManualId(evt.id); break;
            case 'done':
              markDone('generate'); setActive(null);
              if (evt.seconds) { setBuildSeconds(evt.seconds); flash('Built in ' + evt.seconds + 's'); }
              break;
            case 'limit':
              setError(evt.message); setLimitHit(true); setActive(null); break;
            case 'error':
              setError(evt.message || 'Something went wrong.'); setActive(null); break;
          }
        }
      }
      if (finalRaw) {
        const parsed = splitMeta(finalRaw);
        if (parsed.meta && parsed.meta.product) setCurrentTitle(parsed.meta.product);
        if (me.signedIn) loadMe();
        else saveLocal(finalRaw);
      }
    } catch (e: any) {
      if (e && e.name === 'AbortError') {
        // user hit Stop — keep whatever streamed so far, no error banner
      } else {
        setError(e && e.message ? e.message : 'Request failed.');
      }
    } finally {
      abortRef.current = null;
      setRunning(false);
      setActive(null);
    }
  }

  async function sendChat() {
    const q = chatInput.trim();
    if (!q || chatRunning) return;
    const nextMsgs: ChatMsg[] = [...chat, { role: 'user', content: q }];
    setChat(nextMsgs);
    setChatInput('');
    setChatRunning(true);
    setChat((c) => [...c, { role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manualId: currentManualId,
          manualTitle: currentTitle,
          manualBody: body,
          messages: nextMsgs,
        }),
      });
      if (!res.body) throw new Error('No stream');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop() || '';
        for (const part of parts) {
          const line = part.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;
          let evt: any;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.stage === 'token') {
            setChat((c) => {
              const copy = c.slice();
              copy[copy.length - 1] = {
                role: 'assistant',
                content: copy[copy.length - 1].content + (evt.text || ''),
              };
              return copy;
            });
          } else if (evt.stage === 'error') {
            setChat((c) => {
              const copy = c.slice();
              copy[copy.length - 1] = { role: 'assistant', content: 'Error: ' + (evt.message || '') };
              return copy;
            });
          }
        }
      }
    } catch (e: any) {
      flash('Chat failed.');
    } finally {
      setChatRunning(false);
    }
  }

  const bannerClass = meta && meta.type ? meta.type : 'synthesized';
  const bannerTitle =
    meta?.type === 'official' ? 'Official manual found'
      : meta?.type === 'community' ? 'Built from community knowledge'
      : meta?.type === 'declined' ? 'ManualMind won’t build this one'
      : 'Manual synthesized for you';
  const showResult = body && metaClosed;
  const isPro = me.plan === 'pro';
  const spaceName = (id?: string | null) => spaces.find((s) => s.id === id)?.name;
  const manualTitleById = (id: string | null) => dbManuals.find((m) => m.id === id)?.title || 'a manual';
  const currentDbManual = currentManualId ? dbManuals.find((m) => m.id === currentManualId) : undefined;
  const publicSlug = currentDbManual?.public_slug || null;
  const bodyWords = body ? body.split(/\s+/).filter(Boolean).length : 0;
  const readMinutes = Math.max(1, Math.round(bodyWords / 220));
  const sourceCount = body ? (body.match(/\]\(https?:\/\//g) || []).length : 0;
  const showRecent = searchFocused && !query.trim() && recent.length > 0 && idleSafe();
  function idleSafe() { return !raw && !running && !error; }

  const idle = !raw && !running && !error;

  return (
    <div className="wrap">
      <div className="nav no-print">
        <a className="wordmark" href="/">ManualMind</a>
        <div className="topbar">
          <button className="tb navlink" onClick={cycleTheme} title="Switch theme (Air / Blueprint / Terminal)">
            {THEME_LABEL[theme] || 'Air'}
          </button>
          {hasAuth && (
            <>
              <a className="tb navlink" href="/library">Library</a>
              {showResult && !running && (
                <button className="tb" onClick={newManual}>New manual</button>
              )}
              {me.signedIn ? (
                <>
                  <span className={'plan ' + (isPro ? 'pro' : '')}>{isPro ? 'PRO' : 'FREE'}</span>
                  {!isPro && me.limit != null && (
                    <span className="usage">{(me.usedThisMonth || 0)} / {me.limit} this month</span>
                  )}
                  <span className="email">{me.email}</span>
                  {isPro ? (
                    <button className="tb" onClick={manageBilling}>Manage</button>
                  ) : (
                    <button className="tb up" onClick={upgrade}>Upgrade $20/mo</button>
                  )}
                  <button className="tb" onClick={signOut}>Sign out</button>
                </>
              ) : (
                <a className="tb" href="/login">Sign in</a>
              )}
            </>
          )}
        </div>
      </div>

      <div className="hero herofade no-print">
        <h1>The manual for <span className="cursive">anything</span>.</h1>
        <p className="tagline">
          A product, a problem, an error code — or a photo, or a PDF. ManualMind checks the official
          docs, the communities that actually fixed it, and the right video walkthroughs — then hands
          you a finished, downloadable manual. When none exists, it writes you a better one.
        </p>
      </div>

      <div className="panel no-print">
        <div className="searchrow">
          <div className="searchbox">
            <input
              ref={searchRef}
              type="text"
              placeholder={PLACEHOLDERS[phIdx]}
              value={query}
              enterKeyHint="search"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={500}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !running) run();
                if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
              }}
            />
            {query && (
              <button className="clearq" aria-label="clear search" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
                ×
              </button>
            )}
          </div>
          <button className="go" disabled={running || (!query.trim() && !image)} onClick={() => run()}>
            {running ? 'Working…' : 'Get manual'}
          </button>
        </div>
        {showRecent && (
          <div className="recent">
            <div className="lr-head">Recent searches</div>
            {recent.map((r) => (
              <button key={r} className="lr-item" onMouseDown={(e) => { e.preventDefault(); run(r); }}>
                <span className="lr-title">{r}</span>
              </button>
            ))}
            <button className="lr-item lr-clear" onMouseDown={(e) => { e.preventDefault(); clearRecent(); }}>
              <span className="lr-sub">Clear recent searches</span>
            </button>
          </div>
        )}
        <div className="tools">
          <label className="upload">
            Upload a photo or PDF
            <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={onFile} />
          </label>
          {image && (fileName ? (
            <span className="filechip">{fileName}</span>
          ) : (
            <img className="thumb" src={image} alt="upload preview" />
          ))}
          {image && (
            <button className="clearimg" onClick={() => { setImage(null); setFileName(null); if (fileRef.current) fileRef.current.value = ''; }}>
              remove
            </button>
          )}
          {me.signedIn && spaces.length > 0 && (
            <select
              className="spacesel"
              value={targetSpace}
              onChange={(e) => {
                setTargetSpace(e.target.value);
                try { localStorage.setItem(SPACE_KEY, e.target.value); } catch {}
              }}
            >
              <option value="">Save to: no space</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>Save to: {s.name}</option>
              ))}
            </select>
          )}
        </div>
        {hasAuth && (
          isPro ? (
            <div className="srcrow">
              <div className="srcadd">
                <input
                  type="text"
                  placeholder="Add a source link the manual must use (docs page, forum thread…)"
                  value={sourceInput}
                  maxLength={2000}
                  onChange={(e) => setSourceInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSource(); } }}
                />
                <button className="tb" onClick={addSource} disabled={sourceUrls.length >= 3}>
                  Add source
                </button>
              </div>
              {sourceUrls.length > 0 && (
                <div className="srcchips">
                  {sourceUrls.map((u) => (
                    <span key={u} className="srcchip">
                      <span className="srcurl">{u.replace(/^https?:\/\/(www\.)?/, '').slice(0, 48)}</span>
                      <button onClick={() => setSourceUrls(sourceUrls.filter((x) => x !== u))} aria-label="remove source">×</button>
                    </span>
                  ))}
                  <span className="srcnote">{sourceUrls.length}/3 sources — treated as authoritative</span>
                </div>
              )}
            </div>
          ) : (
            <div className="srcrow locked">
              <span className="probadge">Pro</span> Pour in your own sources — links your manual must be built from.
              {me.signedIn ? (
                <button className="srclink" onClick={upgrade}>Upgrade</button>
              ) : (
                <a className="srclink" href="/login">Sign in</a>
              )}
            </div>
          )
        )}
        {idle && (
          <div className="panelfoot no-print">
            <span>Free · No sign-up needed · Sources cited</span>
            <span className="kbdhint">Press / to search</span>
            <a href="/library">Browse the library</a>
          </div>
        )}
      </div>

      {idle && libSearched && query.trim().length >= 3 && (
        <div className="libresults no-print">
          <div className="lr-head">From the manual library</div>
          {libHits.length === 0 ? (
            <div className="lr-item lr-empty">
              <div className="lr-sub">No completed manual for this yet — press Get manual and be the first.</div>
            </div>
          ) : (
            libHits.map((h) => {
              const q = query.trim();
              const i = h.title.toLowerCase().indexOf(q.toLowerCase());
              return (
                <a key={h.slug} className="lr-item" href={'/m/' + h.slug}>
                  <div className="lr-title">
                    {i >= 0 ? (
                      <>
                        {h.title.slice(0, i)}
                        <mark>{h.title.slice(i, i + q.length)}</mark>
                        {h.title.slice(i + q.length)}
                      </>
                    ) : (
                      h.title
                    )}
                  </div>
                  <div className="lr-sub">{typeLabel(h.type)} manual · ready now</div>
                </a>
              );
            })
          )}
        </div>
      )}

      {me.signedIn && dueReminders.length > 0 && (
        <div className="duebar no-print">
          <h2>Maintenance due</h2>
          {dueReminders.map((r) => (
            <div key={r.id} className="duebar-item">
              <button onClick={() => openManualById(r.manual_id)}>
                {r.label} — <span style={{ opacity: 0.7 }}>{manualTitleById(r.manual_id)}</span>
              </button>
              <button className="rem-btn" onClick={() => reminderDone(r.id)}>Done</button>
            </div>
          ))}
        </div>
      )}

      {!raw && !running && !error && (
        <div className="chips no-print">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => run(ex)}>{ex}</button>
          ))}
        </div>
      )}

      {(running || raw || error) && (
        <div className="stages no-print">
          {STAGES.map((s) => {
            const isDone = doneStages.has(s.key);
            const isActive = active === s.key;
            return (
              <span key={s.key} className={'stage' + (isActive ? ' active' : '') + (isDone ? ' done' : '')}>
                <span className="dot" />
                {s.label}
                {s.key === 'reddit' && redditCount !== null ? ' (' + redditCount + ')' : ''}
              </span>
            );
          })}
        </div>
      )}

      {running && (
        <div className="stoprow no-print">
          <button className="tb" onClick={stopGeneration}>Stop</button>
        </div>
      )}

      {running && !body && <div className="preparing no-print">Preparing your manual</div>}

      {identified && (
        <div className="banner community no-print" style={{ marginTop: 14 }}>
          <span className="tag">Identified</span>
          <div><h3>From your upload</h3><p>{identified}</p></div>
        </div>
      )}

      {error && (
        <div className="err no-print">
          <div>{error}</div>
          {!limitHit && lastRun && (
            <div className="limitcta">
              <button className="tb" onClick={() => run(lastRun)}>Try again</button>
            </div>
          )}
          {limitHit && (
            <div className="limitcta">
              {me.signedIn ? (
                <button className="tb up" onClick={upgrade}>Upgrade to Pro — $20/mo</button>
              ) : (
                <>
                  <a className="tb" href="/login">Sign in (free)</a>
                  {hasAuth && <button className="tb up" onClick={upgrade}>Get Pro</button>}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {meta && metaClosed && (
        <div className={'banner ' + bannerClass}>
          <span className="tag">{typeLabel(meta?.type)}</span>
          <div>
            <h3>
              {bannerTitle}
              {meta.confidence ? ' · ' + meta.confidence + ' confidence' : ''}
              {sourceCount > 0 && !running ? ' · ' + sourceCount + ' sources cited' : ''}
            </h3>
            {meta.officialManual ? (
              <p>Official source: <a href={meta.officialManual} target="_blank" rel="noreferrer">{meta.officialManual}</a></p>
            ) : meta?.type === 'declined' ? (
              <p>ManualMind only builds manuals for safe, legitimate tasks. Details below.</p>
            ) : (
              <p>No official manual was found online, so ManualMind assembled this from the best available sources.</p>
            )}
          </div>
        </div>
      )}

      {showResult && !running && (
        <div className="actions no-print">
          {!currentDbManual && meta?.type !== 'declined' && (
            <button className="primary" disabled={busySave} onClick={saveToProfile} title="Save this manual to your profile library">
              {busySave ? 'Saving…' : me.signedIn ? 'Save to profile' : 'Sign in to save'}
            </button>
          )}
          {me.signedIn && currentDbManual && (
            publicSlug ? (
              <>
                <button className="primary" onClick={() => copyPublicLink(publicSlug)}>Copy public link</button>
                <button onClick={unpublishManual}>Unpublish</button>
              </>
            ) : (
              <button
                className="primary"
                disabled={busyPublish}
                onClick={publishManual}
                title="Publish this manual to the public library so anyone can find it"
              >
                {busyPublish ? 'Publishing…' : 'Complete manual'}
              </button>
            )
          )}
          <button onClick={savePdf}>Save as PDF</button>
          <button onClick={makeCard} disabled={busyCard}>{busyCard ? 'Building…' : 'Quick-start card'}</button>
          {me.signedIn && currentDbManual && !editing && (
            <button onClick={startEdit} title="Edit this manual's markdown">Edit</button>
          )}
          {me.signedIn && currentDbManual && (
            currentDbManual.verified ? (
              <button disabled title="Sources checked — verified manual">✓ Verified</button>
            ) : (
              <button disabled={busyVerify} onClick={verifyManual} title="Run AI checks to restore the verified badge">
                {busyVerify ? 'Checking…' : 'Request verification'}
              </button>
            )
          )}
          <button onClick={copyManual}>{copied ? 'Copied' : 'Copy'}</button>
          <button onClick={shareManual}>Share link</button>
        </div>
      )}

      {videos.length > 0 && metaClosed && (
        <div className="videos no-print">
          <h2>
            Watch it done
            {!isPro && hasAuth && videos.length > 1 && <span className="probadge">Pro unlocks all</span>}
          </h2>
          <div className="vidgrid">
            {videos.slice(0, 4).map((v, i) => {
              const locked = hasAuth && !isPro && i > 0;
              if (locked) {
                return (
                  <div key={v.id} className="vid locked" role="button" tabIndex={0}
                    onClick={() => (me.signedIn ? upgrade() : (window.location.href = '/login'))}
                    onKeyDown={(e) => { if (e.key === 'Enter') (me.signedIn ? upgrade() : (window.location.href = '/login')); }}
                    style={{ cursor: 'pointer' }}
                  >
                    <img src={'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg'} alt="" loading="lazy" />
                    <span>{v.title}</span>
                    <span className="vidlock"><span className="lockbadge">Pro</span></span>
                  </div>
                );
              }
              // Click to play: thumbnail swaps to an embedded player, right inside the manual.
              if (playing.has(v.id)) {
                return (
                  <div key={v.id} className="vid playing">
                    <iframe
                      src={'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&rel=0'}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                    <span>{v.title}</span>
                  </div>
                );
              }
              return (
                <div key={v.id} className="vid" role="button" tabIndex={0} style={{ cursor: 'pointer' }}
                  onClick={() => setPlaying((p) => new Set(p).add(v.id))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setPlaying((p) => new Set(p).add(v.id)); }}
                >
                  <img src={'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg'} alt={v.title} loading="lazy" />
                  <span className="playbtn" aria-hidden="true" />
                  <span>{v.title}</span>
                </div>
              );
            })}
          </div>
          {hasAuth && !isPro && videos.length > 1 && (
            <p className="vidnote">
              Free plans include the best video pick.{' '}
              {me.signedIn ? (
                <button onClick={upgrade}>Go Pro to unlock every walkthrough</button>
              ) : (
                <a href="/login">Sign in to upgrade</a>
              )}
            </p>
          )}
        </div>
      )}

      {showResult && !running && (
        <p className="pub-meta no-print">
          {readMinutes} min read · {bodyWords.toLocaleString()} words
          {buildSeconds ? ' · built in ' + buildSeconds + 's' : ''}
        </p>
      )}

      {editing && (
        <div className="editor no-print">
          <h2>Editing “{currentTitle}” — Markdown</h2>
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            spellCheck={false}
            aria-label="Manual markdown editor"
          />
          <div className="editrow">
            <button className="tb up" disabled={busyEdit || editText.trim().length < 20} onClick={saveEdit}>
              {busyEdit ? 'Saving…' : 'Save changes'}
            </button>
            <button className="tb" onClick={() => setEditing(false)}>Cancel</button>
            <span className="edithint">
              {publicSlug
                ? 'Published manual — edits go live for everyone and drop the verified badge until re-checked.'
                : 'Markdown: ## headings, - lists, [links](url). Edits mark the manual unverified until re-checked.'}
            </span>
          </div>
        </div>
      )}

      {body && !editing && (
        <div className="result">
          <div dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }} />
          {running && <span className="cursor" />}
        </div>
      )}

      {showResult && !running && me.signedIn && currentManualId && (
        <div className="reminders no-print">
          <h2>Maintenance reminders</h2>
          {currentReminders.map((r) => (
            <div key={r.id} className="rem-item">
              <span className="rem-label">{r.label}</span>
              {r.next_due <= today ? (
                <span className="rem-badge">Due</span>
              ) : (
                <span className="rem-when">every {r.interval_days}d · next {r.next_due}</span>
              )}
              <button className="rem-btn" onClick={() => reminderDone(r.id)}>Done</button>
              <button className="rem-btn" onClick={() => reminderDelete(r.id)} aria-label="delete reminder">Remove</button>
            </div>
          ))}
          <div className="rem-add">
            <input
              type="text"
              placeholder="e.g. Replace air filter"
              value={remLabel}
              onChange={(e) => setRemLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addReminder(remLabel, parseInt(remInterval, 10)); }}
            />
            <select value={remInterval} onChange={(e) => setRemInterval(e.target.value)}>
              <option value="14">Every 2 weeks</option>
              <option value="30">Monthly</option>
              <option value="90">Every 3 months</option>
              <option value="180">Every 6 months</option>
              <option value="365">Yearly</option>
            </select>
            <button className="rem-btn" onClick={() => addReminder(remLabel, parseInt(remInterval, 10))}>Add</button>
            <button className="rem-btn" onClick={suggestReminders}>Suggest for me</button>
          </div>
        </div>
      )}

      {showResult && !running && (
        <div className="chat no-print">
          <h2>Ask a follow-up</h2>
          {chat.length > 0 && (
            <div className="msgs" ref={msgsRef}>
              {chat.map((m, i) => (
                <div key={i} className={'msg ' + m.role}>
                  {m.role === 'assistant' ? (
                    m.content ? (
                      <div dangerouslySetInnerHTML={{ __html: marked.parse(m.content) as string }} />
                    ) : (
                      <span className="thinking">Thinking…</span>
                    )
                  ) : (
                    <span>{m.content}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="chatform">
            <input
              type="text"
              placeholder="e.g. It's still beeping after step 3 — what now?"
              value={chatInput}
              maxLength={1000}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
            />
            <button className="go" disabled={chatRunning || !chatInput.trim()} onClick={sendChat}>
              {chatRunning ? '…' : 'Ask'}
            </button>
          </div>
        </div>
      )}

      {me.signedIn && (allLibrary.length > 0 || spaces.length > 0) && (
        <div className="spacesbar no-print">
          <button className={'spacechip' + (activeSpace === null ? ' active' : '')} onClick={() => setActiveSpace(null)}>
            All ({allLibrary.length})
          </button>
          {spaces.map((s) => {
            const c = allLibrary.filter((m) => m.space_id === s.id).length;
            return (
              <span key={s.id} className={'spacechip wrap2' + (activeSpace === s.id ? ' active' : '')}>
                <button className="sc-main" onClick={() => setActiveSpace(s.id)}>{s.name} ({c})</button>
                <button className="sc-del" onClick={() => deleteSpace(s.id)} aria-label="delete space">×</button>
              </span>
            );
          })}
          <button className="spacechip add" onClick={createSpace}>+ New space</button>
        </div>
      )}

      {me.signedIn && allLibrary.length === 0 && idle && (
        <div className="welcome no-print">
          <h2>Your library starts here.</h2>
          <p>
            Get your first manual and it saves automatically. Group manuals into spaces, set
            maintenance reminders, and ask follow-ups any time.
          </p>
        </div>
      )}

      {library.length > 0 && (
        <div className="history no-print">
          <h2>
            {me.signedIn
              ? (activeSpace ? spaceName(activeSpace) : 'Your library') + ' (' + library.length + ')'
              : 'Recent (saved on this device)'}
          </h2>
          {!me.signedIn && hasAuth && (
            <p className="hnote">
              <a href="/login">Sign in</a> to save your library to the cloud, group it into spaces, add maintenance reminders, and chat with any manual.
            </p>
          )}
          <div className="hlist">
            {library.map((h) => (
              <div key={h.id} className="hitem">
                <button className="hmain" onClick={() => loadItem(h)}>
                  <span className={'htype' + (h.type === 'official' ? ' official' : '')}>{typeLabel(h.type)}</span>
                  <span className="htitle">{h.title}</span>
                </button>
                {me.signedIn && spaces.length > 0 && (
                  <select
                    className="hspace"
                    value={h.space_id || ''}
                    onChange={(e) => assignSpace(h, e.target.value)}
                    title="Move to space"
                  >
                    <option value="">No space</option>
                    {spaces.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                )}
                <button className="hdel" onClick={() => deleteItem(h)} aria-label="delete">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!me.signedIn && idle && (
        <>
          <div className="trust no-print">
            <span>Official manuals first</span>
            <span>Real fixes from real communities</span>
            <span>The right videos</span>
            <span>Every step sourced &amp; linked</span>
          </div>

          {featured.length > 0 && (
            <div className="section no-print">
              <h2 className="big">Built by people like you.</h2>
              <p className="sub">
                When someone completes a manual, they can publish it to the community library — so
                the next person with the same problem gets the answer instantly. Here&apos;s what was
                built recently.
              </p>
              <div className="postergrid">
                {featured.slice(0, 6).map((f) => (
                  <a key={f.slug} className="poster" href={'/m/' + f.slug}>
                    <span className="poster-letter" aria-hidden="true">
                      {(f.title || 'M').trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="poster-type">{f.verified ? '✓ ' : ''}{typeLabel(f.type)} manual</span>
                    <span className="poster-title">{f.title}</span>
                    <span className="poster-sub">{f.published_at ? 'Published ' + f.published_at : 'From the community library'}</span>
                  </a>
                ))}
              </div>
              <div className="ctasub" style={{ textAlign: 'center', color: 'var(--faint)' }}>
                <a href="/library">Browse the full community library</a>
              </div>
            </div>
          )}

          <div className="section no-print">
            <h2 className="big">You already search like this.</h2>
            <p className="sub">
              You type your question, then add the name of a forum — because that&apos;s where the real
              answers hide. You open three tabs and a video to cook one thing. ManualMind does all of
              that in one search, and hands you a finished manual.
            </p>
            <div className="howgrid">
              <div className="howcard">
                <span className="step">1</span>
                <h3>Ask it anything</h3>
                <p>
                  A product name, an error code, a weird noise. Or upload a photo or the PDF you
                  already have — it reads model plates and error screens.
                </p>
              </div>
              <div className="howcard">
                <span className="step">2</span>
                <h3>It checks every real source</h3>
                <p>
                  The manufacturer&apos;s official docs first. Then the communities that actually fixed
                  it — forums, Stack Exchange, repair wikis, and more — plus the open web and video
                  tutorials. Fake how-to sites never make the cut.
                </p>
              </div>
              <div className="howcard">
                <span className="step">3</span>
                <h3>You get a finished manual</h3>
                <p>
                  Step-by-step, with tips, common mistakes, troubleshooting, videos worth watching,
                  and every source cited. Then ask it follow-ups like a person.
                </p>
              </div>
            </div>
          </div>

          <div className="section leftsec no-print">
            <h2 className="big">One tool, every &ldquo;how do I…&rdquo;</h2>
            <dl className="audience">
              <div className="aud-row">
                <dt>Homeowners</dt>
                <dd>The furnace filter, the water heater&apos;s pilot light, the breaker that keeps tripping, the sprinkler timer nobody remembers programming.</dd>
              </div>
              <div className="aud-row">
                <dt>Renters</dt>
                <dd>Appliances you didn&apos;t choose and can&apos;t replace. Get the manual for the mystery thermostat before you touch it.</dd>
              </div>
              <div className="aud-row">
                <dt>Makers &amp; tinkerers</dt>
                <dd>Flash the firmware, calibrate the printer, install RetroArch, host a local LLM — the stuff where forum threads are the only real documentation.</dd>
              </div>
              <div className="aud-row">
                <dt>Kitchens &amp; shops</dt>
                <dd>Every machine on the line with its own quick-start card taped to it, and maintenance reminders that actually fire.</dd>
              </div>
            </dl>
          </div>

          <div className="section no-print">
            <h2 className="big">Google. A chatbot. Or a manual.</h2>
            <p className="sub">
              Search gives you tabs. A chatbot gives you an answer that scrolls away. ManualMind
              gives you a document — sourced, saved, and yours.
            </p>
            <div className="compare three">
              <div className="comparecol">
                <h3>Googling it</h3>
                <ul>
                  <li>Ten tabs, three of them fake how-to sites</li>
                  <li>An SEO article that never answers the question</li>
                  <li>A 40-minute video for a 2-minute fix</li>
                  <li>The answer buried in a forum comment from 2019</li>
                  <li>Start over next time it breaks</li>
                </ul>
              </div>
              <div className="comparecol">
                <h3>Asking a chatbot</h3>
                <ul>
                  <li>A decent answer that vanishes up the chat</li>
                  <li>No sources — you just have to trust it</li>
                  <li>Nothing to download, print, or tape to the machine</li>
                  <li>No videos, no reminders, no library</li>
                  <li>Ask again next time, get a different answer</li>
                </ul>
              </div>
              <div className="comparecol mm">
                <h3>ManualMind</h3>
                <ul>
                  <li>One search — official docs checked first</li>
                  <li>A finished, step-by-step manual in about a minute</li>
                  <li>Every claim hyperlinked to its source</li>
                  <li>Download as PDF, print it, save it to your profile</li>
                  <li>Yours forever — with reminders and follow-up chat</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="section no-print">
            <h2 className="big">Every manual makes the next search better.</h2>
            <p className="sub">
              When you complete a manual, it joins a public, searchable library — so the next person
              with your exact problem gets the answer instantly. Google finds it. You built it.
            </p>
            <div className="featindex">
              <div className="feat">
                <h3>Library &amp; Spaces</h3>
                <p>Every manual saved and grouped by place — My Home, The Shop, Unit 4B.</p>
              </div>
              <div className="feat">
                <h3>Ask follow-ups</h3>
                <p>Stuck on step 3? Every manual has its own chat that knows the context.</p>
              </div>
              <div className="feat">
                <h3>Maintenance reminders</h3>
                <p>Filter changes, oil, batteries — on schedule, with suggested intervals.</p>
              </div>
              <div className="feat">
                <h3>Quick-start cards</h3>
                <p>Any manual boiled down to one printable page. Tape it to the machine.</p>
              </div>
              <div className="feat">
                <h3>PDF &amp; share</h3>
                <p>Save as PDF or send a link. Your fix becomes someone else&apos;s fix.</p>
              </div>
              <div className="feat">
                <h3>Complete &amp; publish</h3>
                <p>One click turns your manual into a public page anyone can find.</p>
              </div>
            </div>
          </div>

          <div className="section no-print">
            <h2 className="big">Free to start. Simple to grow.</h2>
            <div className="pricegrid">
              <div className="pricecard free">
                <div className="tier">Free</div>
                <div className="price">$0<span> forever</span></div>
                <ul>
                  <li>3 manuals a day, no account needed</li>
                  <li>5 manuals a month with a free account</li>
                  <li>Cloud library, profile saves, and spaces</li>
                  <li>Follow-up chat on every manual</li>
                  <li>Maintenance reminders</li>
                  <li>The best video pick with each manual</li>
                  <li>Save as PDF, share, and publish</li>
                </ul>
                <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Get started</button>
              </div>
              <div className="pricecard pro">
                <div className="tier">Pro</div>
                <div className="price">$20<span> /month</span></div>
                <ul>
                  <li>Everything in Free</li>
                  <li>Unlimited manuals</li>
                  <li>Every video walkthrough, unlocked</li>
                  <li>Pour in your own sources — links your manual is built from</li>
                  <li>Quick-start cards — any manual on one printable page</li>
                  <li>Priority pipeline</li>
                  <li>Cancel anytime</li>
                </ul>
                <a className="cta" href="/login">Sign in to upgrade</a>
              </div>
            </div>
          </div>

          <div className="section no-print">
            <h2 className="big">Everything people ask.</h2>
            <div className="faq">
              {FAQS.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  '@context': 'https://schema.org',
                  '@type': 'FAQPage',
                  mainEntity: FAQS.map((f) => ({
                    '@type': 'Question',
                    name: f.q,
                    acceptedAnswer: { '@type': 'Answer', text: f.a },
                  })),
                }),
              }}
            />
          </div>

          <div className="ctaband no-print">
            <h2>Stop searching. Start knowing.</h2>
            <p>
              Three free manuals a day, no account needed. Sign up free for a cloud library, spaces,
              chat, and reminders.
            </p>
            <button onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
              Get your first manual
            </button>
            <div className="ctasub">
              or <a href="/library">browse the completed-manual library</a>
            </div>
          </div>

          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify([
                {
                  '@context': 'https://schema.org',
                  '@type': 'WebSite',
                  name: 'ManualMind',
                  url: typeof window === 'undefined' ? 'https://manualmind-six.vercel.app' : window.location.origin,
                  potentialAction: {
                    '@type': 'SearchAction',
                    target: { '@type': 'EntryPoint', urlTemplate: (typeof window === 'undefined' ? 'https://manualmind-six.vercel.app' : window.location.origin) + '/?q={search_term_string}' },
                    'query-input': 'required name=search_term_string',
                  },
                },
                {
                  '@context': 'https://schema.org',
                  '@type': 'Organization',
                  name: 'ManualMind',
                  url: typeof window === 'undefined' ? 'https://manualmind-six.vercel.app' : window.location.origin,
                  description: 'The answer engine for everything you own — finds the official manual or builds a better one, with every source cited.',
                },
              ]),
            }}
          />
        </>
      )}

      <div className="bigfooter no-print">
        <div className="bfgrid">
          <div className="bfcol">
            <div className="bfbrand">ManualMind</div>
            <p>Finds the real manual first. Builds a better one when it can&apos;t. Powered by Claude.</p>
          </div>
          <div className="bfcol">
            <h4>Product</h4>
            <a href="/">Get a manual</a>
            <a href="/library">The library</a>
            {hasAuth && <a href="/login">Sign in</a>}
          </div>
          <div className="bfcol">
            <h4>Good to know</h4>
            <a href="/#faq" onClick={(e) => { e.preventDefault(); document.querySelector('.faq')?.scrollIntoView({ behavior: 'smooth' }); }}>FAQ</a>
            <a href="/sitemap.xml">Sitemap</a>
          </div>
        </div>
        <div className="footer" style={{ marginTop: 28 }}>
          ManualMind · verify safety-critical steps against official sources
        </div>
      </div>

      {showTop && (
        <button
          className="scrolltop no-print"
          aria-label="Scroll to top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          ↑
        </button>
      )}

      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  );
}
