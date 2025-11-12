'use client';

import { ReactNode } from 'react';
import { ReactQueryProvider } from './query-provider';
import { SolanaWalletProvider } from './wallet-provider';
import { ThemeProvider } from './theme-provider';
import { PrivyProvider } from './privy-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <PrivyProvider>
        <ReactQueryProvider>
          <SolanaWalletProvider>{children}</SolanaWalletProvider>
        </ReactQueryProvider>
      </PrivyProvider>
    </ThemeProvider>
  );
}
