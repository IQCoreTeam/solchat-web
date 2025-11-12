'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { lamportsToSol, ellipsify } from '@/lib/iq/utils';
import { sendSol, requestAirdrop } from '@/lib/iq/transaction';
import { getBonkBalance } from '@/lib/token/bonk';
import { PrivateEntryCard } from './private-entry-card';
import { PrivateExitCard } from './private-exit-card';
import { CloakTransferRecord, listCloakRecords } from '@/lib/cloak/storage';
import { usePrivyAppWallet, useHasPrivyWallet, useExternalSolanaWallet } from '@/lib/wallet/privy-app-wallet';
import { usePrivyWalletAdapter, usePrivyConnection } from '@/lib/wallet/privy-wallet-adapter';

export function AccountInfo() {
  const { connection } = usePrivyConnection();
  const wallet = usePrivyWalletAdapter();
  const { ready: privyReady, authenticated, login } = usePrivy();
  const privyWallet = usePrivyAppWallet();
  const hasPrivyWallet = useHasPrivyWallet();

  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendingSOL, setSendingSOL] = useState(false);
  const [requestingAirdrop, setRequestingAirdrop] = useState(false);
  const [message, setMessage] = useState('');

  const [cloakHistory, setCloakHistory] = useState<CloakTransferRecord[]>([]);

  // Debug logging - only run once
  useEffect(() => {
    console.log('🔍 Privy Debug:', {
      ready: privyReady,
      authenticated,
      user: authenticated ? 'User exists' : 'No user',
      appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID || 'Not set',
      clientId: process.env.NEXT_PUBLIC_PRIVY_CLIENT_ID || 'Not set',
    });
  }, [privyReady, authenticated]);

  useEffect(() => {
    // Load cloak history for Privy wallet if available
    if (privyWallet?.address) {
      setCloakHistory(listCloakRecords(privyWallet.address));
    }
  }, [privyWallet?.address]);

  const refreshCloakHistory = () => {
    if (privyWallet) {
      setCloakHistory(listCloakRecords(privyWallet.address));
    }
  };


  // Fetch SOL balance
  const { data: balance, refetch: refetchBalance } = useQuery({
    queryKey: ['balance', wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (!wallet.publicKey) return 0;
      const bal = await connection.getBalance(wallet.publicKey);
      return lamportsToSol(bal);
    },
    enabled: !!wallet.publicKey,
    refetchInterval: 10000,
  });

  // Fetch BONK balance
  const { data: bonkBalance, refetch: refetchBonk } = useQuery({
    queryKey: ['bonk-balance', wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (!wallet.publicKey) return 0;
      return await getBonkBalance(connection, wallet.publicKey);
    },
    enabled: !!wallet.publicKey,
    refetchInterval: 10000,
  });

  // Fetch token accounts
  const { data: tokens } = useQuery({
    queryKey: ['tokens', wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (!wallet.publicKey) return [];
      const accounts = await connection.getParsedTokenAccountsByOwner(wallet.publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
      return accounts.value.map((acc) => ({
        mint: acc.account.data.parsed.info.mint,
        amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: acc.account.data.parsed.info.tokenAmount.decimals,
      }));
    },
    enabled: !!wallet.publicKey,
  });

  const handleSendSOL = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !sendAddress || !sendAmount) {
      setMessage('Please fill in all fields');
      return;
    }

    try {
      setSendingSOL(true);
      setMessage('Sending SOL...');

      const txid = await sendSol(
        connection,
        wallet as any,
        new PublicKey(sendAddress),
        parseFloat(sendAmount)
      );

      setMessage(`Success! TX: ${ellipsify(txid, 8)}`);
      setSendAddress('');
      setSendAmount('');
      refetchBalance();
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setSendingSOL(false);
    }
  };

  const handleAirdrop = async () => {
    if (!wallet.publicKey) return;

    try {
      setRequestingAirdrop(true);
      setMessage('Requesting airdrop...');

      const txid = await requestAirdrop(connection, wallet.publicKey, 1);

      setMessage(`Success! TX: ${ellipsify(txid, 8)}`);
      refetchBalance();
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setRequestingAirdrop(false);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-green-400 font-mono text-xl">
            Please connect your wallet to view account info
          </p>
        </div>
      </div>
    );
  }

  const handleCloakSuccess = () => {
    refetchBalance();
    refetchBonk();
    refreshCloakHistory();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Privy Wallet Section - Prominent at Top */}
      {!authenticated && (
        <div className="bg-gradient-to-r from-green-900/30 to-green-800/30 border-2 border-green-500 p-8 mb-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-green-400 font-mono text-2xl mb-2 flex items-center gap-2">
                🔒 Secure Your Privacy Wallet
              </h2>
              <p className="text-green-300 font-mono text-sm mb-3">
                Create a secure embedded wallet with Privy for private transactions
              </p>
              <ul className="text-xs text-green-400 font-mono space-y-1 mb-4">
                <li>✓ Enterprise-grade security</li>
                <li>✓ Cross-device access</li>
                <li>✓ No seed phrases to manage</li>
                <li>✓ Required for Cloak privacy features</li>
              </ul>
            </div>
            <button
              onClick={login}
              className="bg-green-600 hover:bg-green-500 text-black font-mono px-8 py-4 text-lg font-bold transition-all transform hover:scale-105"
            >
              🚀 Login with Privy
            </button>
          </div>
        </div>
      )}

      {authenticated && privyWallet && (
        <div className="bg-green-900/20 border-2 border-green-600 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-green-400 font-mono text-xl mb-2 flex items-center gap-2">
                🔒 Privy Wallet Active
              </h3>
              <p className="text-green-300 font-mono text-sm break-all mb-2">
                {privyWallet.address}
              </p>
              <span className="text-xs bg-green-600 text-black font-mono px-2 py-1">
                SECURED BY PRIVY
              </span>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(privyWallet.address);
                setMessage('Privy wallet address copied!');
              }}
              className="bg-green-600 hover:bg-green-700 text-black font-mono px-4 py-2 transition-colors"
            >
              Copy Address
            </button>
          </div>
        </div>
      )}

      <div className="bg-black border-2 border-green-600 p-6 mb-6">
        <h2 className="text-green-400 font-mono text-2xl mb-4">Account Overview</h2>

        <div className="space-y-3">
          <div>
            <span className="text-green-400 font-mono">Address:</span>
            <p className="text-green-300 font-mono text-sm break-all">
              {wallet.publicKey?.toBase58()}
            </p>
          </div>

          <div>
            <span className="text-green-400 font-mono">SOL Balance:</span>
            <p className="text-green-300 font-mono text-xl">
              {balance !== undefined ? balance.toFixed(4) : '...'} SOL
            </p>
          </div>

          <div>
            <span className="text-green-400 font-mono">BONK Balance:</span>
            <p className="text-green-300 font-mono text-xl">
              {bonkBalance !== undefined ? bonkBalance.toFixed(2) : '...'} BONK
            </p>
          </div>
        </div>
      </div>

      <div className="bg-black border-2 border-green-600 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-green-400 font-mono text-xl">App Wallet (Private)</h3>
          <div className="space-x-2">
            {privyWallet ? (
              <span className="bg-green-600 text-black font-mono px-3 py-1">
                🔒 Privy Secured
              </span>
            ) : authenticated ? (
              <span className="bg-yellow-600 text-black font-mono px-3 py-1">
                Creating...
              </span>
            ) : (
              <button
                onClick={login}
                className="bg-green-600 hover:bg-green-700 text-black font-mono px-3 py-1 transition-colors"
              >
                Login with Privy
              </button>
            )}
          </div>
        </div>
        {privyWallet ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-green-900 text-green-400 font-mono px-2 py-1">PRIVY MANAGED</span>
              <span className="text-xs text-green-400 font-mono">Secure, cross-device access</span>
            </div>
            <p className="text-green-300 font-mono text-sm break-all">{privyWallet.address}</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(privyWallet.address);
                setMessage('Privy wallet address copied!');
              }}
              className="bg-green-600 hover:bg-green-700 text-black font-mono px-3 py-1 transition-colors"
            >
              Copy Address
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-green-300 font-mono text-sm">
              Create a secure embedded wallet for private transactions.
            </p>
            <p className="text-xs text-green-400 font-mono">
              ✓ Secure key management<br />
              ✓ Cross-device access<br />
              ✓ No seed phrases to manage
            </p>
          </div>
        )}
      </div>

      <div className="bg-black border-2 border-green-600 p-6 mb-6">
        <h3 className="text-green-400 font-mono text-xl mb-4">Send SOL</h3>

        <div className="space-y-4">
          <div>
            <label className="text-green-400 font-mono text-sm block mb-2">
              Recipient Address:
            </label>
            <input
              type="text"
              value={sendAddress}
              onChange={(e) => setSendAddress(e.target.value)}
              className="w-full bg-black border border-green-600 text-green-400 font-mono p-2 outline-none focus:border-green-400"
              placeholder="Enter Solana address..."
            />
          </div>

          <div>
            <label className="text-green-400 font-mono text-sm block mb-2">Amount (SOL):</label>
            <input
              type="number"
              step="0.01"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              className="w-full bg-black border border-green-600 text-green-400 font-mono p-2 outline-none focus:border-green-400"
              placeholder="0.00"
            />
          </div>

          <button
            onClick={handleSendSOL}
            disabled={sendingSOL || !sendAddress || !sendAmount}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-black font-mono py-2 px-4 transition-colors"
          >
            {sendingSOL ? 'Sending...' : 'Send SOL'}
          </button>
        </div>
      </div>

      <div className="bg-black border-2 border-green-600 p-6 mb-6">
        <h3 className="text-green-400 font-mono text-xl mb-4">Request Airdrop (Devnet)</h3>

        <button
          onClick={handleAirdrop}
          disabled={requestingAirdrop}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-black font-mono py-2 px-4 transition-colors"
        >
          {requestingAirdrop ? 'Requesting...' : 'Request 1 SOL'}
        </button>
      </div>

      <PrivateEntryCard
        privyWallet={privyWallet}
        onAfterAction={handleCloakSuccess}
        onRecordsChanged={refreshCloakHistory}
      />

      <PrivateExitCard
        privyWallet={privyWallet}
        onAfterAction={handleCloakSuccess}
        onRecordsChanged={refreshCloakHistory}
      />

      {tokens && tokens.length > 0 && (
        <div className="bg-black border-2 border-green-600 p-6 mb-6">
          <h3 className="text-green-400 font-mono text-xl mb-4">Token Accounts</h3>

          <div className="space-y-2">
            {tokens.map((token, index) => (
              <div key={index} className="border border-green-600 p-3">
                <p className="text-green-400 font-mono text-xs break-all">Mint: {token.mint}</p>
                <p className="text-green-300 font-mono">
                  Balance: {token.amount?.toFixed(token.decimals || 0) || 0}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {privyWallet && (
        <div className="bg-black border-2 border-green-600 p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-green-400 font-mono text-xl">Cloak Transfer History</h3>
            <button
              onClick={refreshCloakHistory}
              className="text-xs text-green-300 underline"
            >
              Refresh
            </button>
          </div>
          {cloakHistory.length === 0 ? (
            <p className="text-green-300 font-mono text-sm">No private transfers yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cloakHistory.map((record) => (
                <div key={record.id} className="border border-green-600 p-3">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="uppercase text-green-400">{record.type}</span>
                    <span className="text-green-300">{record.status}</span>
                  </div>
                  <p className="text-green-300 font-mono text-sm">Amount: {record.amount} SOL</p>
                  <p className="text-green-300 font-mono text-xs break-all">Recipient: {record.recipient}</p>
                  {record.delayedWithdrawalId && (
                    <p className="text-green-300 font-mono text-xs">
                      Withdrawal ID: {record.delayedWithdrawalId}
                    </p>
                  )}
                  {record.executeAt && (
                    <p className="text-green-500 font-mono text-xs">Executes at: {record.executeAt}</p>
                  )}
                  {record.signature && (
                    <p className="text-green-500 font-mono text-xs break-all">Signature: {record.signature}</p>
                  )}
                  {record.note && (
                    <p className="text-green-500 font-mono text-xs">{record.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="bg-black border-2 border-green-600 p-4">
          <p className="text-green-400 font-mono text-sm">{message}</p>
        </div>
      )}
    </div>
  );
}
