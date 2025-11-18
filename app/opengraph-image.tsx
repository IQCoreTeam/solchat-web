import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'SolChat - Decentralized Chat on Solana';
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
          backgroundColor: '#002100',
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(65, 255, 0, 0.15) 0%, transparent 50%),
            linear-gradient(rgba(65, 255, 0, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(65, 255, 0, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 50px 50px, 50px 50px',

        }}
      >
        {/* IQ Labs Logo - Simplified representation */}
        <div
          style={{
            fontSize: 180,
            fontWeight: 'bold',
            color: '#41FF00',
            textShadow: '0 0 80px rgba(65, 255, 0, 0.8), 0 0 120px rgba(0, 255, 34, 0.5), 0 0 160px rgba(65, 255, 0, 0.3)',
            letterSpacing: '0.15em',
            marginBottom: 40,
          }}
        >
          IQ
        </div>

        {/* SolChat Title */}
        <div
          style={{
            fontSize: 100,
            fontWeight: 'bold',
            color: '#41FF00',
            textShadow: '0 0 50px rgba(65, 255, 0, 0.9), 0 0 80px rgba(0, 255, 34, 0.6)',
            letterSpacing: '0.2em',
            marginTop: -20,
          }}
        >
          SOLCHAT
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: '#00FF22',
            opacity: 0.9,
            marginTop: 50,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          DECENTRALIZED · ON-CHAIN · WEB3
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
