'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import wallet button to avoid SSR issues
const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export function WalletButton() {
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

  return (
    <WalletMultiButtonDynamic className="!bg-green-600 hover:!bg-green-700 !text-black !font-mono !text-sm !px-4 !py-2 !rounded" />
  );
}
