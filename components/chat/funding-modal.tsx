'use client';

import { useState } from 'react';
import { Window, WindowHeader, WindowContent, Button } from 'react95';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

type FundingModalProps = {
  open: boolean;
  walletAddress: string | null;
  balanceLamports: number | null;
  isChecking: boolean;
  onRetry: () => void;
  onClose: () => void;
};

export function FundingModal({
  open,
  walletAddress,
  balanceLamports,
  isChecking,
  onRetry,
  onClose,
}: FundingModalProps) {
  const [copied, setCopied] = useState(false);

  if (!open || !walletAddress) return null;

  const balanceSol =
    balanceLamports !== null ? (balanceLamports / LAMPORTS_PER_SOL).toFixed(4) : '0.0000';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
      <Window style={{ width: '100%', maxWidth: '480px' }}>
        <WindowHeader
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <span>[FUND YOUR WALLET]</span>
          <Button onClick={onClose} size="sm" style={{ padding: '2px 8px', fontSize: '10px' }}>
            X
          </Button>
        </WindowHeader>
        <WindowContent>
          <div style={{ fontSize: '12px', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '8px' }}>
              Your wallet has <strong>{balanceSol} SOL</strong>.
            </p>
            <p style={{ marginBottom: '12px' }}>
              You need at least <strong>0.005 SOL</strong> to initialize your on-chain account.
              Send SOL to the address below, then click <strong>Check balance</strong>.
            </p>
            <div
              style={{
                background: '#fff',
                border: '2px inset #c0c0c0',
                padding: '8px',
                marginBottom: '12px',
                wordBreak: 'break-all',
                fontFamily: 'monospace',
                fontSize: '11px',
              }}
            >
              {walletAddress}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button onClick={handleCopy}>{copied ? 'Copied!' : 'Copy address'}</Button>
              <Button onClick={onRetry} disabled={isChecking}>
                {isChecking ? 'Checking...' : 'Check balance'}
              </Button>
            </div>
          </div>
        </WindowContent>
      </Window>
    </div>
  );
}
