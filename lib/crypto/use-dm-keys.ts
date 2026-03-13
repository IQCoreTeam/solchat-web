'use client';

/**
 * Hook for DM encryption key management.
 *
 * - Derives X25519 keypair from wallet on first use
 * - Stores encryption pubkey in user profile metadata
 * - Looks up other users' encryption pubkeys from their profiles
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppWallet } from '@/lib/wallet/use-app-wallet';
import { getUserProfile } from '@/lib/gateway/reader';
import {
  getOrDeriveKeypair,
  clearCachedKeypair,
  hasKeypair,
} from './dm-encryption';

// Cache encryption pubkeys by wallet address
const encPubKeyCache = new Map<string, string>();

function isValidEncKey(key: unknown): key is string {
  return typeof key === 'string' && key.length === 64 && /^[0-9a-f]+$/i.test(key);
}

export function useDmKeys() {
  const wallet = useAppWallet();
  const [ready, setReady] = useState(false);
  const [pubHex, setPubHex] = useState<string | null>(null);
  const derivingRef = useRef(false);

  // Derive keypair when wallet connects
  const deriveKeys = useCallback(async () => {
    if (!wallet.connected || !wallet.signMessage || derivingRef.current) return;
    if (hasKeypair()) {
      const kp = await getOrDeriveKeypair(wallet.signMessage);
      setPubHex(kp.pubHex);
      setReady(true);
      return;
    }

    derivingRef.current = true;
    try {
      const kp = await getOrDeriveKeypair(wallet.signMessage);
      setPubHex(kp.pubHex);
      setReady(true);
    } catch (err) {
      console.error('[useDmKeys] Failed to derive keypair:', err);
    } finally {
      derivingRef.current = false;
    }
  }, [wallet.connected, wallet.signMessage]);

  // Clear on disconnect
  useEffect(() => {
    if (!wallet.connected) {
      clearCachedKeypair();
      setReady(false);
      setPubHex(null);
    }
  }, [wallet.connected]);

  // Look up another user's encryption pubkey from their profile metadata
  const getRecipientPubKey = useCallback(
    async (walletAddress: string): Promise<string | null> => {
      const cached = encPubKeyCache.get(walletAddress);
      if (cached) return cached;

      try {
        const profile = await getUserProfile(walletAddress);
        if (isValidEncKey(profile?.encryptionPubKey)) {
          encPubKeyCache.set(walletAddress, profile.encryptionPubKey);
          return profile.encryptionPubKey;
        }
        return null;
      } catch (err) {
        console.error('[useDmKeys] Failed to look up encryption key for', walletAddress, err);
        return null;
      }
    },
    []
  );

  return {
    ready,
    pubHex,
    deriveKeys,
    getRecipientPubKey,
  };
}
