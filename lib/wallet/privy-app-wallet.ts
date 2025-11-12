'use client';

import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth';
import { useMemo, useCallback, useEffect, useState } from 'react';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

export interface PrivyAppWallet {
  publicKey: PublicKey;
  address: string;
  isReady: boolean;
  isCreating: boolean;
  exportPrivateKey: () => Promise<string | null>;
  createWallet: () => Promise<void>;
}

/**
 * Hook to access Privy embedded wallet as the app wallet
 * This replaces the localStorage-based app wallet with secure Privy-managed wallet
 */
export function usePrivyAppWallet(): PrivyAppWallet | null {
  const { ready: privyReady, authenticated, user, exportWallet } = usePrivy();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const [isCreating, setIsCreating] = useState(false);

  // Find the first Solana embedded wallet
  const embeddedWallet = useMemo(() => {
    if (!wallets) return null;
    return wallets.find(
      (wallet) => 
        wallet.walletClientType === 'privy' && 
        wallet.chainType === 'solana'
    );
  }, [wallets]);

  const handleCreateWallet = useCallback(async () => {
    if (!authenticated || isCreating) return;
    
    try {
      setIsCreating(true);
      await createWallet();
    } catch (error) {
      console.error('Failed to create Privy wallet:', error);
      throw error;
    } finally {
      setIsCreating(false);
    }
  }, [authenticated, createWallet, isCreating]);

  const handleExportPrivateKey = useCallback(async (): Promise<string | null> => {
    if (!embeddedWallet || !user) return null;

    try {
      // Export wallet returns the private key
      const exported = await exportWallet();
      return exported || null;
    } catch (error) {
      console.error('Failed to export Privy wallet:', error);
      return null;
    }
  }, [embeddedWallet, user, exportWallet]);

  if (!privyReady || !authenticated || !embeddedWallet) {
    return null;
  }

  return {
    publicKey: new PublicKey(embeddedWallet.address),
    address: embeddedWallet.address,
    isReady: true,
    isCreating,
    exportPrivateKey: handleExportPrivateKey,
    createWallet: handleCreateWallet,
  };
}

/**
 * Get a Keypair object from Privy wallet for Cloak SDK usage
 * Note: This requires exporting the private key, which should be done carefully
 */
export async function getPrivyWalletAsKeypair(
  exportPrivateKey: () => Promise<string | null>
): Promise<Keypair | null> {
  try {
    const privateKeyString = await exportPrivateKey();
    if (!privateKeyString) return null;

    // Parse the private key (could be base58 or hex)
    let secretKey: Uint8Array;
    try {
      // Try base58 first
      secretKey = bs58.decode(privateKeyString);
    } catch {
      // Try hex
      secretKey = Uint8Array.from(Buffer.from(privateKeyString, 'hex'));
    }

    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    console.error('Failed to convert Privy wallet to Keypair:', error);
    return null;
  }
}
