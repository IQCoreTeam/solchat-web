'use client';

import React, { useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
  PhantomWalletAdapter,
  SolflareWalletAdapter,
  TorusWalletAdapter,
  LedgerWalletAdapter,
} from '@solana/wallet-adapter-wallets';
import { RPC_URL } from '@/lib/constants';
import { getMobileBrowserInfo } from '@/lib/wallet/mobile-detection';

// Import wallet adapter CSS
import '@solana/wallet-adapter-react-ui/styles.css';

export function SolanaWalletProvider({ children }: { children: React.ReactNode }) {
  // Configure supported wallets with mobile detection
  const wallets = useMemo(() => {
    if (typeof window === 'undefined') return [];

    const mobileInfo = getMobileBrowserInfo();

    // On mobile, prioritize mobile wallet adapters
    if (mobileInfo.isMobile) {
      console.log('Mobile browser detected:', mobileInfo);

      // For Phantom mobile browser, the PhantomWalletAdapter will automatically
      // detect and use the injected window.phantom.solana provider
      return [
        new PhantomWalletAdapter(),
        new SolflareWalletAdapter(),
        // Don't include Ledger or Torus on mobile as they don't work well
      ];
    }

    // Desktop wallets
    return [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ];
  }, []);

  // Always wrap in providers, even before mounted
  // This prevents WalletContext errors during hydration
  return (
    <ConnectionProvider endpoint={RPC_URL}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
