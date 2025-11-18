'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useCloakSdk } from '@/lib/cloak/use-cloak-sdk';
import type { TransactionSigner } from '@cloak-dev/sdk';
import type { PrivyAppWallet } from '@/lib/wallet/privy-app-wallet';

interface PrivateEntryCardProps {
  privyWallet: PrivyAppWallet | null;
  onAfterAction?: () => void;
  className?: string;
}

export function PrivateEntryCard({ privyWallet, onAfterAction, className }: PrivateEntryCardProps) {
  const { connection } = useConnection();
  const wallet = useWallet(); // Use main wallet adapter for funding source
  const { getSdk } = useCloakSdk();
  const [amount, setAmount] = useState('0.1');
  const [delayMinutes, setDelayMinutes] = useState('0');
  const [statusLines, setStatusLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const appendStatus = (line: string) => setStatusLines((prev) => [...prev, line]);
  const resetStatus = () => {
    setStatusLines([]);
    setError(null);
  };

  const handleFund = async () => {
    if (!connection) {
      setError('Solana connection not available. Please refresh the page.');
      return;
    }
    if (!wallet.connected || !wallet.publicKey) {
      setError('Connect your funding wallet first.');
      return;
    }
    if (!wallet.signTransaction || !wallet.signMessage) {
      setError('Wallet must support transaction and message signing.');
      return;
    }

    const parsedAmount = Number(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError('Enter a valid amount greater than zero.');
      return;
    }

    // Use Privy wallet as destination
    if (!privyWallet) {
      setError('Please log in with Privy to use private funding.');
      return;
    }

    const destinationAddress = privyWallet.address;
    
    resetStatus();
    setIsProcessing(true);

    try {
      appendStatus('🔒 Initializing Cloak privacy protocol...');
      // Use main wallet SDK for the entire operation
      
      // Debug: log connection info
      console.log('🔍 Connection endpoint:', connection.rpcEndpoint);
      console.log('🔍 Wallet publicKey:', wallet.publicKey?.toBase58());
      
      appendStatus('📡 Getting Cloak SDK instance with main wallet...');
      const signingWallet = wallet as unknown as TransactionSigner;
      const sdk = await getSdk(signingWallet);
      
      appendStatus(`💰 Depositing ${parsedAmount} SOL from main wallet into privacy pool...`);
      appendStatus('⏳ Generating zero-knowledge proof (this may take a moment)...');
      
      const depositResult = await sdk.depositSol({
        amount: parsedAmount,
        onStatus: (line) => {
          appendStatus(`[Deposit] ${line}`);
        },
      });

      if (!depositResult.success) {
        throw new Error(depositResult.error || 'Deposit failed');
      }

      if (depositResult.signature) {
        appendStatus(`✓ Deposit successful! TX: ${depositResult.signature.slice(0, 12)}...`);
      }

      // Wait for the relayer to index the deposit UTXO
      appendStatus('');
      appendStatus('⏳ Waiting for relayer to index deposit...');
      
      // Wait 5 seconds initially before starting to poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const maxWaitTime = 60000; // 60 seconds max
      const pollInterval = 3000; // Check every 3 seconds
      const startTime = Date.now();
      let utxoIndexed = false;
      
      while (!utxoIndexed && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
        try {
          // Check if we have any UTXOs by getting balance (forceRefresh bypasses cache)
          const balance = await sdk.getSolBalance(undefined, true); // force refresh
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          
          if (balance.count > 0) {
            utxoIndexed = true;
            appendStatus(`✓ UTXO indexed! Found ${balance.count} UTXO(s)`);
          } else {
            appendStatus(`⏳ Checking... (${elapsed}s)`);
          }
        } catch {
          const elapsed = Math.round((Date.now() - startTime) / 1000);
          appendStatus(`⏳ Checking... (${elapsed}s)`);
        }
      }
      
      if (!utxoIndexed) {
        appendStatus('');
        appendStatus('⚠️ Relayer indexing timeout');
        appendStatus('💡 Your deposit succeeded but relayer is delayed');
        appendStatus('');
        throw new Error('Relayer indexing timeout. Try again in a few moments.');
      }

      const delay = Number(delayMinutes) || 0;
      appendStatus('');
      appendStatus(`🎯 Withdrawing to Privy wallet (${destinationAddress.slice(0, 8)}...)...`);
      
      appendStatus('⏳ Generating withdrawal proof...');
      
      const withdrawResult = await sdk.withdrawSol({
        amount: parsedAmount,
        recipientAddress: destinationAddress,
        delayMinutes: delay,
        onStatus: (line: string) => {
          appendStatus(`[Withdraw] ${line}`);
        },
      });

      if (withdrawResult.delayedWithdrawalId) {
        appendStatus('');
        appendStatus(`⏰ Withdrawal scheduled with ID: ${withdrawResult.delayedWithdrawalId}`);
        appendStatus(`🕐 Will execute at: ${withdrawResult.executeAt || 'pending relayer'}`);
        appendStatus('');
        appendStatus('✅ Private funding complete! Withdrawal will process automatically.');
      } else if (withdrawResult.signature) {
        appendStatus('');
        appendStatus(`✓ Withdrawal successful! TX: ${withdrawResult.signature.slice(0, 12)}...`);
        appendStatus('');
        appendStatus('✅ Private funding complete!');
      }

      onAfterAction?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      
      // Provide more helpful error messages
      let userMessage = message;
      if (message.includes('initialize')) {
        userMessage = '❌ SDK initialization failed. Please refresh and try again.';
      } else if (message.includes('signMessage')) {
        userMessage = '❌ Your wallet must support message signing for Cloak privacy.';
      } else if (message.includes('insufficient')) {
        userMessage = `❌ Insufficient balance. You need at least ${parsedAmount} SOL plus gas fees.`;
      } else if (message.includes('500')) {
        userMessage = '❌ Cloak relayer error (500). The relayer service may be down. Check console for details.';
      }
      
      setError(userMessage);
      appendStatus('');
      appendStatus(`❌ Error: ${message}`);
      appendStatus('Check browser console (F12) for full error details.');
      
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className={`rounded-xl border border-green-600/60 bg-black/80 p-6 shadow-[0_0_25px_rgba(16,185,129,0.15)] ${className ?? ''}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-green-400   text-xl">Private Funding Entry</h3>
        <span className="text-xs text-green-300  ">Powered by Cloak</span>
      </div>

      {!privyWallet && (
        <div className="bg-yellow-900/30 border border-yellow-600 p-4 mb-4">
          <p className="text-yellow-400   text-sm mb-2">
            ⚠️ No privacy wallet configured
          </p>
          <p className="text-yellow-300   text-xs">
            Please login with Privy to use private funding.
          </p>
        </div>
      )}

      <div className="space-y-4">
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
          onClick={handleFund}
          disabled={isProcessing || !wallet.connected}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-black   py-2 px-4 transition-colors"
        >
          {isProcessing ? 'Processing...' : 'Fund App Wallet Privately'}
        </button>
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
