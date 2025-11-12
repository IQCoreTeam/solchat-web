'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useExternalSolanaWallet } from '@/lib/wallet/privy-app-wallet';

export function WalletButton() {
  const { ready, authenticated, login, logout, connectWallet } = usePrivy();
  const externalWallet = useExternalSolanaWallet();

  if (!ready) {
    return (
      <div className="bg-green-600 text-black font-mono text-sm px-4 py-2 rounded opacity-50">
        Loading...
      </div>
    );
  }

  // User is not authenticated at all
  if (!authenticated) {
    return (
      <button
        onClick={login}
        className="bg-green-600 hover:bg-green-700 text-black font-mono text-sm px-4 py-2 rounded transition-colors"
      >
        Login
      </button>
    );
  }

  // User is authenticated but no external wallet connected
  if (!externalWallet) {
    return (
      <button
        onClick={connectWallet}
        className="bg-green-600 hover:bg-green-700 text-black font-mono text-sm px-4 py-2 rounded transition-colors"
      >
        Connect Wallet
      </button>
    );
  }

  // User has external wallet connected
  const shortAddress = `${externalWallet.address.slice(0, 4)}...${externalWallet.address.slice(-4)}`;

  return (
    <div className="flex items-center gap-2">
      <div className="bg-green-600 text-black font-mono text-sm px-4 py-2 rounded">
        {shortAddress}
      </div>
      <button
        onClick={logout}
        className="bg-red-600 hover:bg-red-700 text-white font-mono text-sm px-3 py-2 rounded transition-colors"
      >
        Disconnect
      </button>
    </div>
  );
}
