'use client';

import { useMemo, useState } from 'react';
import { getMobileBrowserInfo } from '@/lib/wallet/mobile-detection';

export function MobileWalletBanner() {
  const mobileInfo = useMemo<ReturnType<typeof getMobileBrowserInfo> | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return getMobileBrowserInfo();
  }, []);
  const [dismissed, setDismissed] = useState(false);

  // Don't show if not mobile or already dismissed
  if (!mobileInfo?.isMobile || dismissed) {
    return null;
  }

  // If wallet is already detected, show success message
  if (mobileInfo.hasWallet) {
    return (
      <div className="bg-green-900/50 border-2 border-green-400 p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-400   text-sm">
              ✓ {mobileInfo.walletName || 'Mobile Wallet'} detected and ready!
            </p>
            <p className="text-green-300   text-xs mt-1">
              Click &quot;Select Wallet&quot; to connect
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-green-400 hover:text-green-300   text-xl"
          >
            ×
          </button>
        </div>
      </div>
    );
  }

  // Show instructions if no wallet detected
  return (
    <div className="bg-yellow-900/50 border-2 border-yellow-400 p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-yellow-400   text-sm    mb-2">
            📱 Mobile Wallet Required
          </p>
          <div className="text-yellow-300   text-xs space-y-1">
            <p>To use SolChat on mobile:</p>
            <ol className="list-decimal list-inside ml-2 mt-2 space-y-1">
              <li>Open Phantom or Solflare mobile app</li>
              <li>Tap the browser icon (🔍 Explore)</li>
              <li>Navigate to this website</li>
              <li>Connect your wallet</li>
            </ol>
            <p className="mt-3 text-yellow-200">
              💡 For Solana Saga/Seeker phones: The wallet will connect automatically!
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-yellow-400 hover:text-yellow-300   text-xl ml-2"
        >
          ×
        </button>
      </div>
    </div>
  );
}
