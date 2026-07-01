'use client';

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { createClient } from '@/lib/supabase/client';

marked.setOptions({ breaks: true, gfm: true });

type Meta = { product?: string; officialManual?: string; type?: string; confidence?: string };
type Space = { id: string; name: string };
type LibItem = {
  id: string;
  title: string;
  type: string;
  body: string;
  meta: Meta | null;
  space_id?: string | null;
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
};

const STAGES = [
  { key: 'identify', label: 'Identifying photo' },
  { key: 'reddit', label: 'Scanning Reddit' },
  { key: 'searching', label: 'Searching the web' },
  { key: 'generate', label: 'Building manual' },
];

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

export default function Home() {
  const [query, setQuery] = useState('');
  const [image, setImage] = useState<string | null>(null);
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
  const fileRef = useRef<HTMLInputElement>(null);
  const [supabase] = useState(() => (hasAuth ? createClient() : null));

  const { meta, body, metaClosed } = splitMeta(raw);
  const spaces: Space[] = me.spaces || [];

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
  }));
  const allLibrary: LibItem[] = me.signedIn ? dbManuals : history;
  const library: LibItem[] =
    me.signedIn && activeSpace ? allLibrary.filter((m) => m.space_id === activeSpace) : allLibrary;

  function persistLocal(next: LibItem[]) {
    setHistory(next);
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next.slice(0, 30)));
    } catch {}
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
  }

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
    setRaw('```meta\n' + JSON.stringify(item.meta || {}) + '\n```\n\n' + item.body);
    setDoneStages(new Set(['identify', 'reddit', 'searching', 'generate']));
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

  async function run(q?: string) {
    const text = (q !== undefined ? q : query).trim();
    if (!text && !image) return;
    if (q !== undefined) setQuery(q);
    setRaw('');
    setError(null);
    setLimitHit(false);
    setIdentified(null);
    setRedditCount(null);
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
              setRedditCount(evt.count); markDone('reddit'); setActive('searching'); break;
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
  const bannerIcon = meta?.type === 'official' ? '✅' : meta?.type === 'community' ? '💬' : '✨';
  const bannerTitle =
    meta?.type === 'official' ? 'Official manual found'
      : meta?.type === 'community' ? 'Built from community knowledge'
      : 'Manual synthesized for you';
  const showResult = body && metaClosed;
  const isPro = me.plan === 'pro';
  const spaceName = (id?: string | null) => spaces.find((s) => s.id === id)?.name;

  return (
    <div className="wrap">
      {hasAuth && (
        <div className="topbar no-print">
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

      <div className="brand no-print">
        <div className="logo">📘</div>
        <h1>ManualMind</h1>
      </div>
      <p className="tagline no-print">
        A manual for <em>anything</em>. Type it, or snap a photo — ManualMind finds the official
        guide, or builds one in real time from Reddit and the web.
      </p>

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
            📷 Upload a photo
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          </label>
          {image && <img className="thumb" src={image} alt="upload preview" />}
          {image && (
            <button className="clearimg" onClick={() => { setImage(null); if (fileRef.current) fileRef.current.value = ''; }}>
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
          <span className="ico">🔍</span>
          <div><h3>Identified from your photo</h3><p>{identified}</p></div>
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
          <span className="ico">{bannerIcon}</span>
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
          <button onClick={savePdf}>⬇️ Save as PDF</button>
          <button onClick={copyManual}>📋 Copy</button>
          <button onClick={shareManual}>🔗 Share link</button>
        </div>
      )}

      {body && (
        <div className="result">
          <div dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }} />
          {running && <span className="cursor" />}
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

      {me.signedIn && spaces.length >= 0 && (allLibrary.length > 0 || spaces.length > 0) && (
        <div className="spacesbar no-print">
          <button className={'spacechip' + (activeSpace === null ? ' active' : '')} onClick={() => setActiveSpace(null)}>
            All ({allLibrary.length})
          </button>
          {spaces.map((s) => {
            const c = allLibrary.filter((m) => m.space_id === s.id).length;
            return (
              <span key={s.id} className={'spacechip wrap2' + (activeSpace === s.id ? ' active' : '')}>
                <button className="sc-main" onClick={() => setActiveSpace(s.id)}>{s.name} ({c})</button>
                <button className="sc-del" onClick={() => deleteSpace(s.id)} aria-label="delete space">✕</button>
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
              <a href="/login">Sign in</a> to save your library to the cloud, group it into spaces, and chat with any manual.
            </p>
          )}
          <div className="hlist">
            {library.map((h) => (
              <div key={h.id} className="hitem">
                <button className="hmain" onClick={() => loadItem(h)}>
                  <span className="htype">{h.type === 'official' ? '✅' : h.type === 'community' ? '💬' : '✨'}</span>
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
                <button className="hdel" onClick={() => deleteItem(h)} aria-label="delete">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="footer no-print">
        ManualMind · finds the real manual first, builds one when it can’t · powered by Claude
      </div>

      {toast && <div className="toast no-print">{toast}</div>}
    </div>
  );
}
