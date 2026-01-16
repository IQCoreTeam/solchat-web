/**
 * User Profile Manager Component - Zo's Vision
 * - My Profile: Set name, bio, profile pic using updateUserMetadata
 * - All Users: Fetch all user pubkeys from admin table, then fetch each User account's metadata
 */

'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { ProfileEditor } from './profile-editor';
import { UserList } from './user-list';
import { useUserProfileManager } from './use-user-profile-manager';

export function UserProfileManager() {
  const { ready, authenticated, login } = usePrivy();
  const {
    userAddress,
    myProfile,
    allProfiles,
    loading,
    error,
    saveProfile,
    handleSendFriendRequest,
  } = useUserProfileManager();
  const [activeTab, setActiveTab] = useState<'my-profile' | 'all-users'>('my-profile');

  const handleLogin = () => {
    if (ready && !authenticated) login();
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
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-green-400 mb-2">User Profiles</h1>
        <p className="text-white/60">
          Zo&#39;s Vision: Onchain user profiles with metadata stored in User accounts
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded text-red-400">
          {error}
        </div>
      )}

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

      <div className="mt-6">
        {activeTab === 'my-profile' && (
          <ProfileEditor profile={myProfile} onSave={saveProfile} loading={loading} />
        )}
        {activeTab === 'all-users' && (
          <UserList
            profiles={allProfiles}
            loading={loading}
            currentUser={userAddress}
            onSendFriendRequest={handleSendFriendRequest}
          />
        )}
      </div>

      <div className="mt-12 p-6 bg-green-900/10 border border-green-700/30 rounded-lg">
        <h3 className="text-green-400 font-bold mb-2">About This Feature - Zo's New User Account System</h3>
        <p className="text-white/70 text-sm mb-2">
          User profiles are now stored in dedicated User accounts with automatic initialization:
        </p>
        <code className="block bg-black/40 p-3 rounded text-xs text-green-300 overflow-x-auto mb-2">
          {`updateUserMetadata(metadata) → Creates/updates User account`}
        </code>
        <p className="text-white/70 text-sm mb-2">
          User account structure (seeds: ["solchat-user", programId, root, user]):
        </p>
        <code className="block bg-black/40 p-3 rounded text-xs text-green-300 overflow-x-auto mb-3">
          {`{
  owner: Pubkey,
  data: Vec<u8>,
  metadata: Vec<u8> // JSON: {name, bio, profilePicture}
}`}
        </code>
        <p className="text-white/70 text-sm mb-3">
          The metadata field stores your profile JSON. With <code className="text-green-400">init_if_needed</code>, your User account is created automatically when you save your profile!
        </p>
        <div className="border-t border-green-700/30 pt-3 mt-3">
          <h4 className="text-green-400 font-bold text-sm mb-2">Zo's Anti-Spam System</h4>
          <p className="text-white/70 text-sm">
            Users are only added to the "All Users" list when they set their nickname for the <span className="text-green-400">first time</span>.
            The system checks if metadata exists before adding you to the global_user_list admin table. This prevents spam and duplicate entries!
          </p>
        </div>
      </div>
    </div>
  );
}
