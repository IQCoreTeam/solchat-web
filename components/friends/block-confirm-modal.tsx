'use client';

import type { Friend } from '@/lib/friends/types';
import { shorten as shortenAddress } from '@/lib/utils/message-utils';
import { Window, WindowHeader, WindowContent, Button } from 'react95';

type BlockConfirmModalProps = {
  open: boolean;
  friend: Friend | null;
  onCancel: () => void;
  onConfirm: () => void;
};

export function BlockConfirmModal({ open, friend, onCancel, onConfirm }: BlockConfirmModalProps) {
  if (!open || !friend) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
      <Window style={{ width: '100%', maxWidth: '400px' }}>
        <WindowHeader>
          <span>[CONFIRM BLOCK]</span>
        </WindowHeader>
        <WindowContent>
          <div style={{ padding: '16px' }}>
            <p style={{ color: '#00ff00', fontSize: '12px', marginBottom: '16px' }}>
              Are you sure you want to block {shortenAddress(friend.address, 6)}?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={onConfirm} primary>
                Block
              </Button>
            </div>
          </div>
        </WindowContent>
      </Window>
    </div>
  );
}
