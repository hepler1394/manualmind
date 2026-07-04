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
          background: '#000000',
          color: '#ffffff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: 3, textTransform: 'uppercase' }}>
          ManualMind
        </div>
        <div
          style={{
            fontSize: 118,
            fontWeight: 800,
            lineHeight: 0.95,
            letterSpacing: -1,
            maxWidth: 1050,
            display: 'flex',
            textTransform: 'uppercase',
          }}
        >
          The manual for anything.
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: 26,
              color: '#ffffff',
              border: '2px solid #ffffff',
              padding: '12px 28px',
              borderRadius: 8,
              fontWeight: 500,
            }}
          >
            Official first · Community-tested · Sources cited
          </div>
          <div style={{ fontSize: 26, color: '#426188' }}>manualmind</div>
        </div>
      </div>
    ),
    size,
  );
}
