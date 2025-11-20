/**
 * Profile Modal Component
 * Shows full user profile when clicking on profile picture in chat
 */

'use client';

import { useState } from 'react';
import { useUserProfile } from './use-user-profile';
import { shorten } from '@/lib/utils/message-utils';
import { DefaultProfileAvatar } from '@/components/ui/default-profile-avatar';

interface ProfileModalProps {
  walletAddress: string;
  onClose: () => void;
}

export function ProfileModal({ walletAddress, onClose }: ProfileModalProps) {
  const { profile, loading, error } = useUserProfile(walletAddress);
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy wallet:', err);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-black border-2 border-green-500 rounded-lg max-w-md w-full p-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition text-2xl leading-none"
          title="Close"
        >
          ×
        </button>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-green-400">Loading profile...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-red-400 text-center py-6">
            Failed to load profile
          </div>
        )}

        {/* No profile found */}
        {!loading && !error && !profile && (
          <div className="text-center py-6">
            <div className="text-white/60 mb-4">No profile set</div>
            <div className="text-white/40 text-sm">
              This user hasn't created a profile yet
            </div>
          </div>
        )}

        {/* Profile content */}
        {!loading && !error && profile && (
          <div className="space-y-6">
            {/* Profile picture */}
            <div className="flex justify-center">
              {profile.profilePicture && !imageError ? (
                <img
                  src={profile.profilePicture}
                  alt={profile.name}
                  className="w-32 h-32 rounded-full object-cover border-4 border-green-500"
                  onError={() => setImageError(true)}
                />
              ) : (
                <DefaultProfileAvatar
                  seed={profile.pubkey || profile.name || walletAddress || 'profile'}
                  className="w-32 h-32 rounded-full border-4 border-green-700"
                />
              )}
            </div>

            {/* Name */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">
                {profile.name}
              </h2>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-sm font-bold text-green-400 mb-2">BIO</div>
                <div className="text-white/80 text-sm leading-relaxed">
                  {profile.bio}
                </div>
              </div>
            )}

            {/* Wallet address */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="text-sm font-bold text-green-400 mb-2">
                WALLET ADDRESS
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-white/60 text-xs font-mono break-all">
                  {shorten(walletAddress, 8)}
                </div>
                <button
                  onClick={handleCopyWallet}
                  className="text-xs text-green-400 hover:text-green-300 font-bold transition whitespace-nowrap"
                  title="Copy full wallet address"
                >
                  {copied ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
