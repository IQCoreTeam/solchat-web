/**
 * AddFriendForm Component
 * - Form to send friend requests
 */

'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { TextField, Button, Frame } from 'react95';

interface AddFriendFormProps {
  onSubmit: (friendAddress: string) => Promise<void>;
  disabled?: boolean;
}

export function AddFriendForm({ onSubmit, disabled }: AddFriendFormProps) {
  const [friendAddress, setFriendAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate address
    try {
      new PublicKey(friendAddress.trim());
    } catch {
      setError('Invalid wallet address');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(friendAddress.trim());
      setFriendAddress(''); // Clear on success
    } catch (err) {
      console.error('[AddFriendForm] Error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '12px' }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '12px' }}>
          <label htmlFor="friendAddress" style={{ display: 'block', color: '#00ff00', fontSize: '11px',  marginBottom: '6px' }}>
            &gt; ADD FRIEND
          </label>
          <div style={{ width: '100%' }}>
            <input
              id="friendAddress"
              type="text"
              value={friendAddress}
              onChange={(e) => setFriendAddress(e.target.value)}
              placeholder="ENTER WALLET ADDRESS..."
              disabled={disabled || loading}
              style={{
                width: '100%',

                fontSize: '11px',
                padding: '4px 8px',
                background: '#000000',
                border: '2px solid #00ff00',
                color: '#00ff00',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>
          {error && <p style={{ color: '#ff0000', fontSize: '10px',marginTop: '6px' }}>&gt; ERROR: {error}</p>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Button
            type="submit"
            disabled={disabled || loading || !friendAddress.trim()}
            primary
            style={{  fontSize: '11px', minWidth: '150px' }}
          >
            {loading ? '[SENDING...]' : '[SEND REQUEST]'}
          </Button>
        </div>
      </form>
    </div>
  );
}
