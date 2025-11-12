'use client';

import { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, Keypair } from '@solana/web3.js';
import { useCloakSdk } from '@/lib/cloak/use-cloak-sdk';
import { addCloakRecord, updateCloakRecord } from '@/lib/cloak/storage';
import type { PrivyAppWallet } from '@/lib/wallet/privy-app-wallet';

const uniqueId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface PrivateExitCardProps {
  appWallet: Keypair | null;
  privyWallet: PrivyAppWallet | null;
  ensureAppWallet: () => Keypair;
  onAfterAction?: () => void;
  onRecordsChanged?: () => void;
}

export function PrivateExitCard({ appWallet, privyWallet, ensureAppWallet, onAfterAction, onRecordsChanged }: PrivateExitCardProps) {
  const { publicKey: walletPubkey } = useWallet();
  const { getSdk } = useCloakSdk();
  
  // Use Privy wallet if available, otherwise fall back to localStorage wallet
  const activeWalletAddress = privyWallet?.address || (appWallet ? appWallet.publicKey.toBase58() : null);

  const [amount, setAmount] = useState('0.1');
  const [recipient, setRecipient] = useState('');
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (walletPubkey) {
      setRecipient(walletPubkey.toBase58());
    }
  }, [walletPubkey]);

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

    // Determine wallet source
    let walletForSdk: any;
    let appAddress: string;
    
    if (privyWallet) {
      // For Privy wallet, we pass the wallet client
      walletForSdk = privyWallet.walletClient;
      appAddress = privyWallet.address;
      appendStatus('ℹ️  Note: Privy wallet signing requires user confirmation');
    } else {
      // For legacy wallet, use keypair
      const legacyWallet = appWallet ?? ensureAppWallet();
      walletForSdk = legacyWallet;
      appAddress = legacyWallet.publicKey.toBase58();
    }

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
    <div className="bg-black border-2 border-green-600 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-green-400 font-mono text-xl">Private Exit</h3>
        <span className="text-xs text-green-300 font-mono">Powered by Cloak</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="text-green-400 font-mono text-sm block mb-2">Recipient Address</label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="w-full bg-black border border-green-600 text-green-400 font-mono p-2 outline-none focus:border-green-400"
            placeholder="Destination address"
          />
        </div>

        <div>
          <label className="text-green-400 font-mono text-sm block mb-2">Amount (SOL)</label>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-black border border-green-600 text-green-400 font-mono p-2 outline-none focus:border-green-400"
            placeholder="0.00"
          />
        </div>

        <div>
          <label className="text-green-400 font-mono text-sm block mb-2">Delay Minutes (optional)</label>
          <input
            type="number"
            min="0"
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(e.target.value)}
            className="w-full bg-black border border-green-600 text-green-400 font-mono p-2 outline-none focus:border-green-400"
            placeholder="0"
          />
        </div>

        <button
          onClick={handleExit}
          disabled={isProcessing || (!privyWallet && !appWallet)}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-black font-mono py-2 px-4 transition-colors"
        >
          {isProcessing ? 'Processing...' : 'Withdraw Privately'}
        </button>
        {!privyWallet && !appWallet && (
          <p className="text-yellow-300 font-mono text-xs">
            Login with Privy or generate a legacy wallet to enable private exits.
          </p>
        )}
        {privyWallet && (
          <p className="text-xs text-green-400 font-mono mt-2">
            🔒 Using secure Privy wallet
          </p>
        )}
      </div>

      {error && <p className="text-red-400 font-mono text-sm mt-4">{error}</p>}

      {statusLines.length > 0 && (
        <div className="mt-4 border border-green-600 p-3 space-y-1 max-h-48 overflow-y-auto">
          {statusLines.map((line, idx) => (
            <p key={`${line}-${idx}`} className="text-green-300 font-mono text-xs">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
