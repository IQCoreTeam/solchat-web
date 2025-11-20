/**
 * User Profile Manager Component
 * Allows users to set their profile (name, bio, profile pic)
 * and browse all user profiles on the network
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';
import { ProfileEditor } from './profile-editor';
import { UserList } from './user-list';
import { codeIn } from '@/lib/iq/transaction';
import { reconstructMessageFromChain } from '@/lib/iq/reader';

export interface UserProfile {
  pubkey: string;
  name: string;
  bio: string;
  profilePicture: string;
  timestamp?: number;
  txid?: string; // Transaction ID from codeIn
}

export function UserProfileManager() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const { ready, authenticated, login } = usePrivy();
  const userAddress = wallet?.publicKey?.toBase58();

  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my-profile' | 'all-users'>('my-profile');

  // Load user's profile
  const loadMyProfile = useCallback(async () => {
    if (!userAddress || !connection) return;

    setLoading(true);
    setError(null);
    try {
      // Check localStorage for profile txid
      const storageKey = `profile_txid_${userAddress}`;
      const txid = localStorage.getItem(storageKey);

      if (txid) {
        console.log('[UserProfile] Found profile txid:', txid);
        // Use Zo's reconstructMessageFromChain to read the profile
        const reconstructed = await reconstructMessageFromChain(connection, txid);

        if (reconstructed) {
          try {
            // Remove handle prefix if present (format: "handle: {json}")
            const jsonStr = reconstructed.includes(': ')
              ? reconstructed.split(': ')[1]
              : reconstructed;

            const parsed = JSON.parse(jsonStr);
            setMyProfile({
              pubkey: userAddress,
              name: parsed.name || '',
              bio: parsed.bio || '',
              profilePicture: parsed.profilePicture || '',
              timestamp: Date.now(),
              txid,
            });
            console.log('[UserProfile] Loaded profile from txid');
          } catch (parseErr) {
            console.error('[UserProfile] Failed to parse profile JSON:', parseErr);
            setMyProfile(null);
          }
        } else {
          console.log('[UserProfile] Failed to reconstruct profile from txid');
          setMyProfile(null);
        }
      } else {
        console.log('[UserProfile] No profile txid found');
        setMyProfile(null);
      }
    } catch (err) {
      console.error('[UserProfile] Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userAddress, connection]);

  // Load all user profiles from global list
  // Note: Zo's design doesn't have a global user list - users are created on-demand during DM requests
  // For now, we'll just load from friends/DM list or show a message
  const loadAllProfiles = useCallback(async () => {
    if (!connection) return;

    setLoading(true);
    setError(null);
    try {
      // TODO: Scan DM list or friends to get user profiles
      // For now, just show empty list
      setAllProfiles([]);
      console.log('[UserProfile] Global user list not available in current design');
    } catch (err) {
      console.error('[UserProfile] Error loading profiles:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  }, [connection]);

  // Save user profile using Zo's codeIn function
  const saveProfile = useCallback(async (profile: Omit<UserProfile, 'pubkey'>) => {
    if (!userAddress || !connection || !wallet) {
      throw new Error('Wallet not connected');
    }

    setError(null);
    try {
      // Prepare profile JSON
      const profileJson = JSON.stringify({
        name: profile.name,
        bio: profile.bio,
        profilePicture: profile.profilePicture,
      });

      console.log('[UserProfile] Saving profile with codeIn...');

      // Use Zo's codeIn to save the profile JSON and get txid
      const txid = await codeIn(
        connection,
        wallet as any,
        profileJson,
        'user_profile', // type
        userAddress.substring(0, 8) // handle (short version of address)
      );

      console.log('[UserProfile] Profile saved! txid:', txid);

      // Store txid in localStorage
      const storageKey = `profile_txid_${userAddress}`;
      localStorage.setItem(storageKey, txid);

      const fullProfile: UserProfile = {
        pubkey: userAddress,
        ...profile,
        timestamp: Date.now(),
        txid,
      };

      setMyProfile(fullProfile);

      return fullProfile;
    } catch (err) {
      console.error('[UserProfile] Error saving profile:', err);
      throw err;
    }
  }, [userAddress, connection, wallet]);

  useEffect(() => {
    if (userAddress) {
      loadMyProfile();
      loadAllProfiles();
    }
  }, [userAddress, loadMyProfile, loadAllProfiles]);

  // Handle login
  const handleLogin = () => {
    if (ready && !authenticated) {
      login();
    }
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-green-400 text-xl">Loading...</div>
      </div>
    );
  }

  if (!authenticated || !userAddress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-green-400 mb-4">User Profiles</h1>
          <p className="text-white/60 mb-6">Connect your wallet to create and view profiles</p>
          <button
            onClick={handleLogin}
            className="px-6 py-3 bg-green-500 text-black font-bold rounded hover:bg-green-400 transition"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-green-400 mb-2">User Profiles</h1>
        <p className="text-white/60">
          Testing Zo's theory: Onchain user profiles with metadata
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab('my-profile')}
          className={`px-6 py-3 font-bold transition ${
            activeTab === 'my-profile'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          MY PROFILE
        </button>
        <button
          onClick={() => setActiveTab('all-users')}
          className={`px-6 py-3 font-bold transition ${
            activeTab === 'all-users'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          ALL USERS ({allProfiles.length})
        </button>
      </div>

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'my-profile' && (
          <ProfileEditor
            profile={myProfile}
            onSave={saveProfile}
            loading={loading}
          />
        )}
        {activeTab === 'all-users' && (
          <UserList
            profiles={allProfiles}
            loading={loading}
            currentUser={userAddress}
          />
        )}
      </div>

      {/* Info Box */}
      <div className="mt-12 p-6 bg-green-900/10 border border-green-700/30 rounded-lg">
        <h3 className="text-green-400 font-bold mb-2">About This Feature - Zo's IQ Inscription System</h3>
        <p className="text-white/70 text-sm mb-2">
          User profiles are stored onchain using Zo's codeIn function. Your profile JSON is chunked and inscribed as transactions:
        </p>
        <code className="block bg-black/40 p-3 rounded text-xs text-green-300 overflow-x-auto mb-2">
          {`codeIn(data) → returns 90-byte transaction ID`}
        </code>
        <p className="text-white/70 text-sm mb-2">
          Profile structure:
        </p>
        <code className="block bg-black/40 p-3 rounded text-xs text-green-300 overflow-x-auto">
          {`{
  name: "Your Name",
  bio: "Your bio",
  profilePicture: "link or tx id"
}`}
        </code>
        <p className="text-white/70 text-sm mt-3">
          To read profiles, we use <code className="text-green-400">reconstructMessageFromChain(txid)</code> which follows the transaction chain and reconstructs the original JSON.
        </p>
      </div>
    </div>
  );
}
