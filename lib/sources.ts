// Shared source fetchers used by the live engine (/api/manual) and the
// background auto-library cron (/api/cron/autolibrary).

export type RedditPost = { title: string; subreddit: string; score: number; url: string; body: string };
export type Video = { id: string; title: string };

export async function fetchReddit(query: string): Promise<RedditPost[]> {
  try {
    const q = encodeURIComponent(query + ' how to OR manual OR guide OR fix OR setup');
    const url = 'https://www.reddit.com/search.json?q=' + q + '&sort=relevance&limit=12&t=all';
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ManualMind/1.0 (manual finder)' },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data: any = await res.json();
    const children = (data && data.data && data.data.children) || [];
    return children
      .map((c: any) => c.data)
      .filter((d: any) => d && !d.over_18)
      .sort((a: any, b: any) => (b.score || 0) - (a.score || 0))
      .slice(0, 8)
      .map((d: any) => ({
        title: d.title || '',
        subreddit: d.subreddit_name_prefixed || ('r/' + (d.subreddit || '')),
        score: d.score || 0,
        url: 'https://www.reddit.com' + (d.permalink || ''),
        body: (d.selftext || '').slice(0, 1200),
      }));
  } catch {
    return [];
  }
}

// Scrapes YouTube's search results page (no API key needed).
export async function fetchYouTube(query: string): Promise<Video[]> {
  try {
    const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const html = (await res.text()).slice(0, 900_000);
    const out: Video[] = [];
    const seen = new Set<string>();
    const re = /"videoRenderer":\{"videoId":"([\w-]{11})"[\s\S]{0,2000}?"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    const seenTitles = new Set<string>();
    while ((m = re.exec(html)) && out.length < 6) {
      if (seen.has(m[1])) continue;
      seen.add(m[1]);
      try {
        const title = JSON.parse('"' + m[2] + '"');
        const norm = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
        if (seenTitles.has(norm)) continue; // near-duplicate uploads of the same tutorial
        seenTitles.add(norm);
        out.push({ id: m[1], title });
      } catch {}
    }
    return out;
  } catch {
    return [];
  }
}

export function redditContextOf(reddit: RedditPost[]): string {
  return reddit.length > 0
    ? reddit
        .map(
          (p, i) =>
            '[' + (i + 1) + '] ' + p.title + ' (' + p.subreddit + ', ' + p.score +
            ' upvotes) ' + p.url +
            (p.body ? ('\n    ' + p.body.replace(/\s+/g, ' ').slice(0, 600)) : ''),
        )
        .join('\n')
    : '(no community threads found)';
}

export function youtubeContextOf(videos: Video[]): string {
  return videos.length > 0
    ? videos
        .map((v, i) => '[' + (i + 1) + '] ' + v.title + ' — https://www.youtube.com/watch?v=' + v.id)
        .join('\n')
    : '(no video tutorials found)';
}

export function splitMetaBlock(raw: string): { meta: any; body: string } {
  const fence = '```meta';
  const start = raw.indexOf(fence);
  if (start < 0) return { meta: null, body: raw };
  const afterTag = start + fence.length;
  const end = raw.indexOf('```', afterTag);
  if (end < 0) return { meta: null, body: '' };
  let meta: any = null;
  try {
    meta = JSON.parse(raw.slice(afterTag, end).trim());
  } catch {}
  return { meta, body: raw.slice(end + 3).replace(/^\s+/, '') };
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
