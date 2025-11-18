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
    <div className="fixed bottom-4 right-4 bg-[#1C1E27]/90 border-2 border-[#7A8CFF] p-4 max-w-sm backdrop-blur-sm z-50">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[#7A8CFF]   text-sm mb-2">
            💡 <strong>Connect your wallet</strong> to start chatting
          </p>
          <button
            onClick={() => setVisible(true)}
            className="bg-[#6C4DFF] hover:bg-[#5A3DE6] text-[#0A0A0F]   text-xs px-3 py-1.5 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-[#7A8CFF] hover:text-[#00E0E0]   text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );
}
