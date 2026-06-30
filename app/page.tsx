'use client';

import { useRef, useState } from 'react';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

type Meta = { product?: string; officialManual?: string; type?: string; confidence?: string };

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

// Pull the leading meta fenced block out of the model stream.
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
  const fileRef = useRef<HTMLInputElement>(null);

  const { meta, body, metaClosed } = splitMeta(raw);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(f);
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

  return (
    <div className="wrap">
      <div className="brand">
        <div className="logo">📘</div>
        <h1>ManualMind</h1>
      </div>
      <p className="tagline">
        A manual for <em>anything</em>. Type it, or snap a photo — ManualMind finds the official
        guide, or builds one in real time from Reddit and the web.
      </p>

      <div className="panel">
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
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button key={ex} className="chip" onClick={() => run(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      {(running || raw || error) && (
        <div className="stages">
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
        <div className="banner community" style={{ marginTop: 14 }}>
          <span className="ico">🔍</span>
          <div>
            <h3>Identified from your photo</h3>
            <p>{identified}</p>
          </div>
        </div>
      )}

      {error && <div className="err">{error}</div>}

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

      {body && (
        <div className="result">
          <div dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }} />
          {running && <span className="cursor" />}
        </div>
      )}

      <div className="footer">
        ManualMind · finds the real manual first, builds one when it can’t · powered by Claude
      </div>
    </div>
  );
}
