/**
 * Friends Data Hook
 * - Fetch and manage friends list from blockchain
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import iqlabs from 'iqlabs-sdk/src';
import type { Friend, FriendStatus } from './types';

export interface UseFriendsParams {
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
  const { userAddress } = params;

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
      const connections = await iqlabs.reader.fetchUserConnections(userAddress, {
        speed: 'medium',
      });

      console.log('[useFriends] Found', connections.length, 'connections');

      const friendsList: Friend[] = connections.map((conn) => {
        const friendAddress = conn.partyA === userAddress ? conn.partyB : conn.partyA;
        const dmSeed = iqlabs.utils.deriveDmSeed(conn.partyA, conn.partyB);
        const dmSeedHex = Buffer.from(dmSeed).toString('hex');

        const requester = conn.requester === 'a' ? 0 : 1;
        const blocker = conn.blocker === 'a' ? 0 : conn.blocker === 'b' ? 1 : 255;

        return {
          address: friendAddress,
          status: conn.status as FriendStatus,
          requester,
          blocker,
          dmSeed,
          dmSeedHex,
          tableAddress: conn.connectionPda,
          partyA: conn.partyA,
          partyB: conn.partyB,
          dbRootId: conn.dbRootId,
          lastTimestamp: conn.timestamp,
        };
      });

      console.log('[useFriends] Loaded', friendsList.length, 'friends');
      setFriends(friendsList);
    } catch (err) {
      console.error('[useFriends] Error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Failed to load friends';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

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
