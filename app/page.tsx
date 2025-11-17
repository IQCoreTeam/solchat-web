'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Nav } from '@/components/layout/nav';
import { ThemeProvider } from 'styled-components';
import { Button } from 'react95';
import matrix from 'react95/dist/themes/matrix';

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

          <ThemeProvider theme={matrix}>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/chat" passHref legacyBehavior>
                <Button
                  as="a"
                  primary
                  size="lg"
                  className="inline-flex items-center justify-center gap-2 px-12 py-4 font-bold text-xl m-0 cursor-pointer transition-all hover:opacity-90 active:scale-95"
                  style={{
                    fontFamily: 'monospace',
                  }}
                >
                  <span className="flex items-center gap-2">&gt; [CHAT]</span>
                </Button>
              </Link>

              <Link href="/account" passHref legacyBehavior>
                <Button
                  as="a"
                  size="md"
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 text-lg cursor-pointer transition-all hover:opacity-90 active:scale-95"
                  style={{
                    fontFamily: 'monospace',
                  }}
                >
                  &gt; [ACCOUNT]
                </Button>
              </Link>
            </div>
          </ThemeProvider>
        </div>
      </main>
    </div>
  );
}
