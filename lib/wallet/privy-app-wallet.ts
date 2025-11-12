'use client';

import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import { useMemo, useCallback, useState } from 'react';
import { PublicKey } from '@solana/web3.js';

export interface PrivyAppWallet {
  publicKey: PublicKey;
  address: string;
  isReady: boolean;
  isCreating: boolean;
  walletClient: any; // Privy wallet client for signing
  createWallet: () => Promise<void>;
}

/**
 * Hook to access Privy embedded Solana wallet as the app wallet
 * This replaces the localStorage-based app wallet with secure Privy-managed wallet
 */
export function usePrivyAppWallet(): PrivyAppWallet | null {
  const { ready: privyReady, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreating, setIsCreating] = useState(false);

  // Find the first Solana embedded wallet
  const embeddedWallet = useMemo(() => {
    if (!wallets || wallets.length === 0) return null;
    
    // Look for Solana embedded wallet (Privy creates these automatically)
    const solanaWallet = wallets.find(
      (wallet) => 
        wallet.walletClientType === 'privy' && 
        // Solana addresses are typically 32-44 characters base58
        wallet.address && 
        wallet.address.length > 30 &&
        !wallet.address.startsWith('0x') // Not an Ethereum address
    );
    
    return solanaWallet || null;
  }, [wallets]);

  const handleCreateWallet = useCallback(async () => {
    if (isCreating) return;
    
    if (!authenticated) {
      // If not authenticated, trigger login first
      await login();
      return;
    }
    
    try {
      setIsCreating(true);
      await createWallet();
    } catch (error) {
      console.error('Failed to create Privy wallet:', error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [authenticated, createWallet, isCreating, login]);

  if (!privyReady) {
    return null;
  }

  // If authenticated but no wallet yet, return partial state
  if (authenticated && !embeddedWallet) {
    return null;
  }

  if (!embeddedWallet) {
    return null;
  }

  return {
    publicKey: new PublicKey(embeddedWallet.address),
    address: embeddedWallet.address,
    isReady: true,
    isCreating,
    walletClient: embeddedWallet, // Pass the full wallet for signing
    createWallet: handleCreateWallet,
  };
}

/**
 * Check if user has a Privy wallet
 */
export function useHasPrivyWallet(): boolean {
  const { wallets } = useWallets();
  
  return useMemo(() => {
    if (!wallets || wallets.length === 0) return false;
    
    return wallets.some(
      (wallet) => 
        wallet.walletClientType === 'privy' && 
        wallet.address && 
        wallet.address.length > 30 &&
        !wallet.address.startsWith('0x')
    );
  }, [wallets]);
}
