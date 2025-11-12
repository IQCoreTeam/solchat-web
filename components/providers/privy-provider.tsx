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
          showWalletLoginFirst: false, // Email/SMS first
          logo: 'https://iqlabs.dev/assets/iq_logo.svg',
          walletChainType: 'solana-only',
          walletList: [
            'detected_solana_wallets',
            'phantom',
            'solflare',
            'backpack',
            'okx_wallet',
          ],
        },
        loginMethods: ['email', 'wallet', 'sms'],
        fundingMethodConfig: {
          moonpay: {
            useSandbox: true, // MoonPay sandbox for testing
          },
        },
        embeddedWallets: {
          showWalletUIs: true,
          solana: {
            createOnLogin: 'users-without-wallets',
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
