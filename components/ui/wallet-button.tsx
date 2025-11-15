'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { useEffect, useState, useRef } from 'react';

export function WalletButton() {
  const { wallet, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [mounted, setMounted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleCopyAddress = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setDropdownOpen(false);
  };

  if (!mounted) {
    return (
      <div className="bg-black border-2 border-green-600/50 text-green-400 font-mono text-sm px-4 py-2 opacity-50">
        [LOADING...]
      </div>
    );
  }

  // Not connected - show connect button
  if (!publicKey || !wallet) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        className="bg-black border-2 border-green-600 hover:border-green-400 text-green-400 font-mono text-sm px-4 py-2 transition-colors disabled:opacity-50"
      >
        {connecting ? '[CONNECTING...]' : '[CONNECT WALLET]'}
      </button>
    );
  }

  // Connected - show dropdown
  const shortAddress = `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="bg-black border-2 border-green-600/50 hover:border-green-400 text-green-400 font-mono text-sm px-4 py-2 flex items-center gap-2 transition-colors"
      >
        <span>{shortAddress}</span>
        <svg
          className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-black border-2 border-green-600 shadow-lg shadow-green-600/20 z-50">
          <div className="p-2 border-b border-green-600/50">
            <div className="text-xs font-mono text-green-400/70 mb-1">[WALLET ADDRESS]</div>
            <div className="text-xs font-mono text-green-400">{shortAddress}</div>
          </div>
          <button
            onClick={handleCopyAddress}
            className="w-full text-left px-4 py-2 font-mono text-sm text-green-400 hover:bg-green-600/20 transition-colors border-b border-green-600/50"
          >
            {copied ? '[✓ COPIED]' : '[COPY ADDRESS]'}
          </button>
          <button
            onClick={handleDisconnect}
            className="w-full text-left px-4 py-2 font-mono text-sm text-red-400 hover:bg-red-600/20 transition-colors"
          >
            [DISCONNECT]
          </button>
        </div>
      )}
    </div>
  );
}
