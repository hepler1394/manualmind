'use client';

import { useEffect, useMemo, useState } from 'react';

export type LibraryManual = {
  slug: string;
  title: string;
  type: string | null;
  published_at: string | null;
  verified: boolean;
};

const SAVED_KEY = 'mm_saved_public_manuals_v1';

function typeLabel(type?: string | null): string {
  return type === 'official' ? 'Official' : type === 'community' ? 'Community' : 'AI-built';
}

export default function LibraryExplorer({ manuals }: { manuals: LibraryManual[] }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('newest');
  const [saved, setSaved] = useState<string[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);

  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
      if (Array.isArray(value)) setSaved(value.filter((item) => typeof item === 'string'));
    } catch {}
  }, []);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const next = manuals.filter((manual) => {
      if (type !== 'all' && (manual.type || 'synthesized') !== type) return false;
      if (savedOnly && !saved.includes(manual.slug)) return false;
      return !needle || manual.title.toLowerCase().includes(needle);
    });
    return next.toSorted((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title);
      if (sort === 'verified') return Number(b.verified) - Number(a.verified) || a.title.localeCompare(b.title);
      return (b.published_at || '').localeCompare(a.published_at || '');
    });
  }, [manuals, query, saved, savedOnly, sort, type]);

  function toggleSaved(slug: string) {
    setSaved((current) => {
      const next = current.includes(slug) ? current.filter((item) => item !== slug) : [slug, ...current];
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  return (
    <section className="library-explorer" aria-label="Manual library">
      <div className="library-tools">
        <label className="library-search">
          <span>Find a manual</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Product, error code, task…"
            autoComplete="off"
          />
        </label>
        <label>
          <span>Source</span>
          <select value={type} onChange={(event) => setType(event.target.value)}>
            <option value="all">All manuals</option>
            <option value="official">Official</option>
            <option value="community">Community</option>
            <option value="synthesized">AI-built</option>
          </select>
        </label>
        <label>
          <span>Order</span>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="newest">Newest first</option>
            <option value="verified">Verified first</option>
            <option value="title">A to Z</option>
          </select>
        </label>
        <button
          type="button"
          className={'saved-filter' + (savedOnly ? ' active' : '')}
          onClick={() => setSavedOnly((value) => !value)}
          aria-pressed={savedOnly}
        >
          Saved <span>{saved.length}</span>
        </button>
      </div>

      <div className="library-count" aria-live="polite">
        {results.length} {results.length === 1 ? 'manual' : 'manuals'}
        {query.trim() ? ` matching “${query.trim()}”` : ''}
      </div>

      {results.length === 0 ? (
        <div className="library-zero">
          <strong>No manuals on this shelf.</strong>
          <p>Clear a filter, or build the missing manual and publish it for the next person.</p>
          <button type="button" onClick={() => { setQuery(''); setType('all'); setSavedOnly(false); }}>
            Reset filters
          </button>
        </div>
      ) : (
        <div className="postergrid library-grid">
          {results.map((manual) => {
            const isSaved = saved.includes(manual.slug);
            return (
              <article key={manual.slug} className="poster-shell">
                <a className="poster" href={'/m/' + manual.slug}>
                  <span className="poster-letter" aria-hidden="true">
                    {(manual.title || 'M').trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="poster-type">{manual.verified ? '✓ ' : ''}{typeLabel(manual.type)} manual</span>
                  <span className="poster-title">{manual.title}</span>
                  {manual.published_at && <span className="poster-sub">Published {manual.published_at.slice(0, 10)}</span>}
                </a>
                <button
                  type="button"
                  className={'poster-save' + (isSaved ? ' active' : '')}
                  onClick={() => toggleSaved(manual.slug)}
                  aria-pressed={isSaved}
                  aria-label={(isSaved ? 'Remove from saved: ' : 'Save for later: ') + manual.title}
                >
                  {isSaved ? 'Saved' : 'Save'}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
