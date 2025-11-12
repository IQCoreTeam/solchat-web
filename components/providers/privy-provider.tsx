'use client';

import { PrivyProvider as BasePrivyProvider } from '@privy-io/react-auth';
import { type ReactNode } from 'react';

const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID || '';
const PRIVY_CLIENT_ID = process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || '';

export function PrivyProvider({ children }: { children: ReactNode }) {
  if (!PRIVY_APP_ID) {
    console.warn('NEXT_PUBLIC_PRIVY_APP_ID is not set. Privy features will not work.');
  }
  
  if (!PRIVY_CLIENT_ID) {
    console.warn('NEXT_PUBLIC_PRIVY_CLIENT_ID is not set. Using appId only.');
  }

  return (
    <BasePrivyProvider
      appId={PRIVY_APP_ID}
      clientId={PRIVY_CLIENT_ID || undefined}
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
