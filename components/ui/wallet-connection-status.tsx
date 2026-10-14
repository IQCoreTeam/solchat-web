'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

/** Connection feedback stays mounted so a rejected picker request remains visible. */
export function WalletConnectionStatus() {
  const { wallet, wallets, connected, connecting, connect } = useWallet();
  const { setVisible } = useWalletModal();
  const [error, setError] = useState('');
  useEffect(() => {
    const report = (failure: Error) =>
      setError(failure.message || 'Connection failed.');
    const clear = () => setError('');
    for (const { adapter } of wallets) {
      adapter.on('error', report);
      adapter.on('connect', clear);
    }
    return () => {
      for (const { adapter } of wallets) {
        adapter.off('error', report);
        adapter.off('connect', clear);
      }
    };
  }, [wallets]);

  if (connected || (!connecting && !error && !wallet)) return null;
  async function retry() {
    if (connecting) return;
    setError('');
    if (!wallet) {
      setVisible(true);
      return;
    }
    try {
      await connect();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Connection failed.',
      );
    }
  }
  return (
    <div style={{ maxWidth: 320, color: '#86efac', fontSize: 12 }}>
      {connecting ? (
        <p role="status">
          Open and unlock your wallet, then approve the connection there. Cancel
          in the wallet to choose another.
        </p>
      ) : (
        <>
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            onClick={retry}
            style={{ padding: 8, border: '1px solid #4ade80' }}
          >
            Retry connection
          </button>
          <button
            type="button"
            onClick={() => {
              setError('');
              setVisible(true);
            }}
            style={{ padding: 8 }}
          >
            Choose wallet
          </button>
        </>
      )}
    </div>
  );
}
