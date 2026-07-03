'use client';

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { createClient } from '@/lib/supabase/client';

marked.setOptions({ breaks: true, gfm: true });

type Meta = { product?: string; officialManual?: string; type?: string; confidence?: string };
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
  { key: 'reddit', label: 'Scanning Reddit' },
  { key: 'youtube', label: 'Finding videos' },
  { key: 'searching', label: 'Searching the web' },
  { key: 'generate', label: 'Building manual' },
];

type Video = { id: string; title: string };

function typeLabel(type?: string | null): string {
  return type === 'official' ? 'Official' : type === 'community' ? 'Community' : 'AI-built';
}

const EXAMPLES = [
  'Reset a Nest thermostat to factory settings',
  'Replace the brake pads on a Trek mountain bike',
  'Sourdough starter from scratch',
  'Set up an Anova sous vide for the first time',
];

const HISTORY_KEY = 'mm_history_v1';
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
  const [supabase] = useState(() => (hasAuth ? createClient() : null));

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
    } catch {}
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#m=')) {
      const decoded = decodeShare(window.location.hash.slice(3));
      if (decoded) {
        setRaw('```meta\n' + JSON.stringify(decoded.meta || {}) + '\n```\n\n' + decoded.body);
        setDoneStages(new Set(['identify', 'reddit', 'searching', 'generate']));
      }
    }
    loadMe();
    if (typeof window !== 'undefined' && window.location.search.includes('upgraded=1')) {
      flash('Welcome to Pro! Unlimited manuals unlocked.');
      window.history.replaceState(null, '', '/');
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
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q));
        const data = await res.json();
        setLibHits(data.results || []);
      } catch {
        setLibHits([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, running]);

  function saveLocal(finalRaw: string) {
    const parsed = splitMeta(finalRaw);
    if (!parsed.body) return;
    const item: LibItem = {
      id: Date.now().toString(36),
      title: (parsed.meta && parsed.meta.product) || identified || query || 'Manual',
      type: (parsed.meta && parsed.meta.type) || 'synthesized',
      body: parsed.body,
      meta: parsed.meta,
    };
    persistLocal([item, ...history].slice(0, 30));
  }

  async function loadItem(item: LibItem) {
    setError(null);
    setLimitHit(false);
    setRunning(false);
    setIdentified(null);
    setRedditCount(null);
    setVideos([]);
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
    const name = typeof window !== 'undefined' ? window.prompt('Name your space (e.g. "My Home", "Unit 4B", "The Shop")') : '';
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
    navigator.clipboard.writeText(body).then(() => flash('Manual copied to clipboard'));
  }
  function shareManual() {
    if (!body) return;
    const code = encodeShare(meta, body);
    const url = window.location.origin + window.location.pathname + '#m=' + code;
    navigator.clipboard.writeText(url).then(() => flash('Shareable link copied'));
    try {
      window.history.replaceState(null, '', '#m=' + code);
    } catch {}
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

  async function publishManual() {
    if (!currentManualId) return;
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
    const text = (q !== undefined ? q : query).trim();
    if (!text && !image) return;
    if (q !== undefined) setQuery(q);
    setRaw('');
    setError(null);
    setLimitHit(false);
    setIdentified(null);
    setRedditCount(null);
    setVideos([]);
    setLibHits([]);
    setDoneStages(new Set());
    setActive(image ? 'identify' : 'reddit');
    setRunning(true);
    setCurrentManualId(null);
    setChat([]);
    setCurrentTitle(text || 'Manual');

    let finalRaw = '';
    try {
      const res = await fetch('/api/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, image, spaceId: me.signedIn ? targetSpace || null : null }),
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
            case 'done': markDone('generate'); setActive(null); break;
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
      setError(e && e.message ? e.message : 'Request failed.');
    } finally {
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
      : 'Manual synthesized for you';
  const showResult = body && metaClosed;
  const isPro = me.plan === 'pro';
  const spaceName = (id?: string | null) => spaces.find((s) => s.id === id)?.name;
  const manualTitleById = (id: string | null) => dbManuals.find((m) => m.id === id)?.title || 'a manual';
  const currentDbManual = currentManualId ? dbManuals.find((m) => m.id === currentManualId) : undefined;
  const publicSlug = currentDbManual?.public_slug || null;

  const idle = !raw && !running && !error;

  return (
    <div className="wrap">
      <div className="nav no-print">
        <a className="wordmark" href="/">ManualMind</a>
        {hasAuth && (
          <div className="topbar">
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
          </div>
        )}
      </div>

      <div className="hero no-print">
        {idle && <div className="herobadge">The answer engine for everything you own.</div>}
        <h1>The manual for anything.</h1>
        <p className="tagline">
          A product, a problem, an error code — or a photo, or a PDF. ManualMind finds the official
          manual, the best Reddit fixes, and the right videos. And when no manual exists, it writes
          you a better one.
        </p>
      </div>

      <div className="panel no-print">
        <div className="searchrow">
          <input
            type="text"
            placeholder="What do you need a manual for?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !running) run(); }}
          />
          <button className="go" disabled={running || (!query.trim() && !image)} onClick={() => run()}>
            {running ? 'Working…' : 'Get manual'}
          </button>
        </div>
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
            <select className="spacesel" value={targetSpace} onChange={(e) => setTargetSpace(e.target.value)}>
              <option value="">Save to: no space</option>
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>Save to: {s.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {libHits.length > 0 && idle && (
        <div className="libresults no-print">
          <div className="lr-head">From the manual library</div>
          {libHits.map((h) => (
            <a key={h.slug} className="lr-item" href={'/m/' + h.slug}>
              <div className="lr-title">{h.title}</div>
              <div className="lr-sub">{typeLabel(h.type)} manual · ready now</div>
            </a>
          ))}
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

      {identified && (
        <div className="banner community no-print" style={{ marginTop: 14 }}>
          <span className="tag">Identified</span>
          <div><h3>From your upload</h3><p>{identified}</p></div>
        </div>
      )}

      {error && (
        <div className="err no-print">
          <div>{error}</div>
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
            <h3>{bannerTitle}{meta.confidence ? ' · ' + meta.confidence + ' confidence' : ''}</h3>
            {meta.officialManual ? (
              <p>Official source: <a href={meta.officialManual} target="_blank" rel="noreferrer">{meta.officialManual}</a></p>
            ) : (
              <p>No official manual was found online, so ManualMind assembled this from the best available sources.</p>
            )}
          </div>
        </div>
      )}

      {showResult && !running && (
        <div className="actions no-print">
          {me.signedIn && currentDbManual && (
            publicSlug ? (
              <>
                <button className="primary" onClick={() => copyPublicLink(publicSlug)}>Copy public link</button>
                <button onClick={unpublishManual}>Unpublish</button>
              </>
            ) : (
              <button className="primary" onClick={publishManual} title="Publish this manual to the public library so anyone can find it">
                Complete manual
              </button>
            )
          )}
          <button onClick={savePdf}>Save as PDF</button>
          <button onClick={makeCard} disabled={busyCard}>Quick-start card</button>
          <button onClick={copyManual}>Copy</button>
          <button onClick={shareManual}>Share link</button>
        </div>
      )}

      {videos.length > 0 && metaClosed && (
        <div className="videos no-print">
          <h2>Watch it done</h2>
          <div className="vidgrid">
            {videos.slice(0, 4).map((v) => (
              <a key={v.id} className="vid" href={'https://www.youtube.com/watch?v=' + v.id} target="_blank" rel="noreferrer">
                <img src={'https://i.ytimg.com/vi/' + v.id + '/mqdefault.jpg'} alt={v.title} loading="lazy" />
                <span>{v.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {body && (
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
            <div className="msgs">
              {chat.map((m, i) => (
                <div key={i} className={'msg ' + m.role}>
                  {m.role === 'assistant' ? (
                    <div dangerouslySetInnerHTML={{ __html: marked.parse(m.content || '…') as string }} />
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

      {library.length > 0 && (
        <div className="history no-print">
          <h2>{me.signedIn ? (activeSpace ? spaceName(activeSpace) : 'Your library') : 'Recent (saved on this device)'}</h2>
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
            <span>Real fixes from Reddit</span>
            <span>The right videos</span>
            <span>Every step sourced</span>
          </div>

          <div className="section no-print">
            <div className="kicker">Why it exists</div>
            <h2 className="big">You already search like this.</h2>
            <p className="sub">
              You type your question, then add &ldquo;reddit&rdquo; — because that&apos;s where the real answers
              are. You open three tabs and a YouTube video to cook one thing. ManualMind does all of
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
                  The manufacturer&apos;s official docs first. Then Reddit threads from people who
                  actually fixed it. Then the web and YouTube — so fake how-to sites never make the cut.
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

          <div className="section no-print">
            <div className="kicker">The library</div>
            <h2 className="big">Every completed manual makes the next search better.</h2>
            <p className="sub">
              When you complete a manual, it joins a public, searchable library — so the next person
              with your exact problem gets the answer instantly. Google finds it. You built it.
            </p>
            <div className="featgrid">
              <div className="featcard">
                <h3>Library &amp; Spaces</h3>
                <p>Every manual saved and grouped by place — My Home, The Shop, Unit 4B.</p>
              </div>
              <div className="featcard">
                <h3>Ask follow-ups</h3>
                <p>Stuck on step 3? Every manual has its own chat that knows the context.</p>
              </div>
              <div className="featcard">
                <h3>Maintenance reminders</h3>
                <p>Filter changes, oil, batteries — on schedule, with suggested intervals.</p>
              </div>
              <div className="featcard">
                <h3>Quick-start cards</h3>
                <p>Any manual boiled down to one printable page. Tape it to the machine.</p>
              </div>
              <div className="featcard">
                <h3>PDF &amp; share</h3>
                <p>Save as PDF or send a link. Your fix becomes someone else&apos;s fix.</p>
              </div>
              <div className="featcard">
                <h3>Complete &amp; publish</h3>
                <p>One click turns your manual into a public page anyone can find.</p>
              </div>
            </div>
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
          </div>
        </>
      )}

      <div className="footer no-print">
        ManualMind · finds the real manual first, builds one when it can’t · powered by Claude
      </div>

      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  );
}
