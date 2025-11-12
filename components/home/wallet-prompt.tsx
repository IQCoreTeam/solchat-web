'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState } from 'react';

export function WalletPrompt() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || publicKey || dismissed) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-green-900/90 border-2 border-green-400 p-4 max-w-sm backdrop-blur-sm z-50">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-green-400 font-mono text-sm mb-2">
            💡 <strong>Connect your wallet</strong> to start chatting
          </p>
          <button
            onClick={() => setVisible(true)}
            className="bg-green-600 hover:bg-green-700 text-black font-mono text-xs px-3 py-1.5 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-green-400 hover:text-green-300 font-mono text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
