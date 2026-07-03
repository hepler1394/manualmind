import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ManualMind manual';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getManual(slug: string): Promise<{ title: string; type: string | null } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      url + '/rest/v1/manuals?public_slug=eq.' + encodeURIComponent(slug) + '&select=title,type',
      { headers: { apikey: key, Authorization: 'Bearer ' + key } },
    );
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    return null;
  }
}

export default async function OgImage({ params }: { params: { slug: string } }) {
  const manual = await getManual(params.slug);
  const title = manual?.title || 'A manual for anything';
  const kind =
    manual?.type === 'official' ? 'Official manual'
      : manual?.type === 'community' ? 'Community-sourced manual'
      : 'AI-built manual';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 76,
          background: '#f5f5f7',
          color: '#1d1d1f',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 38, fontWeight: 700, letterSpacing: -1 }}>ManualMind</div>

        <div
          style={{
            fontSize: title.length > 60 ? 54 : 66,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1.5,
            maxWidth: 1040,
            display: 'flex',
          }}
        >
          {title.length > 110 ? title.slice(0, 107) + '…' : title}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: 26,
              color: '#ffffff',
              background: '#0071e3',
              padding: '12px 28px',
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            {kind}
          </div>
          <div style={{ fontSize: 26, color: '#6e6e73' }}>Step-by-step · Sources cited</div>
        </div>
      </div>
    ),
    size,
  );
}
