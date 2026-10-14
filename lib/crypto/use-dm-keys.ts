'use client';

/**
 * Hook for DM encryption key management.
 *
 * Registration is handled centrally by useUserInit right after account
 * initialization. This hook just exposes the cached pubHex and a way to
 * look up other users' pubkeys from the chain.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppWallet } from '@/lib/wallet/use-app-wallet';
import {
  getOrDeriveKeypair,
  clearCachedKeypair,
} from './dm-encryption';

export function useDmKeys() {
  const wallet = useAppWallet();
  const [ready, setReady] = useState(false);
  const [pubHex, setPubHex] = useState<string | null>(null);
  const derivingRef = useRef(false);

  const walletAddress = wallet.publicKey?.toBase58() ?? null;
  const derivationGeneration = useRef(0);

  const deriveKeys = useCallback(async () => {
    if (!wallet.connected || !walletAddress || !wallet.signMessage || derivingRef.current) return;
    const generation = derivationGeneration.current;
    derivingRef.current = true;
    try {
      const kp = await getOrDeriveKeypair(walletAddress, wallet.signMessage);
      if (generation !== derivationGeneration.current) return;
      setPubHex(kp.pubHex);
      setReady(true);
    } catch (err) {
      if (generation === derivationGeneration.current) {
        console.error('[useDmKeys] Failed to derive keypair:', err);
      }
    } finally {
      if (generation === derivationGeneration.current) derivingRef.current = false;
    }
  }, [wallet.connected, walletAddress, wallet.signMessage]);

  useEffect(() => {
    derivationGeneration.current += 1;
    derivingRef.current = false;
    setReady(false);
    setPubHex(null);
    if (!wallet.connected) clearCachedKeypair();
  }, [wallet.connected, walletAddress]);

  return {
    ready,
    pubHex,
    deriveKeys,
  };
}
