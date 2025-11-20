/**
 * Hook to fetch user profile by wallet address
 * Uses Zo's User account system with transaction-based metadata storage
 */

import { useState, useEffect } from 'react';
import { useAppConnection } from '@/lib/wallet/use-app-wallet';
import { PublicKey } from '@solana/web3.js';
import { pdaUser, pdaRoot } from '@/lib/onchainDB';
import { ROOT_ID } from '@/lib/onchainDB/constants';
import { reconstructMessageFromChainForTailTx } from '@/lib/iq/reader';
import type { UserProfile } from './user-profile-manager';

export function useUserProfile(walletAddress: string | undefined) {
  const { connection } = useAppConnection();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress || !connection) {
      setProfile(null);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const userPk = new PublicKey(walletAddress);
        const rootPk = pdaRoot(ROOT_ID);
        const userAccount = pdaUser(rootPk, userPk);

        // Fetch the User account
        const accountInfo = await connection.getAccountInfo(userAccount);

        if (!accountInfo || !accountInfo.data) {
          if (!cancelled) {
            setProfile(null);
            setLoading(false);
          }
          return;
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
          if (!cancelled) {
            setProfile(null);
            setLoading(false);
          }
          return;
        }

        // Zo's system: Check if metadata is a transaction ID
        let profileData;

        if (metadata.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadata)) {
          // Transaction ID - reconstruct original JSON
          const reconstructed = await reconstructMessageFromChainForTailTx(
            connection,
            metadata
          );

          if (reconstructed) {
            profileData = JSON.parse(reconstructed);
          } else {
            throw new Error('Failed to reconstruct metadata from transaction');
          }
        } else {
          // Direct JSON metadata
          profileData = JSON.parse(metadata);
        }

        if (!cancelled) {
          setProfile({
            pubkey: walletAddress,
            name: profileData.name || '',
            bio: profileData.bio || '',
            profilePicture: profileData.profilePicture || '',
            timestamp: Date.now(),
          });
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[useUserProfile] Error fetching profile:', err);
          setError(err instanceof Error ? err.message : 'Failed to load profile');
          setProfile(null);
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [walletAddress, connection]);

  return { profile, loading, error };
}
