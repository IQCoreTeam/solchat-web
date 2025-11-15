import Link from 'next/link';
import Image from 'next/image';
import { Nav } from '@/components/layout/nav';

export default function Home() {
  return (
    <div className="h-screen overflow-hidden flex flex-col" style={{ background: 'rgb(0, 33, 0)' }}>
      <Nav />

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center justify-center gap-8">
          <div className="flex justify-center mb-6">
            <Image
              src="/iq_logo.svg"
              alt="IQ Labs Logo"
              width={96}
              height={96}
              className="h-24 w-auto"
              style={{
                filter: 'drop-shadow(rgb(0, 255, 34) 0px 0px 20px)',
                imageRendering: 'pixelated',
              }}
            />
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/chat"
            className="inline-flex items-center justify-center gap-2 px-12 py-4 font-bold text-xl rounded-none m-0 cursor-pointer transition-all hover:opacity-90 active:scale-95"
            style={{
              textShadow: 'rgb(65, 255, 0) 0px 0px 50px, rgb(0, 255, 34) 0px 0px 10px',
              fontFamily: 'monospace',
              backgroundColor: 'rgb(65, 255, 0)',
              color: 'rgb(0, 33, 0)',
              border: '2px solid rgb(65, 255, 0)',
              textDecoration: 'none',
            }}
          >
            <span className="flex items-center gap-2">
              &gt; [CHAT]
            </span>
          </Link>

          <Link
            href="/account"
            className="inline-flex items-center justify-center gap-2 px-8 py-3 text-lg rounded-none cursor-pointer transition-all hover:bg-[rgba(65,255,0,0.1)] active:scale-95"
            style={{
              borderColor: 'rgb(65, 255, 0)',
              color: 'rgb(65, 255, 0)',
              fontFamily: 'monospace',
              backgroundColor: 'transparent',
              border: '2px solid rgb(65, 255, 0)',
              textDecoration: 'none',
            }}
          >
            &gt; [ACCOUNT]
          </Link>
        </div>
        </div>
      </main>
    </div>
  );
}
