/**
 * Hook to fetch user profile by wallet address
 * Uses Zo's User account system with transaction-based metadata storage
 * Implements global caching and request deduplication to prevent RPC rate limiting
 */

import { useState, useEffect, useMemo } from 'react';
import { useAppConnection } from '@/lib/wallet/use-app-wallet';
import { PublicKey } from '@solana/web3.js';
import { ROOT_ID } from '@/lib/iqlabs/constants';
import { getCachedAccountInfo } from '@/lib/rpc/cache';
import type { UserProfile } from './user-profile-manager';
import iqlabs from 'iqlabs-sdk/src';

// Global cache to prevent redundant fetches across components
const profileCache = new Map<string, { data: UserProfile | null; timestamp: number }>();
const pendingRequests = new Map<string, Promise<UserProfile | null>>();
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

export function useUserProfile(walletAddress: string | undefined) {
  const { connection } = useAppConnection();
  const programId = useMemo(() => iqlabs.contract.getProgramId(), []);

  const [profile, setProfile] = useState<UserProfile | null>(() => {
    if (!walletAddress) return null;
    const cached = profileCache.get(walletAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress || !connection) {
      setProfile(null);
      return;
    }

    // Check cache again in effect
    const cached = profileCache.get(walletAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProfile(cached.data);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      // Return existing promise if already fetching
      if (pendingRequests.has(walletAddress)) {
        setLoading(true);
        try {
          const data = await pendingRequests.get(walletAddress);
          if (!cancelled) {
            setProfile(data || null);
            setLoading(false);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load profile');
            setLoading(false);
          }
        }
        return;
      }

      setLoading(true);
      setError(null);

      const promise = (async () => {
        try {
          let userPk: PublicKey;
          try {
            userPk = new PublicKey(walletAddress);
          } catch {
            return null;
          }
          const userAccount = iqlabs.contract.getUserPda(userPk, programId);

          // Fetch the User account (cached)
          const accountInfo = await getCachedAccountInfo(connection, userAccount);

          if (!accountInfo || !accountInfo.data) {
            return {
              pubkey: walletAddress,
              name: '',
              bio: '',
              profilePicture: '',
              timestamp: Date.now(),
            };
          }

          // Parse the User account data
          const data = Buffer.from(accountInfo.data);
          let offset = 8; // Skip discriminator
          offset += 32; // Skip owner

          // Skip data Vec
          const dataLen = data.readUInt32LE(offset);
          offset += 4 + dataLen;

          // Read metadata Vec
          const metadataLen = data.readUInt32LE(offset);
          offset += 4;
          const metadataBytes = data.slice(offset, offset + metadataLen);
          const metadata = metadataBytes.toString('utf8');

          if (!metadata) {
            return {
              pubkey: walletAddress,
              name: '',
              bio: '',
              profilePicture: '',
              timestamp: Date.now(),
            };
          }

          // Zo's system: Check if metadata is a transaction ID
          let profileData;

          if (metadata.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadata)) {
            // Transaction ID - reconstruct original JSON using SDK HIGH-LEVEL function
            const result = await iqlabs.reader.readCodeIn(metadata);

            if (!result?.data || result.data.startsWith('[unable')) {
              throw new Error('Failed to reconstruct metadata from transaction');
            }

            profileData = JSON.parse(result.data);
          } else {
            // Direct JSON metadata
            profileData = JSON.parse(metadata);
          }

          const result = {
            pubkey: walletAddress,
            name: profileData.name || '',
            bio: profileData.bio || '',
            profilePicture: profileData.profilePicture || '',
            timestamp: Date.now(),
          };

          return result;
        } catch (err) {
          console.error('[useUserProfile] Error fetching profile:', err);
          throw err;
        }
      })();

      // Store promise
      pendingRequests.set(walletAddress, promise);

      try {
        const result = await promise;

        // Update cache
        if (result) {
          profileCache.set(walletAddress, { data: result, timestamp: Date.now() });
        }

        if (!cancelled) {
          setProfile(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load profile');
          // Return empty profile on error to prevent infinite retries
          setProfile({
            pubkey: walletAddress,
            name: '',
            bio: '',
            profilePicture: '',
            timestamp: Date.now(),
          });
          setLoading(false);
        }
      } finally {
        pendingRequests.delete(walletAddress);
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, connection, programId]);

  return { profile, loading, error };
}
