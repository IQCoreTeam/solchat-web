'use client';

import { useEffect, useState } from 'react';
import { getMobileBrowserInfo } from '@/lib/wallet/mobile-detection';

export function MobileWalletBanner() {
  const [mobileInfo, setMobileInfo] = useState<ReturnType<typeof getMobileBrowserInfo> | null>(
    null
  );
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setMobileInfo(getMobileBrowserInfo());
  }, []);

  // Don't render until client-side
  if (!mounted) {
    return null;
  }

  // Don't show if not mobile or already dismissed
  if (!mobileInfo?.isMobile || dismissed) {
    return null;
  }

  // If wallet is already detected, show success message
  if (mobileInfo.hasWallet) {
    return (
      <div className="bg-[#1C1E27]/50 border-2 border-[#7A8CFF] p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[#7A8CFF]   text-sm">
              ✓ {mobileInfo.walletName || 'Mobile Wallet'} detected and ready!
            </p>
            <p className="text-[#00E0E0]   text-xs mt-1">
              Click &quot;Select Wallet&quot; to connect
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-[#7A8CFF] hover:text-[#00E0E0]   text-xl"
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
