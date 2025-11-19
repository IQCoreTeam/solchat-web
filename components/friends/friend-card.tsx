/**
 * FriendCard Component
 * - Displays individual friend with actions
 */

'use client';

import type { Friend } from '@/lib/friends/types';
import { shortenAddress, deriveAvatarHue } from '@/lib/friends/utils';
import { Frame, Button, Avatar } from 'react95';

interface FriendCardProps {
  friend: Friend;
  currentUser: string;
  onApprove?: (friend: Friend) => void;
  onBlock?: (friend: Friend) => void;
  onUnblock?: (friend: Friend) => void;
  onOpenChat?: (friend: Friend) => void;
}

const getInitials = (name: string) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name[0].toUpperCase();
};

export function FriendCard({
  friend,
  currentUser,
  onApprove,
  onBlock,
  onUnblock,
  onOpenChat,
}: FriendCardProps) {
  const hue = deriveAvatarHue(friend.address);
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

  const avatarStyle = { backgroundColor: `hsl(${hue}, 65%, 48%)` };
  const displayName = friend.name || shortenAddress(friend.address);

  return (
    <Frame variant="outside" style={{ padding: '12px', background: '#0a0a0a' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Avatar */}
        <Avatar
          size={48}
          style={{
            ...avatarStyle,
            color: '#000000',
            textShadow: '0 0 2px rgba(255, 255, 255, 0.5)',
            fontWeight: 'bold'
          }}
        >
          {getInitials(displayName)}
        </Avatar>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
            <span style={{ color: '#00ff00', fontSize: '11px', fontFamily: 'monospace' }}>
              {shortenAddress(friend.address)}
            </span>
            <span style={{
              fontSize: '9px',
              fontFamily: 'monospace',
              padding: '2px 6px',
              border: `1px solid ${statusColor}`,
              color: statusColor,
              textTransform: 'uppercase',
              background: '#000000'
            }}>
              {friend.status}
            </span>
          </div>

          {isPending && !isRequester && (
            <p style={{ color: '#00ff00', fontSize: '10px', fontFamily: 'monospace', marginBottom: '8px' }}>
              &gt; INCOMING REQUEST
            </p>
          )}

          {isPending && isRequester && (
            <div style={{ marginBottom: '8px' }}>
              <p style={{ color: '#00ff00', fontSize: '10px', fontFamily: 'monospace', marginBottom: '6px' }}>
                &gt; REQUEST SENT - YOU CAN MESSAGE WHILE WAITING
              </p>
              <Button
                onClick={() => onOpenChat?.(friend)}
                size="sm"
                style={{ fontFamily: 'monospace', fontSize: '10px' }}
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
                  primary
                  size="sm"
                  style={{ fontFamily: 'monospace', fontSize: '10px' }}
                >
                  [CHAT]
                </Button>
                <Button
                  onClick={() => onBlock?.(friend)}
                  size="sm"
                  style={{ fontFamily: 'monospace', fontSize: '10px' }}
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
                  style={{ fontFamily: 'monospace', fontSize: '10px' }}
                >
                  [APPROVE]
                </Button>
                <Button
                  onClick={() => onBlock?.(friend)}
                  size="sm"
                  style={{ fontFamily: 'monospace', fontSize: '10px' }}
                >
                  [DECLINE]
                </Button>
              </>
            )}

            {isBlocked && (
              <Button
                onClick={() => onUnblock?.(friend)}
                size="sm"
                style={{ fontFamily: 'monospace', fontSize: '10px' }}
              >
                [UNBLOCK]
              </Button>
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}
