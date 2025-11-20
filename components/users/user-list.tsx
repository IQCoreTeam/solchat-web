/**
 * User List Component
 * Displays all user profiles from the global user list
 */

'use client';

import { useState } from 'react';
import type { UserProfile } from './user-profile-manager';
import { shorten } from '@/lib/utils/message-utils';

interface UserListProps {
  profiles: UserProfile[];
  loading: boolean;
  currentUser: string;
}

export function UserList({ profiles, loading, currentUser }: UserListProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredProfiles = profiles.filter((profile) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      profile.name.toLowerCase().includes(query) ||
      profile.bio.toLowerCase().includes(query) ||
      profile.pubkey.toLowerCase().includes(query)
    );
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-green-400 text-lg">Loading profiles...</div>
      </div>
    );
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, bio, or wallet address..."
          className="w-full bg-black/60 border border-green-700/30 rounded px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500"
        />
      </div>

      {/* Profile count */}
      <div className="mb-4 text-white/60 text-sm">
        {filteredProfiles.length === profiles.length
          ? `${profiles.length} ${profiles.length === 1 ? 'profile' : 'profiles'} total`
          : `${filteredProfiles.length} of ${profiles.length} profiles`}
      </div>

      {/* Empty state */}
      {filteredProfiles.length === 0 && (
        <div className="text-center py-12">
          <div className="text-white/40 text-lg mb-2">
            {searchQuery ? 'No profiles match your search' : 'No profiles yet'}
          </div>
          {!searchQuery && (
            <div className="text-white/30 text-sm">
              Be the first to create a profile!
            </div>
          )}
        </div>
      )}

      {/* Profile grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProfiles.map((profile) => (
          <ProfileCard
            key={profile.pubkey}
            profile={profile}
            isCurrentUser={profile.pubkey === currentUser}
          />
        ))}
      </div>
    </div>
  );
}

interface ProfileCardProps {
  profile: UserProfile;
  isCurrentUser: boolean;
}

function ProfileCard({ profile, isCurrentUser }: ProfileCardProps) {
  const [imageError, setImageError] = useState(false);

  return (
    <div className={`bg-black/40 border rounded-lg p-4 hover:border-green-500/50 transition ${
      isCurrentUser ? 'border-green-500' : 'border-green-700/30'
    }`}>
      {/* Header with avatar and name */}
      <div className="flex items-start gap-3 mb-3">
        {profile.profilePicture && !imageError ? (
          <img
            src={profile.profilePicture}
            alt={profile.name}
            className="w-12 h-12 rounded-full object-cover border-2 border-green-500"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-green-900/30 border-2 border-green-700 flex items-center justify-center text-green-400 font-bold text-xl">
            {profile.name.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-white truncate">{profile.name}</div>
          <div className="text-xs text-white/40 font-mono truncate">
            {shorten(profile.pubkey, 6)}
          </div>
          {isCurrentUser && (
            <div className="text-xs text-green-400 font-bold mt-1">YOU</div>
          )}
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <div className="text-white/70 text-sm mb-3 line-clamp-3">
          {profile.bio}
        </div>
      )}

      {/* Footer with timestamp and copy button */}
      <div className="flex items-center justify-between pt-3 border-t border-white/10">
        {profile.timestamp && (
          <div className="text-xs text-white/30">
            {new Date(profile.timestamp).toLocaleDateString()}
          </div>
        )}
        <button
          onClick={() => {
            navigator.clipboard?.writeText(profile.pubkey);
          }}
          className="text-xs text-green-400 hover:text-green-300 font-bold"
          title="Copy wallet address"
        >
          COPY WALLET
        </button>
      </div>
    </div>
  );
}
