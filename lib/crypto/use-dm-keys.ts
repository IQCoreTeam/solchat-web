'use client';

/**
 * Hook for DM encryption key management.
 *
 * Registration is handled centrally by useUserInit right after account
 * initialization. This hook just exposes the cached pubHex and a way to
 * look up other users' pubkeys from the chain.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import {
  getOrDeriveKeypair,
  clearCachedKeypair,
  hasKeypair,
} from './dm-encryption';
import { lookupEncryptionKey } from './encryption-key';

export function useDmKeys() {
  const wallet = useAppWallet();
  const { connection } = useAppConnection();
  const [ready, setReady] = useState(false);
  const [pubHex, setPubHex] = useState<string | null>(null);
  const derivingRef = useRef(false);

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

  useEffect(() => {
    if (!wallet.connected) {
      clearCachedKeypair();
      setReady(false);
      setPubHex(null);
    }
  }, [wallet.connected]);

  const getRecipientPubKey = useCallback(
    async (walletAddress: string): Promise<string | null> => {
      return lookupEncryptionKey(connection, walletAddress);
    },
    [connection]
  );

  return {
    ready,
    pubHex,
    deriveKeys,
    getRecipientPubKey,
  };
}
