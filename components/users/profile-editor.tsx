/**
 * Profile Editor Component
 * Form for editing user profile (name, bio, profile picture)
 */

'use client';

import { useState, useEffect, type FormEvent } from 'react';
import type { UserProfile } from './user-profile-manager';

interface ProfileEditorProps {
  profile: UserProfile | null;
  onSave: (profile: Omit<UserProfile, 'pubkey'>) => Promise<UserProfile>;
  loading: boolean;
}

export function ProfileEditor({ profile, onSave, loading }: ProfileEditorProps) {
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [profilePicture, setProfilePicture] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load existing profile data
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setBio(profile.bio || '');
      setProfilePicture(profile.profilePicture || '');
    }
  }, [profile]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setError(null);
    setSuccess(false);
    setSaving(true);

    try {
      await onSave({
        name: name.trim(),
        bio: bio.trim(),
        profilePicture: profilePicture.trim(),
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-black/40 border border-green-700/30 rounded-lg p-6">
        <h2 className="text-2xl font-bold text-green-400 mb-6">Edit Your Profile</h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-green-400 mb-2">
              NAME *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              className="w-full bg-black/60 border border-green-700/30 rounded px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500"
              maxLength={30}
              disabled={loading || saving}
            />
            <div className="mt-1 text-xs text-white/40">
              {name.length} / 30 characters
            </div>
          </div>

          {/* Bio */}
          <div>
            <label className="block text-sm font-bold text-green-400 mb-2">
              BIO
            </label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              className="w-full bg-black/60 border border-green-700/30 rounded px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500 resize-none"
              rows={4}
              maxLength={100}
              disabled={loading || saving}
            />
            <div className="mt-1 text-xs text-white/40">
              {bio.length} / 100 characters
            </div>
          </div>

          {/* Profile Picture */}
          <div>
            <label className="block text-sm font-bold text-green-400 mb-2">
              PROFILE PICTURE
            </label>
            <input
              type="text"
              value={profilePicture}
              onChange={(e) => setProfilePicture(e.target.value)}
              placeholder="https://... or ipfs://... or Solana tx ID"
              className="w-full bg-black/60 border border-green-700/30 rounded px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-green-500"
              disabled={loading || saving}
            />
            <div className="mt-1 text-xs text-white/40">
              Web2 URL, IPFS link, or Solana transaction ID
            </div>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="p-3 bg-green-900/30 border border-green-500 rounded text-green-400 text-sm">
              Profile saved successfully!
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={loading || saving || !name.trim()}
            className="w-full py-3 bg-green-500 text-black font-bold rounded hover:bg-green-400 transition disabled:bg-white/20 disabled:text-white/60 disabled:cursor-not-allowed"
          >
            {saving ? 'SAVING...' : 'SAVE PROFILE'}
          </button>
        </form>

        {/* Preview */}
        {(name || bio || profilePicture) && (
          <div className="mt-8 pt-6 border-t border-white/10">
            <h3 className="text-sm font-bold text-green-400 mb-3">PREVIEW</h3>
            <div className="bg-black/60 border border-green-700/20 rounded-lg p-4">
              <div className="flex items-start gap-4">
                {profilePicture ? (
                  <img
                    src={profilePicture}
                    alt={name}
                    className="w-16 h-16 rounded-full object-cover border-2 border-green-500"
                    onError={(e) => {
                      e.currentTarget.src = '';
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-green-900/30 border-2 border-green-700 flex items-center justify-center text-green-400 font-bold text-2xl">
                    {name.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-bold text-white text-lg">{name || 'No name'}</div>
                  <div className="text-white/60 text-sm mt-1">{bio || 'No bio'}</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
