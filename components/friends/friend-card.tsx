/**
 * FriendCard Component
 * - Displays individual friend with actions
 */

'use client';

import { useState } from 'react';
import type { Friend } from '@/lib/friends/types';
import { shortenAddress } from '@/lib/friends/utils';
import { Frame, Button } from 'react95';
import { useUserProfile } from '@/components/users/use-user-profile';
import { ProfileModal } from '@/components/users/profile-modal';
import { DefaultProfileAvatar } from '@/components/ui/default-profile-avatar';

interface FriendCardProps {
  friend: Friend;
  currentUser: string;
  onApprove?: (friend: Friend) => void;
  onBlock?: (friend: Friend) => void;
  onUnblock?: (friend: Friend) => void;
  onOpenChat?: (friend: Friend) => void;
}

export function FriendCard({
  friend,
  currentUser,
  onApprove,
  onBlock,
  onUnblock,
  onOpenChat,
}: FriendCardProps) {
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Fetch user profile
  const { profile } = useUserProfile(friend.address);

  const isRequester = friend.partyA === currentUser ? friend.requester === 0 : friend.requester === 1;
  const isPending = friend.status === 'pending';
  const isBlocked = friend.status === 'blocked';
  const isApproved = friend.status === 'approved';

  // Badge color based on status
  const statusColor = {
    pending: '#ffff00',
    approved: '#00ff00',
    blocked: '#ff0000',
  }[friend.status];

  const displayName = profile?.name || friend.name || shortenAddress(friend.address);

  return (
    <Frame variant="outside" style={{ padding: '12px', background: '#0a0a0a' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Avatar */}
        <button
          onClick={() => setShowProfileModal(true)}
          style={{
            width: '48px',
            height: '48px',
            padding: 0,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
          }}
          title="View profile"
        >
          {profile?.profilePicture && !imageError ? (
            <img
              src={profile.profilePicture}
              alt={displayName}
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid #00ff00',
              }}
              onError={() => setImageError(true)}
            />
          ) : (
            <DefaultProfileAvatar
              seed={friend.address}
              className="block h-12 w-12 rounded-full border-2 border-green-500"
            />
          )}
        </button>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ color: '#00ff00', fontSize: '11px', fontWeight: profile?.name ? 'bold' : 'normal' }}>
              {profile?.name || shortenAddress(friend.address, 10)}
            </span>
            {profile?.name && (
              <span style={{ color: '#666666', fontSize: '9px' }}>
                {shortenAddress(friend.address, 6)}
              </span>
            )}
              {!isApproved && (
            <span style={{
              fontSize: '9px',

              padding: '2px 6px',
              border: `1px solid ${statusColor}`,
              color: statusColor,
              textTransform: 'uppercase',
              background: '#000000'
            }}>
              {friend.status}
            </span>
              )}
          </div>

          {isPending && !isRequester && (
            <p style={{ color: '#00ff00', fontSize: '10px',  marginBottom: '8px' }}>
              &gt; INCOMING REQUEST
            </p>
          )}

          {isPending && isRequester && (
            <div style={{ marginBottom: '8px' }}>
              <p style={{ color: '#00ff00', fontSize: '10px',  marginBottom: '6px' }}>
                &gt; REQUEST SENT - YOU CAN MESSAGE WHILE WAITING
              </p>
              <Button
                onClick={() => onOpenChat?.(friend)}
                size="sm"
                style={{ fontSize: '10px' }}
              >
                [OPEN DM]
              </Button>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            {isApproved && (
              <>
                <Button
                  onClick={() => onOpenChat?.(friend)}
                  size="sm"
                  style={{  fontSize: '10px' }}
                >
                  [CHAT]
                </Button>
                <Button
                  onClick={() => onBlock?.(friend)}
                  size="sm"
                  style={{fontSize: '10px' }}
                >
                  [BLOCK]
                </Button>
              </>
            )}

            {isPending && !isRequester && (
              <>
                <Button
                  onClick={() => onApprove?.(friend)}
                  primary
                  size="sm"
                  style={{  fontSize: '10px' }}
                >
                  [APPROVE]
                </Button>
                <Button
                  onClick={() => onBlock?.(friend)}
                  size="sm"
                  style={{  fontSize: '10px' }}
                >
                  [DECLINE]
                </Button>
              </>
            )}

            {isBlocked && (
              <Button
                onClick={() => onUnblock?.(friend)}
                size="sm"
                style={{  fontSize: '10px' }}
              >
                [UNBLOCK]
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Profile Modal */}
      {showProfileModal && (
        <ProfileModal
          walletAddress={friend.address}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </Frame>
  );
}
