import { useState, useEffect, useMemo } from 'react';
import { useAppConnection } from '@/lib/wallet/use-app-wallet';
import { PublicKey } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import { getCachedAccountInfo } from '@/lib/rpc/cache';
import type { UserProfile } from './types';
import { extractUserMetadata, parseMetadata } from './profile-helpers';

const profileCache = new Map<string, { data: UserProfile | null; timestamp: number }>();
const pendingRequests = new Map<string, Promise<UserProfile | null>>();
const CACHE_TTL = 1000 * 60 * 5;

export function useUserProfile(walletAddress: string | undefined) {
  const { readConnection: connection } = useAppConnection();
  const programId = useMemo(() => iqlabs.contract.PROGRAM_ID, []);

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

    const cached = profileCache.get(walletAddress);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setProfile(cached.data);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
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
        let userPk: PublicKey;
        try {
          userPk = new PublicKey(walletAddress);
        } catch {
          return null;
        }
        const userAccount = iqlabs.contract.getUserPda(userPk, programId);
        const accountInfo = await getCachedAccountInfo(connection, userAccount);

        const emptyProfile: UserProfile = {
          pubkey: walletAddress,
          name: '',
          bio: '',
          profilePicture: '',
          timestamp: Date.now(),
        };

        if (!accountInfo?.data) return emptyProfile;

        const metadataStr = extractUserMetadata(accountInfo);
        if (!metadataStr) return emptyProfile;

        const profileData = await parseMetadata(metadataStr);
        if (!profileData) return emptyProfile;

        return {
          pubkey: walletAddress,
          name: profileData.name || '',
          bio: profileData.bio || '',
          profilePicture: profileData.profilePicture || '',
          timestamp: Date.now(),
        };
      })();

      pendingRequests.set(walletAddress, promise);

      try {
        const result = await promise;

        if (result) {
          profileCache.set(walletAddress, { data: result, timestamp: Date.now() });
        }

        if (!cancelled) {
          setProfile(result);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useUserProfile] Error fetching profile:', err);
          setError(err instanceof Error ? err.message : 'Failed to load profile');
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
