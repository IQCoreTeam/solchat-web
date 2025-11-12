'use client';

import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';

export function PrivyProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    console.error('❌ NEXT_PUBLIC_PRIVY_APP_ID is not set. Privy features will not work.');
    console.error('Please add NEXT_PUBLIC_PRIVY_APP_ID to your .env.local file');
    return <>{children}</>;
  }

  console.log('✅ Privy Provider initializing with App ID:', PRIVY_APP_ID.slice(0, 10) + '...');

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
          ethereum: {
            createOnLogin: 'off', // No Ethereum wallets
          },
          solana: {
            createOnLogin: 'users-without-wallets', // Auto-create Solana wallet
          },
        },
        mfa: {
          noPromptOnMfaRequired: false,
        },
        // Solana configuration will use default RPC settings
      }}
    >
      {children}
    </BasePrivyProvider>
  );
}
