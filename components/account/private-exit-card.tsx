'use client';

import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useCloakSdk } from '@/lib/cloak/use-cloak-sdk';
import { addCloakRecord, updateCloakRecord } from '@/lib/cloak/storage';
import type { PrivyAppWallet } from '@/lib/wallet/privy-app-wallet';
import { usePrivyWalletAdapter } from '@/lib/wallet/privy-wallet-adapter';

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface PrivateExitCardProps {
  privyWallet: PrivyAppWallet | null;
  onAfterAction?: () => void;
  onRecordsChanged?: () => void;
}

export function PrivateExitCard({ privyWallet, onAfterAction, onRecordsChanged }: PrivateExitCardProps) {
  const wallet = usePrivyWalletAdapter();
  const { getSdk } = useCloakSdk();

  const activeWalletAddress = privyWallet?.address || null;

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
  }, [wallet.publicKey?.toBase58()]);

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
    const appAddress = privyWallet.address;
    appendStatus('ℹ️  Note: Privy wallet signing requires user confirmation');

    resetStatus();
    setIsProcessing(true);

    const recordId = uniqueId();
    addCloakRecord(appAddress, {
      id: recordId,
      type: 'exit',
      amount: parsedAmount,
      createdAt: new Date().toISOString(),
      status: 'pending',
      recipient: recipientKey.toBase58(),
      note: 'Private exit scheduled via Cloak',
    });
    onRecordsChanged?.();

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

      updateCloakRecord(appAddress, recordId, {
        status: withdrawResult.delayedWithdrawalId && !withdrawResult.success ? 'pending' : 'completed',
        signature: withdrawResult.signature,
        delayedWithdrawalId: withdrawResult.delayedWithdrawalId,
        executeAt: withdrawResult.executeAt,
        note: withdrawResult.delayedWithdrawalId
          ? 'Withdrawal scheduled via Cloak relayer.'
          : 'Withdrawal completed.',
      });
      onRecordsChanged?.();

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
      updateCloakRecord(appAddress, recordId, {
        status: 'failed',
        note: message,
      });
      onRecordsChanged?.();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[#7A8CFF]   text-xl">Private Exit</h3>
        <span className="text-xs text-[#00E0E0]  ">Powered by Cloak</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-[#7A8CFF]   text-sm block mb-2">Recipient Address</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full bg-[#0A0A0F] border border-[#6C4DFF] text-[#7A8CFF]   p-2 outline-none focus:border-[#7A8CFF]"
            placeholder="Destination address"
          />
        </div>

        <div>
          <label className="text-[#7A8CFF]   text-sm block mb-2">Amount (SOL)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-[#0A0A0F] border border-[#6C4DFF] text-[#7A8CFF]   p-2 outline-none focus:border-[#7A8CFF]"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="text-[#7A8CFF]   text-sm block mb-2">Delay Minutes (optional)</label>
          <input
            type="number"
            min="0"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(e.target.value)}
            className="w-full bg-[#0A0A0F] border border-[#6C4DFF] text-[#7A8CFF]   p-2 outline-none focus:border-[#7A8CFF]"
            placeholder="0"
          />
        </div>

        <button
          onClick={handleExit}
          disabled={isProcessing || !privyWallet}
          className="w-full bg-[#6C4DFF] hover:bg-[#5A3DE6] disabled:bg-[#2A2D36] text-[#0A0A0F]   py-2 px-4 transition-colors"
        >
          {isProcessing ? 'Processing...' : 'Withdraw Privately'}
        </button>
        {!privyWallet && (
          <p className="text-yellow-300   text-xs">
            Login with Privy to enable private exits.
          </p>
        )}
        {privyWallet && (
          <p className="text-xs text-[#7A8CFF]   mt-2">
            🔒 Using secure Privy wallet
          </p>
        )}
      </div>

      {error && <p className="text-red-400   text-sm mt-4">{error}</p>}

      {statusLines.length > 0 && (
        <div className="mt-4 border border-[#6C4DFF] p-3 space-y-1 max-h-48 overflow-y-auto">
          {statusLines.map((line, idx) => (
            <p key={`${line}-${idx}`} className="text-[#00E0E0]   text-xs">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
