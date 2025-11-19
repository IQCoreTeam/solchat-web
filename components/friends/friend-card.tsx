/**
 * FriendCard Component
 * - Displays individual friend with actions
 */

'use client';

import type { Friend } from '@/lib/friends/types';
import { shortenAddress, deriveAvatarHue } from '@/lib/friends/utils';

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
  const hue = deriveAvatarHue(friend.address);
  const isRequester = friend.partyA === currentUser ? friend.requester === 0 : friend.requester === 1;
  const isPending = friend.status === 'pending';
  const isBlocked = friend.status === 'blocked';
  const isApproved = friend.status === 'approved';

  // Badge color based on status
  const statusColor = {
    pending: 'bg-yellow-900/30 text-yellow-400 border-yellow-600',
    approved: 'bg-green-900/30 text-green-400 border-green-600',
    blocked: 'bg-red-900/30 text-red-400 border-red-600',
  }[friend.status];

  return (
    <div className="bg-black/40 border-2 border-green-700/50 hover:border-green-500/70 transition-all p-4 rounded">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center text-black font-bold text-lg shrink-0"
          style={{
            background: `linear-gradient(135deg, hsl(${hue}, 70%, 50%), hsl(${hue + 30}, 70%, 40%))`,
          }}
        >
          {friend.name ? friend.name[0].toUpperCase() : friend.address[0].toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-green-400   text-sm">
              {shortenAddress(friend.address)}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded border ${statusColor}   uppercase`}
            >
              {friend.status}
            </span>
          </div>

          {isPending && !isRequester && (
            <p className="text-green-600 text-xs mb-2">Incoming request</p>
          )}

          {isPending && isRequester && (
            <div className="text-green-500 text-xs mb-2">
              <p>Request sent — you can message while waiting for approval.</p>
              <button
                onClick={() => onOpenChat?.(friend)}
                className="mt-1 px-3 py-1 border border-green-600 text-green-100 rounded text-[11px] uppercase tracking-wide hover:bg-green-600/20 transition"
              >
                [OPEN DM]
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            {isApproved && (
              <>
                <button
                  onClick={() => onOpenChat?.(friend)}
                  className="px-3 py-1 bg-green-700 hover:bg-green-600 text-green-100 rounded text-xs   transition-colors"
                >
                  [CHAT]
                </button>
                <button
                  onClick={() => onBlock?.(friend)}
                  className="px-3 py-1 bg-red-900/50 hover:bg-red-900/70 text-red-400 rounded text-xs   transition-colors border border-red-700"
                >
                  [BLOCK]
                </button>
              </>
            )}

            {isPending && !isRequester && (
              <>
                <button
                  onClick={() => onApprove?.(friend)}
                  className="px-3 py-1 bg-green-700 hover:bg-green-600 text-green-100 rounded text-xs   transition-colors"
                >
                  [APPROVE]
                </button>
                <button
                  onClick={() => onBlock?.(friend)}
                  className="px-3 py-1 bg-red-900/50 hover:bg-red-900/70 text-red-400 rounded text-xs   transition-colors border border-red-700"
                >
                  [DECLINE]
                </button>
              </>
            )}

            {isBlocked && (
              <button
                onClick={() => onUnblock?.(friend)}
                className="px-3 py-1 bg-yellow-900/50 hover:bg-yellow-900/70 text-yellow-400 rounded text-xs   transition-colors border border-yellow-700"
              >
                [UNBLOCK]
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
