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
          background: 'linear-gradient(135deg, #ffffff 0%, #f2f3fb 55%, #ece9fb 100%)',
          color: '#0f172a',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 7v14" />
              <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
            </svg>
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
              color: '#ffffff',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              padding: '12px 28px',
              borderRadius: 999,
              fontWeight: 700,
            }}
          >
            {kind}
          </div>
          <div style={{ fontSize: 26, color: '#5b6478' }}>Step-by-step · Sources cited</div>
        </div>
      </div>
    ),
    size,
  );
}
