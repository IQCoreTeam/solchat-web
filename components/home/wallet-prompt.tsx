'use client';

import { useState } from 'react';
import { useAppWallet } from '@/lib/wallet/use-app-wallet';
import { WalletConnectModal } from '@/components/ui/wallet-connect-modal';

export function WalletPrompt() {
  const { connected } = useAppWallet();
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  if (connected || dismissed) {
    return null;
  }

  return (
    <>
      <div className="fixed bottom-4 right-4 bg-green-900/90 border-2 border-green-400 p-4 max-w-sm backdrop-blur-sm z-50">
        <div className="flex items-start gap-3">
          <div className="flex-1">
            <p className="text-green-400   text-sm mb-2">
              💡 <strong>Connect your wallet</strong> to start chatting
            </p>
            <button
              onClick={() => setModalOpen(true)}
              className="bg-green-600 hover:bg-green-700 text-black   text-xs px-3 py-1.5 transition-colors"
            >
              Connect Wallet
            </button>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-green-400 hover:text-green-300   text-lg leading-none"
          >
            ×
          </button>
        </div>
      </div>
      <WalletConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
