'use client';

import { ReactNode } from 'react';
import { ReactQueryProvider } from './query-provider';
import {  ThemeProvider } from 'styled-components';
import { PrivyProvider } from './privy-provider';
import { SolanaWalletProvider } from './wallet-provider';
import { CacheProvider } from './cache-provider';
import { StyledComponentsRegistry } from './styled-components-registry';
import { VoiceCallProviderWrapper } from '../voice/VoiceCallProviderWrapper';
import solchatTheme from '../styles/solchatTheme'
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <StyledComponentsRegistry>
      <ThemeProvider theme={solchatTheme}>
        <CacheProvider>
          <SolanaWalletProvider>
            <PrivyProvider>
              <ReactQueryProvider>
                <VoiceCallProviderWrapper>
                  {children}
                </VoiceCallProviderWrapper>
              </ReactQueryProvider>
            </PrivyProvider>
          </SolanaWalletProvider>
        </CacheProvider>
      </ThemeProvider>
    </StyledComponentsRegistry>
  );
}
