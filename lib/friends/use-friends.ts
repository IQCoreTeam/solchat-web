/**
 * Friends Data Hook
 * - Fetch and manage friends list from blockchain
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PublicKey, Connection } from '@solana/web3.js';
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import bs58 from 'bs58';
import type { Friend } from './types';
import { STATUS_LABELS } from './types';
import { deriveDmSeed, bytesToHex } from './utils';
import { pdaRoot, pdaDmTable } from '@/lib/onchainDB';

/**
 * DMTable discriminator from IDL
 * This matches the on-chain account discriminator
 */
const DM_TABLE_DISCRIMINATOR = [201, 69, 61, 7, 52, 109, 58, 56];

export interface UseFriendsParams {
  connection: Connection;
  userAddress: string | undefined;
  programId: string;
  idl: Idl;
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
  const { connection, userAddress, programId, idl } = params;

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
      const programPubkey = new PublicKey(programId);
      const accCoder = new BorshAccountsCoder(idl);

      // Fetch all DMTable accounts
      const dmTableAccounts = await connection.getProgramAccounts(programPubkey, {
        filters: [
          {
            memcmp: {
              offset: 0,
              bytes: bs58.encode(Buffer.from(DM_TABLE_DISCRIMINATOR)),
            },
          },
        ],
      });

      console.log('[useFriends] Found', dmTableAccounts.length, 'DMTable accounts');

      const friendsList: Friend[] = [];
      // Use the same ROOT_ID that's used in the app
      const ROOT_ID = process.env.NEXT_PUBLIC_ROOT_ID || 'solchat-root';
      const rootPda = pdaRoot(ROOT_ID);

      for (const { account, pubkey } of dmTableAccounts) {
        try {
          const decoded = accCoder.decode('DMTable', account.data);
          if (!decoded) continue;

          const partyA = new PublicKey(decoded.party_a).toBase58();
          const partyB = new PublicKey(decoded.party_b).toBase58();

          // Only include if user is one of the parties
          if (partyA !== userAddress && partyB !== userAddress) {
            continue;
          }

          const friendAddress = partyA === userAddress ? partyB : partyA;

          // Derive the seed and verify it matches the PDA
          const dmSeed = deriveDmSeed(partyA, partyB);
          const expectedPda = pdaDmTable(rootPda, dmSeed);

          // Verify the PDA matches - if not, skip this account
          if (expectedPda.toBase58() !== pubkey.toBase58()) {
            console.warn('[useFriends] PDA mismatch, skipping account:', {
              expected: expectedPda.toBase58(),
              actual: pubkey.toBase58(),
            });
            continue;
          }

          const dmSeedHex = bytesToHex(dmSeed);

          // Map status number to label
          const status = STATUS_LABELS[decoded.status] || 'pending';

          friendsList.push({
            address: friendAddress,
            status,
            requester: decoded.requester,
            blocker: decoded.blocker,
            dmSeed,
            dmSeedHex,
            tableAddress: pubkey.toBase58(),
            partyA,
            partyB,
          });
        } catch (decodeErr) {
          console.warn('[useFriends] Failed to decode DMTable:', decodeErr);
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
  }, [connection, userAddress, programId, idl]);

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
