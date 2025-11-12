'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';

export function WalletButton() {
  const { wallet, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="bg-green-600 text-black font-mono text-sm px-4 py-2 rounded opacity-50">
        Loading...
      </div>
    );
  }

  // Not connected - show connect button
  if (!publicKey || !wallet) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="bg-green-600 hover:bg-green-700 text-black font-mono text-sm px-4 py-2 rounded transition-colors disabled:opacity-50"
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    );
  }

  // Connected - show address and disconnect button
  const shortAddress = `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;

  return (
    <div className="flex items-center gap-2">
      <div className="bg-green-600 text-black font-mono text-sm px-4 py-2 rounded flex items-center gap-2">
        <span className="hidden sm:inline">{wallet.adapter.name}:</span>
        <span>{shortAddress}</span>
      </div>
      <button
        onClick={disconnect}
        className="bg-red-600 hover:bg-red-700 text-white font-mono text-sm px-3 py-2 rounded transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
}
