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
    if (!user || !user.linkedAccounts) return null;

    // Look for Privy embedded Solana wallet in linked accounts
    const solanaWallet = user.linkedAccounts.find(
      (account: any) =>
        account.type === 'wallet' &&
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    ) as any;

    return solanaWallet || null;
  }, [user]);

  if (!privyReady || !authenticated || !embeddedWallet) {
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
