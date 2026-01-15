/**
 * Friends Data Hook
 * - Fetch and manage friends list from blockchain
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk/src';
import idl from 'iqlabs-sdk/idl/code_in.json';
import type { Friend } from './types';
import { STATUS_LABELS } from './types';
import { bytesToHex } from './utils';
import { ROOT_ID } from '@/lib/iqlabs/constants';

export interface UseFriendsParams {
  connection: Connection;
  userAddress: string | undefined;
}

export interface UseFriendsReturn {
  friends: Friend[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch and manage friends list
 */
export function useFriends(params: UseFriendsParams): UseFriendsReturn {
  const { connection, userAddress } = params;

  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFriends = useCallback(async () => {
    if (!userAddress) {
      console.log('[useFriends] No user address');
      setFriends([]);
      return;
    }

    console.log('[useFriends] Fetching friends for:', userAddress);
    setLoading(true);
    setError(null);

    try {
      const programPubkey = iqlabs.contract.getProgramId();
      const accCoder = new BorshAccountsCoder(idl as any);
      const dbRootId = Buffer.from(ROOT_ID, 'utf8');
      const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, programPubkey);

      const connectionAccounts = await connection.getProgramAccounts(programPubkey);

      console.log('[useFriends] Found', connectionAccounts.length, 'connection accounts');

      const friendsList: Friend[] = [];

      for (const { account, pubkey } of connectionAccounts) {
        try {
          const decoded = accCoder.decode('Connection', account.data) as any;

          if (!decoded) continue;

          const partyA = new PublicKey(decoded.party_a).toBase58();
          const partyB = new PublicKey(decoded.party_b).toBase58();

          // Only include if user is one of the parties
          if (partyA !== userAddress && partyB !== userAddress) {
            continue;
          }

          const friendAddress = partyA === userAddress ? partyB : partyA;

          const dmSeed = iqlabs.utils.deriveDmSeed(partyA, partyB);
          const expected = iqlabs.contract.getConnectionTablePda(
            dbRoot,
            dmSeed,
            programPubkey
          );
          const actualAddress = pubkey.toBase58();
          if (!expected.equals(pubkey)) {
            console.warn('[useFriends] PDA mismatch, skipping account:', {
              expected: expected.toBase58(),
              actual: actualAddress,
            });
            continue;
          }

          const dmSeedHex = bytesToHex(dmSeed);

          const status = STATUS_LABELS[decoded.status] || 'pending';
          const lastTimestampRaw = (decoded as any).last_timestamp ?? (decoded as any).lastTimestamp ?? 0;
          const lastTimestamp = typeof lastTimestampRaw === 'number'
            ? lastTimestampRaw
            : Number(lastTimestampRaw || 0);

          friendsList.push({
            address: friendAddress,
            status,
            requester: decoded.requester,
            blocker: decoded.blocker,
            dmSeed,
            dmSeedHex,
            tableAddress: actualAddress,
            partyA,
            partyB,
            lastTimestamp,
          });
        } catch (decodeErr) {
          console.warn('[useFriends] Failed to decode Connection:', decodeErr);
        }
      }

      console.log('[useFriends] Loaded', friendsList.length, 'friends');
      setFriends(friendsList);
    } catch (err) {
      console.error('[useFriends] Error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load friends';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [connection, userAddress]);

  useEffect(() => {
    fetchFriends();
  }, [fetchFriends]);

  return {
    friends,
    loading,
    error,
    refetch: fetchFriends,
  };
}
