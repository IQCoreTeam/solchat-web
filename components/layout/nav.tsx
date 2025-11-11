'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/ui/wallet-button';

export function Nav() {
  const pathname = usePathname();

  const isActive = (path: string) => {
    return pathname === path;
  };

  return (
    <nav className="bg-black border-b-2 border-green-600 p-3 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Mobile layout */}
        <div className="flex flex-col gap-3 md:hidden">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-green-400 font-mono text-xl font-bold hover:text-green-300">
              ✦ SOLCHAT
            </Link>
            <WalletButton />
          </div>
          <div className="flex gap-2">
            <Link
              href="/chat"
              className={`flex-1 text-center font-mono px-3 py-2 border-2 text-sm transition-colors ${
                isActive('/chat')
                  ? 'border-green-400 text-green-400 bg-green-400/10'
                  : 'border-green-600 text-green-400 hover:border-green-400'
              }`}
            >
              [CHAT]
            </Link>
            <Link
              href="/account"
              className={`flex-1 text-center font-mono px-3 py-2 border-2 text-sm transition-colors ${
                isActive('/account')
                  ? 'border-green-400 text-green-400 bg-green-400/10'
                  : 'border-green-600 text-green-400 hover:border-green-400'
              }`}
            >
              [ACCOUNT]
            </Link>
          </div>
        </div>

        {/* Desktop layout */}
        <div className="hidden md:flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-green-400 font-mono text-2xl font-bold hover:text-green-300">
              ✦ SOLCHAT
            </Link>

            <div className="flex gap-4">
              <Link
                href="/chat"
                className={`font-mono px-4 py-2 border-2 transition-colors ${
                  isActive('/chat')
                    ? 'border-green-400 text-green-400 bg-green-400/10'
                    : 'border-green-600 text-green-400 hover:border-green-400'
                }`}
              >
                [CHAT]
              </Link>

              <Link
                href="/account"
                className={`font-mono px-4 py-2 border-2 transition-colors ${
                  isActive('/account')
                    ? 'border-green-400 text-green-400 bg-green-400/10'
                    : 'border-green-600 text-green-400 hover:border-green-400'
                }`}
              >
                [ACCOUNT]
              </Link>
            </div>
          </div>

          <WalletButton />
        </div>
      </div>
    </nav>
  );
}
