'use client';

import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useCloakSdk } from '@/lib/cloak/use-cloak-sdk';
import type { PrivyAppWallet } from '@/lib/wallet/privy-app-wallet';
import { usePrivyWalletAdapter } from '@/lib/wallet/privy-wallet-adapter';

interface PrivateExitCardProps {
  privyWallet: PrivyAppWallet | null;
  onAfterAction?: () => void;
  className?: string;
}

export function PrivateExitCard({ privyWallet, onAfterAction, className }: PrivateExitCardProps) {
  const wallet = usePrivyWalletAdapter();
  const { getSdk } = useCloakSdk();

  const [amount, setAmount] = useState('0.1');
  const [recipient, setRecipient] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (wallet.publicKey) {
      setRecipient(wallet.publicKey.toBase58());
    }
  }, [wallet.publicKey]);

  const appendStatus = (line: string) => setStatusLines((prev) => [...prev, line]);
  const resetStatus = () => {
    setStatusLines([]);
    setError(null);
  };

  const handleExit = async () => {
    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    let recipientKey: PublicKey;
    try {
      recipientKey = new PublicKey(recipient);
    } catch {
      setError('Enter a valid recipient address.');
      return;
    }

    // Use Privy wallet
    if (!privyWallet) {
      setError('Please log in with Privy to use private exit.');
      return;
    }

    const walletForSdk = privyWallet.walletClient;
    appendStatus('ℹ️  Note: Privy wallet signing requires user confirmation');

    resetStatus();
    setIsProcessing(true);

    try {
      const sdk = await getSdk(walletForSdk);

      appendStatus('Depositing from app wallet into Cloak pool...');
      const depositResult = await sdk.depositSol({
        amount: parsedAmount,
        onStatus: (line) => appendStatus(`[Deposit] ${line}`),
      });
      if (!depositResult.success) {
        throw new Error(depositResult.error || 'Deposit failed');
      }
      if (depositResult.signature) {
        appendStatus(`[Deposit] Signature: ${depositResult.signature}`);
      }

      const delay = Number(delayMinutes) || 0;
      appendStatus('Scheduling withdrawal to recipient...');
      const withdrawResult = await sdk.withdrawSol({
        amount: parsedAmount,
        recipientAddress: recipientKey,
        delayMinutes: delay,
        onStatus: (line) => appendStatus(`[Withdraw] ${line}`),
      });

      if (withdrawResult.delayedWithdrawalId) {
        appendStatus(
          `[Withdraw] Scheduled with ID ${withdrawResult.delayedWithdrawalId} for ${withdrawResult.executeAt || 'later'}`
        );
      } else if (withdrawResult.signature) {
        appendStatus(`[Withdraw] Signature: ${withdrawResult.signature}`);
      }

      onAfterAction?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`rounded-xl border border-green-600/60 bg-black/80 p-6 shadow-[0_0_25px_rgba(16,185,129,0.15)] ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-green-400   text-xl">Private Exit</h3>
        <span className="text-xs text-green-300  ">Powered by Cloak</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-green-400   text-sm block mb-2">Recipient Address</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full bg-black border border-green-600 text-green-400   p-2 outline-none focus:border-green-400"
            placeholder="Destination address"
          />
        </div>

        <div>
          <label className="text-green-400   text-sm block mb-2">Amount (SOL)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-black border border-green-600 text-green-400   p-2 outline-none focus:border-green-400"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="text-green-400   text-sm block mb-2">Delay Minutes (optional)</label>
          <input
            type="number"
            min="0"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(e.target.value)}
            className="w-full bg-black border border-green-600 text-green-400   p-2 outline-none focus:border-green-400"
            placeholder="0"
          />
        </div>

        <button
          onClick={handleExit}
          disabled={isProcessing || !privyWallet}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-black   py-2 px-4 transition-colors"
        >
          {isProcessing ? 'Processing...' : 'Withdraw Privately'}
        </button>
        {!privyWallet && (
          <p className="text-yellow-300   text-xs">
            Login with Privy to enable private exits.
          </p>
        )}
        {privyWallet && (
          <p className="text-xs text-green-400   mt-2">
            🔒 Using secure Privy wallet
          </p>
        )}
      </div>

      {error && <p className="text-red-400   text-sm mt-4">{error}</p>}

      {statusLines.length > 0 && (
        <div className="mt-4 border border-green-600 p-3 space-y-1 max-h-48 overflow-y-auto">
          {statusLines.map((line, idx) => (
            <p key={`${line}-${idx}`} className="text-green-300   text-xs">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
