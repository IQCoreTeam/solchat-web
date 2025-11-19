/**
 * AddFriendForm Component
 * - Form to send friend requests
 */

'use client';

import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';

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
    <form onSubmit={handleSubmit} className="bg-black/40 border-2 border-green-700/50 p-4 rounded">
      <div className="mb-3">
        <label htmlFor="friendAddress" className="block text-green-400 text-sm   mb-2">
          Add Friend
        </label>
        <input
          id="friendAddress"
          type="text"
          value={friendAddress}
          onChange={(e) => setFriendAddress(e.target.value)}
          placeholder="Enter wallet address..."
          disabled={disabled || loading}
          className="w-full bg-black border-2 border-green-700 text-green-400 px-3 py-2 rounded   text-sm focus:border-green-500 focus:outline-none placeholder:text-green-900 disabled:opacity-50"
        />
        {error && <p className="text-red-400 text-xs mt-2  ">{error}</p>}
      </div>

      <button
        type="submit"
        disabled={disabled || loading || !friendAddress.trim()}
        className="w-full bg-green-700 hover:bg-green-600 disabled:bg-green-900 disabled:opacity-50 text-green-100 px-4 py-2 rounded   text-sm transition-colors"
      >
        {loading ? '[SENDING...]' : '[SEND REQUEST]'}
      </button>
    </form>
  );
}
