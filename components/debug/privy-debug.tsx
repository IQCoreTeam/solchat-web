'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect } from 'react';

export function PrivyDebug() {
  const { ready, authenticated, user, login } = usePrivy();

  useEffect(() => {
    console.log('🔍 Privy Debug:', {
      ready,
      authenticated,
      user: user ? 'User exists' : 'No user',
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
      clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID ? 'Set' : 'Not set',
    });
  }, [ready, authenticated, user]);

  if (!ready) {
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-900 border border-yellow-600 p-3 rounded">
        <p className="text-yellow-300   text-xs">
          Privy Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-[#1C1E27] border border-[#6C4DFF] p-3 rounded">
      <p className="text-[#00E0E0]   text-xs mb-2">
        ✓ Privy Ready
      </p>
      <p className="text-[#7A8CFF]   text-xs">
        Auth: {authenticated ? '✓' : '✗'}
      </p>
      {!authenticated && (
        <button
          onClick={login}
          className="mt-2 bg-[#6C4DFF] text-[#0A0A0F]   text-xs px-2 py-1 hover:bg-[#7A8CFF]"
        >
          Test Login
        </button>
      )}
    </div>
  );
}
