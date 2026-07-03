import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ManualMind — the manual for anything';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OgImage() {
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
        <div style={{ fontSize: 88, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2.5, maxWidth: 1000, display: 'flex' }}>
          The manual for anything.
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
            Official first · Reddit-tested · Sources cited
          </div>
          <div style={{ fontSize: 26, color: '#6e6e73' }}>manualmind</div>
        </div>
      </div>
    ),
    size,
  );
}
