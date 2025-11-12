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
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false, // For better UX
        },
        // Login methods
        loginMethods: ['wallet', 'email', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#22c55e', // Green to match SolChat theme
          logo: undefined,
          landingHeader: 'Secure Your Private Wallet',
          loginMessage: 'Create a secure embedded wallet for private transactions',
          showWalletLoginFirst: true,
        },
        // Solana configuration
        supportedChains: [
          SOLANA_NETWORK === 'mainnet-beta'
            ? {
                id: 'solana:mainnet',
                name: 'Solana Mainnet',
                network: 'mainnet-beta',
                rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
              }
            : {
                id: 'solana:devnet',
                name: 'Solana Devnet',
                network: 'devnet',
                rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://api.devnet.solana.com',
              },
        ],
        defaultChain:
          SOLANA_NETWORK === 'mainnet-beta'
            ? { id: 'solana:mainnet' as any }
            : { id: 'solana:devnet' as any },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
