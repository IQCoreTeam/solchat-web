'use client';

import { ReactNode } from 'react';
import { ReactQueryProvider } from './query-provider';
import { ThemeProvider } from './theme-provider';
import { PrivyProvider } from './privy-provider';
import { SolanaWalletProvider } from './wallet-provider';
import { CacheProvider } from './cache-provider';
import { StyledComponentsRegistry } from './styled-components-registry';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StyledComponentsRegistry>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <CacheProvider>
          <SolanaWalletProvider>
            <PrivyProvider>
              <ReactQueryProvider>
                {children}
              </ReactQueryProvider>
            </PrivyProvider>
          </SolanaWalletProvider>
        </CacheProvider>
      </ThemeProvider>
    </StyledComponentsRegistry>
  );
}
