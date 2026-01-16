'use client';

import { Window, WindowHeader, WindowContent, Button } from 'react95';
import { AddFriendForm } from './add-friend-form';

type AddFriendModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (friendAddress: string) => Promise<void>;
  disabled: boolean;
};

export function AddFriendModal({ open, onClose, onSubmit, disabled }: AddFriendModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
      <Window style={{ width: '100%', maxWidth: '500px' }}>
        <WindowHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>[ADD FRIEND]</span>
          <Button onClick={onClose} size="sm" style={{ padding: '2px 8px', fontSize: '10px' }}>
            X
          </Button>
        </WindowHeader>
        <WindowContent>
          <AddFriendForm onSubmit={onSubmit} disabled={disabled} />
        </WindowContent>
      </Window>
    </div>
  );
}
