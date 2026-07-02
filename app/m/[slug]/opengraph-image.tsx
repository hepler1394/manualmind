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
      : 'AI-synthesized manual';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'linear-gradient(135deg, #0b0d12 0%, #161a24 60%, #1b2335 100%)',
          color: '#e7eaf0',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6ea8fe, #a78bfa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
            }}
          >
            📘
          </div>
          <div style={{ fontSize: 40, fontWeight: 700 }}>ManualMind</div>
        </div>

        <div
          style={{
            fontSize: title.length > 60 ? 52 : 64,
            fontWeight: 700,
            lineHeight: 1.15,
            maxWidth: 1040,
            display: 'flex',
          }}
        >
          {title.length > 110 ? title.slice(0, 107) + '…' : title}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: 28,
              color: '#0b0d12',
              background: 'linear-gradient(135deg, #6ea8fe, #a78bfa)',
              padding: '12px 28px',
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            {kind}
          </div>
          <div style={{ fontSize: 26, color: '#9aa3b2' }}>Step-by-step · Sources cited</div>
        </div>
      </div>
    ),
    size,
  );
}
