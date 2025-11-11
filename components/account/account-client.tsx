'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import account info to avoid SSR wallet context issues
const AccountInfoDynamic = dynamic(
  () => import('./account-info').then((mod) => ({ default: mod.AccountInfo })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-green-400 font-mono">Loading account...</div>
      </div>
    ),
  }
);

export function AccountClient() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <div className="text-green-400 font-mono">Loading account...</div>
      </div>
    );
  }

  return <AccountInfoDynamic />;
}
