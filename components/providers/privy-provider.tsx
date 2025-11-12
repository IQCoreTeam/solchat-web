'use client';

import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';
import { SOLANA_NETWORK } from '@/lib/constants';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export function PrivyProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set. Privy features will not work.');
  }

  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        // Automatically create Solana embedded wallets for users
        embeddedWallets: {
          solana: {
            createOnLogin: 'users-without-wallets',
          },
        },
        // Login methods
        loginMethods: ['wallet', 'email', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#22c55e', // Green to match SolChat theme
          landingHeader: 'Secure Your Private Wallet',
          loginMessage: 'Create a secure embedded wallet for private transactions',
          showWalletLoginFirst: true,
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
