'use client';

import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { toSolanaWalletConnectors } from '@privy-io/react-auth/solana';
import { type ReactNode } from 'react';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export function PrivyProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    console.error('❌ NEXT_PUBLIC_PRIVY_APP_ID is not set. Privy features will not work.');
    console.error('Please add NEXT_PUBLIC_PRIVY_APP_ID to your .env.local file');
    return <>{children}</>;
  }

  // Only log on client side, not during SSR
  if (typeof window !== 'undefined') {
    console.log('✅ Privy Provider initializing with App ID:', PRIVY_APP_ID.slice(0, 10) + '...');
  }

  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
        accentColor: '#75e74f', // IQ Labs green
        theme: '#222224', // Dark theme
        showWalletLoginFirst: false, // Email/SMS first - prefer email/SMS for Privy auth
        logo: 'https://iqlabs.dev/assets/iq_logo.svg',
        walletChainType: 'solana-only',
      },
      // Prefer email/SMS for Privy authentication (embedded wallet creation)
      // Users should connect their main wallet through the standard wallet adapter first
      // But wallet login is available as a secondary option
      loginMethods: ['email', 'sms', 'wallet'],
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true, // MoonPay sandbox for testing
          },
        },
        embeddedWallets: {
          showWalletUIs: false, // Disable confirmation modals for auto-signing
          solana: {
            createOnLogin: 'all-users', // Always create embedded wallet for private transactions
          },
        },
        externalWallets: {
          solana: {
            connectors: toSolanaWalletConnectors({
              // Don't auto-connect to avoid annoying popups on page load
              shouldAutoConnect: false,
            }),
          },
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
