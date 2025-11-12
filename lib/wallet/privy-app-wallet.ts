'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useMemo } from 'react';
import { PublicKey } from '@solana/web3.js';

export interface PrivyAppWallet {
  publicKey: PublicKey;
  address: string;
  isReady: boolean;
  walletClient: any; // Privy wallet client for signing
}

/**
 * Hook to access Privy embedded Solana wallet as the app wallet
 * This provides secure Privy-managed wallet for privacy operations
 */
export function usePrivyAppWallet(): PrivyAppWallet | null {
  const { ready: privyReady, authenticated, user } = usePrivy();

  // Find the Solana embedded wallet from user's linked accounts
  const embeddedWallet = useMemo(() => {
    if (!user || !user.linkedAccounts) {
      console.log('🔍 No user or linkedAccounts:', { user: !!user, linkedAccounts: !!user?.linkedAccounts });
      return null;
    }

    console.log('🔍 Searching for Privy Solana wallet in linkedAccounts:', user.linkedAccounts.length);
    
    // Look for Privy embedded Solana wallet in linked accounts
    const solanaWallet = user.linkedAccounts.find(
      (account: any) => {
        const isMatch = account.type === 'wallet' &&
          account.walletClientType === 'privy' &&
          account.chainType === 'solana';
        
        console.log('🔍 Account:', {
          type: account.type,
          walletClientType: account.walletClientType,
          chainType: account.chainType,
          address: account.address?.slice(0, 8),
          isMatch
        });
        
        return isMatch;
      }
    ) as any;

    if (solanaWallet) {
      console.log('✅ Found Privy Solana wallet:', solanaWallet.address);
    } else {
      console.log('❌ No Privy Solana wallet found');
    }

    return solanaWallet || null;
  }, [user, user?.linkedAccounts]);

  if (!privyReady || !authenticated || !embeddedWallet) {
    console.log('🔍 usePrivyAppWallet returning null:', { privyReady, authenticated, hasEmbeddedWallet: !!embeddedWallet });
    return null;
  }

  return {
    publicKey: new PublicKey(embeddedWallet.address as string),
    address: embeddedWallet.address as string,
    isReady: true,
    walletClient: embeddedWallet, // Pass the full wallet for signing
  };
}

/**
 * Hook to get connected external Solana wallet (Phantom, Solflare, etc.)
 * This is used for funding operations
 */
export function useExternalSolanaWallet() {
  const { ready: privyReady } = usePrivy();
  const { wallets } = useWallets();

  // Find the first wallet (could be external or embedded, but useWallets returns connected wallets)
  const wallet = useMemo(() => {
    if (!wallets || wallets.length === 0) return null;
    // Return the first wallet for now
    return wallets[0] || null;
  }, [wallets]);

  if (!privyReady) {
    return null;
  }

  return wallet;
}

/**
 * Check if user has a Privy embedded wallet
 */
export function useHasPrivyWallet(): boolean {
  const { user } = usePrivy();

  return useMemo(() => {
    if (!user || !user.linkedAccounts) return false;

    return user.linkedAccounts.some(
      (account: any) =>
        account.type === 'wallet' &&
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    );
  }, [user]);
}
