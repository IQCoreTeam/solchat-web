import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'Whisper - Encrypted Messaging for People Who Care';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0A0A0F',
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(108, 77, 255, 0.15) 0%, transparent 50%),
            linear-gradient(rgba(108, 77, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(108, 77, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 50px 50px, 50px 50px',
        }}
      >
        {/* Whisper Logo */}
        <svg width="180" height="180" viewBox="0 0 100 100" style={{ marginBottom: 40 }}>
          <defs>
            <linearGradient id="tw-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: '#6C4DFF' }} />
              <stop offset="50%" style={{ stopColor: '#7A8CFF' }} />
              <stop offset="100%" style={{ stopColor: '#00E0E0' }} />
            </linearGradient>
          </defs>
          <path
            d="M50 10 C 27.9 10 10 27.9 10 50 C 10 72.1 27.9 90 50 90 C 55 90 59.8 89.1 64.3 87.4 C 49.7 80.5 40 65.8 40 48.5 C 40 28.1 54.5 11.5 73 8.5 C 66.3 8.9 58.3 10 50 10 Z"
            fill="url(#tw-gradient)"
          />
        </svg>

        {/* Whisper Title */}
        <div
          style={{
            fontSize: 100,
            fontWeight: 'bold',
            background: 'linear-gradient(to right, #6C4DFF, #7A8CFF, #00E0E0)',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 50px rgba(108, 77, 255, 0.9), 0 0 80px rgba(122, 140, 255, 0.6)',
            letterSpacing: '0.2em',
            marginTop: -20,
          }}
        >
          WHISPER
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: '#F2F3F7',
            opacity: 0.9,
            marginTop: 50,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          PRIVACY ISN'T OPTIONAL
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
