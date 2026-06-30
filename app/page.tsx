'use client';

import { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

type Meta = { product?: string; officialManual?: string; type?: string; confidence?: string };
type HistoryItem = {
  id: string;
  title: string;
  type: string;
  body: string;
  meta: Meta | null;
  ts: number;
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
  const jsonStr = raw.slice(afterTag, end).trim();
  let meta: Meta | null = null;
  try {
    meta = JSON.parse(jsonStr);
  } catch {
    meta = null;
  }
  const body = raw.slice(end + 3).replace(/^\s+/, '');
  return { meta, body, metaClosed: true };
}

function encodeShare(meta: Meta | null, body: string): string {
  const payload = JSON.stringify({ m: meta, b: body });
  return btoa(unescape(encodeURIComponent(payload)));
}
function decodeShare(s: string): { meta: Meta | null; body: string } | null {
  try {
    const json = decodeURIComponent(escape(atob(s)));
    const parsed = JSON.parse(json);
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
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { meta, body, metaClosed } = splitMeta(raw);

  // Load history + any shared manual from the URL on first render.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
    if (typeof window !== 'undefined' && window.location.hash.startsWith('#m=')) {
      const decoded = decodeShare(window.location.hash.slice(3));
      if (decoded) {
        const m = decoded.meta;
        setRaw('```meta\n' + JSON.stringify(m || {}) + '\n```\n\n' + decoded.body);
        setDoneStages(new Set(['identify', 'reddit', 'searching', 'generate']));
      }
    }
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  function persistHistory(next: HistoryItem[]) {
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

  function saveCurrentToHistory(finalRaw: string) {
    const parsed = splitMeta(finalRaw);
    if (!parsed.body) return;
    const title =
      (parsed.meta && parsed.meta.product) ||
      identified ||
      query ||
      'Manual';
    const item: HistoryItem = {
      id: Date.now().toString(36),
      title,
      type: (parsed.meta && parsed.meta.type) || 'synthesized',
      body: parsed.body,
      meta: parsed.meta,
      ts: Date.now(),
    };
    persistHistory([item, ...history].slice(0, 30));
  }

  function loadFromHistory(item: HistoryItem) {
    setError(null);
    setRunning(false);
    setIdentified(null);
    setRedditCount(null);
    setRaw('```meta\n' + JSON.stringify(item.meta || {}) + '\n```\n\n' + item.body);
    setDoneStages(new Set(['identify', 'reddit', 'searching', 'generate']));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function deleteFromHistory(id: string) {
    persistHistory(history.filter((h) => h.id !== id));
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

  async function run(q?: string) {
    const text = (q !== undefined ? q : query).trim();
    if (!text && !image) return;
    if (q !== undefined) setQuery(q);
    setRaw('');
    setError(null);
    setIdentified(null);
    setRedditCount(null);
    setDoneStages(new Set());
    setActive(image ? 'identify' : 'reddit');
    setRunning(true);

    let finalRaw = '';
    try {
      const res = await fetch('/api/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, image }),
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
            case 'identify':
              setActive('identify');
              break;
            case 'identified':
              setIdentified(evt.product);
              markDone('identify');
              setActive('reddit');
              break;
            case 'reddit':
              setActive('reddit');
              break;
            case 'reddit_done':
              setRedditCount(evt.count);
              markDone('reddit');
              setActive('searching');
              break;
            case 'searching':
              setActive('searching');
              break;
            case 'generate':
              markDone('searching');
              setActive('generate');
              break;
            case 'token':
              finalRaw += evt.text || '';
              setRaw((r) => r + (evt.text || ''));
              break;
            case 'done':
              markDone('generate');
              setActive(null);
              break;
            case 'error':
              setError(evt.message || 'Something went wrong.');
              setActive(null);
              break;
          }
        }
      }
      if (finalRaw) saveCurrentToHistory(finalRaw);
    } catch (e: any) {
      setError(e && e.message ? e.message : 'Request failed.');
    } finally {
      setRunning(false);
      setActive(null);
    }
  }

  const bannerClass = meta && meta.type ? meta.type : 'synthesized';
  const bannerIcon = meta?.type === 'official' ? '✅' : meta?.type === 'community' ? '💬' : '✨';
  const bannerTitle =
    meta?.type === 'official'
      ? 'Official manual found'
      : meta?.type === 'community'
      ? 'Built from community knowledge'
      : 'Manual synthesized for you';

  const showResult = body && metaClosed;

  return (
    <div className="wrap">
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
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !running) run();
            }}
          />
          <button className="go" disabled={running || (!query.trim() && !image)} onClick={() => run()}>
            {running ? 'Working…' : 'Get manual'}
          </button>
        </div>
        <div className="tools">
          <label className="upload">
            📷 Upload a photo
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={onFile}
            />
          </label>
          {image && <img className="thumb" src={image} alt="upload preview" />}
          {image && (
            <button
              className="clearimg"
              onClick={() => {
                setImage(null);
                if (fileRef.current) fileRef.current.value = '';
              }}
            >
              remove
            </button>
          )}
        </div>
      </div>

      {!raw && !running && !error && (
        <div className="chips no-print">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => run(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {(running || raw || error) && (
        <div className="stages no-print">
          {STAGES.map((s) => {
            const isDone = doneStages.has(s.key);
            const isActive = active === s.key;
            return (
              <span
                key={s.key}
                className={'stage' + (isActive ? ' active' : '') + (isDone ? ' done' : '')}
              >
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
          <div>
            <h3>Identified from your photo</h3>
            <p>{identified}</p>
          </div>
        </div>
      )}

      {error && <div className="err no-print">{error}</div>}

      {meta && metaClosed && (
        <div className={'banner ' + bannerClass}>
          <span className="ico">{bannerIcon}</span>
          <div>
            <h3>
              {bannerTitle}
              {meta.confidence ? ' · ' + meta.confidence + ' confidence' : ''}
            </h3>
            {meta.officialManual ? (
              <p>
                Official source:{' '}
                <a href={meta.officialManual} target="_blank" rel="noreferrer">
                  {meta.officialManual}
                </a>
              </p>
            ) : (
              <p>
                No official manual was found online, so ManualMind assembled this from the best
                available sources.
              </p>
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

      {history.length > 0 && (
        <div className="history no-print">
          <h2>Your manuals</h2>
          <div className="hlist">
            {history.map((h) => (
              <div key={h.id} className="hitem">
                <button className="hmain" onClick={() => loadFromHistory(h)}>
                  <span className="htype">{h.type === 'official' ? '✅' : h.type === 'community' ? '💬' : '✨'}</span>
                  <span className="htitle">{h.title}</span>
                </button>
                <button className="hdel" onClick={() => deleteFromHistory(h.id)} aria-label="delete">
                  ✕
                </button>
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
