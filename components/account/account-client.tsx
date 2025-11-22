'use client';

import dynamic from 'next/dynamic';

// Dynamically import account info to avoid SSR wallet context issues
const AccountInfoDynamic = dynamic(
  () => import('./account-info').then((mod) => ({ default: mod.AccountInfo })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full p-6">
        <div >Loading account...</div>
      </div>
    ),
  }
);

export function AccountClient() {
  return <AccountInfoDynamic />;
}
