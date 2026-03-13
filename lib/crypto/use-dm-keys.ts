'use client';

/**
 * Hook for DM encryption key management.
 *
 * - Derives X25519 keypair from wallet on first use
 * - Stores encryption pubkey in user profile metadata
 * - Looks up other users' encryption pubkeys from their profiles
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { getCachedAccountInfo } from '@/lib/rpc/cache';
import { readCodeIn } from '@/lib/gateway/reader';
import {
  getOrDeriveKeypair,
  clearCachedKeypair,
  hasKeypair,
} from './dm-encryption';

// Cache encryption pubkeys by wallet address
const encPubKeyCache = new Map<string, string>();

function extractMetadataFromAccount(data: Buffer): string {
  try {
    let offset = 8; // discriminator
    offset += 32; // owner
    if (offset + 4 > data.length) return '';
    const dataLen = data.readUInt32LE(offset);
    offset += 4 + dataLen;
    if (offset + 4 > data.length) return '';
    const metadataLen = data.readUInt32LE(offset);
    offset += 4;
    if (metadataLen <= 0 || offset + metadataLen > data.length) return '';
    return data.slice(offset, offset + metadataLen).toString('utf8').trim();
  } catch {
    return '';
  }
}

async function resolveProfileJson(
  connection: any,
  metadataStr: string
): Promise<Record<string, unknown> | null> {
  if (!metadataStr || metadataStr.length <= 2) return null;
  try {
    if (metadataStr.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadataStr)) {
      const result = await readCodeIn(metadataStr);
      if (!result?.data || result.data.startsWith('[unable')) return null;
      return JSON.parse(result.data);
    }
    return JSON.parse(metadataStr);
  } catch {
    return null;
  }
}

export function useDmKeys() {
  const { connection } = useAppConnection();
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
        const programId = iqlabs.contract.PROGRAM_ID;
        const userPk = new PublicKey(walletAddress);
        const userPda = iqlabs.contract.getUserPda(userPk, programId);
        const accountInfo = await getCachedAccountInfo(connection, userPda);
        if (!accountInfo?.data) return null;

        const metadataStr = extractMetadataFromAccount(Buffer.from(accountInfo.data));
        const profile = await resolveProfileJson(connection, metadataStr);
        if (!profile) return null;

        const encKey = profile.encryptionPubKey as string | undefined;
        if (encKey && typeof encKey === 'string' && encKey.length === 64) {
          encPubKeyCache.set(walletAddress, encKey);
          return encKey;
        }
        return null;
      } catch (err) {
        console.error('[useDmKeys] Failed to look up encryption key for', walletAddress, err);
        return null;
      }
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
