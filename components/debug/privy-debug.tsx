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
        <p className="text-yellow-300 font-mono text-xs">
          Privy Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-green-900 border border-green-600 p-3 rounded">
      <p className="text-green-300 font-mono text-xs mb-2">
        ✓ Privy Ready
      </p>
      <p className="text-green-400 font-mono text-xs">
        Auth: {authenticated ? '✓' : '✗'}
      </p>
      {!authenticated && (
        <button
          onClick={login}
          className="mt-2 bg-green-600 text-black font-mono text-xs px-2 py-1 hover:bg-green-500"
        >
          Test Login
        </button>
      )}
    </div>
  );
}
