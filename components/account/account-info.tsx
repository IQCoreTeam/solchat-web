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
import { useConnection, useWallet } from '@solana/wallet-adapter-react';

export function AccountInfo() {
  const { connection } = useConnection(); // Use standard wallet adapter connection
  const wallet = useWallet(); // Use standard wallet adapter wallet
  const { ready: privyReady, authenticated, login, logout } = usePrivy();
  const privyWallet = usePrivyAppWallet();
  const hasPrivyWallet = useHasPrivyWallet();

  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendingSOL, setSendingSOL] = useState(false);
  const [requestingAirdrop, setRequestingAirdrop] = useState(false);
  const [message, setMessage] = useState('');
  const [disconnectingPrivy, setDisconnectingPrivy] = useState(false);

  const [cloakHistory, setCloakHistory] = useState<CloakTransferRecord[]>([]);

  // Debug logging and wallet creation
  useEffect(() => {
    console.log('🔍 Privy Debug:', {
      ready: privyReady,
      authenticated,
      hasPrivyWallet,
      privyWalletAddress: privyWallet?.address,
      user: authenticated ? 'User exists' : 'No user',
    });
    
    // If authenticated but no embedded wallet, might need to create one
    if (authenticated && !privyWallet && !hasPrivyWallet) {
      console.log('⚠️ User authenticated but no Privy Solana wallet found. May need manual creation.');
    }
  }, [privyReady, authenticated, privyWallet, hasPrivyWallet]);

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

  const handleCloakSuccess = () => {
    refetchBalance();
    refetchBonk();
    refreshCloakHistory();
  };

  // Show connect wallet prompt if not connected
  if (!wallet.connected) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-yellow-900/30 to-yellow-800/30 border-2 border-yellow-500 p-8 mb-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-yellow-400  text-2xl mb-2 flex items-center gap-2">
                👋 Welcome! Connect Your Wallet First
              </h2>
              <p className="text-yellow-300  text-sm mb-3">
                Connect your main wallet (Phantom, Solflare, etc.) to get started
              </p>
              <ul className="text-xs text-yellow-400  space-y-1 mb-4">
                <li>1️⃣ Connect your main wallet using the button in the top right</li>
                <li>2️⃣ Then create a Privy wallet for private transactions</li>
                <li>3️⃣ Fund your Privy wallet privately using Cloak</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Show Privy wallet creation prompt only after main wallet is connected */}
      {!authenticated && (
        <div className="bg-gradient-to-r from-[#1C1E27]/30 to-[#11121A]/30 border-2 border-[#7A8CFF] p-8 mb-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-[#7A8CFF]  text-2xl mb-2 flex items-center gap-2">
                🔒 Create Your Privacy Wallet
              </h2>
              <p className="text-[#00E0E0]  text-sm mb-3">
                Now create a secure embedded wallet with Privy for private transactions
              </p>
              <ul className="text-xs text-[#7A8CFF]   space-y-1 mb-4">
                <li>✓ Enterprise-grade security</li>
                <li>✓ Cross-device access</li>
                <li>✓ No seed phrases to manage</li>
                <li>✓ Required for Cloak privacy features</li>
              </ul>
              <p className="text-xs text-[#00E0E0]   mt-3 p-3 bg-[#1C1E27]/30 rounded">
                💡 <strong>Note:</strong> Your main wallet ({wallet.publicKey?.toBase58().slice(0, 8)}...) will stay connected for funding. The Privy wallet will be used for private activities.
              </p>
            </div>
            <button
              onClick={login}
              className="bg-[#6C4DFF] hover:bg-[#7A8CFF] text-[#0A0A0F]   px-8 py-4 text-lg    transition-all transform hover:scale-105"
            >
              🚀 Create Privacy Wallet
            </button>
          </div>
        </div>
      )}

      {authenticated && !privyWallet && (
        <div className="bg-yellow-900/20 border-2 border-yellow-600 p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
            <div>
              <h3 className="text-yellow-400   text-xl mb-2">
                ⏳ Creating Privy Wallet...
              </h3>
              <p className="text-yellow-300   text-sm">
                Please wait while we set up your secure embedded wallet. This should only take a moment.
              </p>
              <p className="text-yellow-200   text-xs mt-2">
                If this persists, try refreshing the page.
              </p>
            </div>
          </div>
        </div>
      )}

      {authenticated && privyWallet && (
        <div className="bg-[#1C1E27]/20 border-2 border-[#6C4DFF] p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[#7A8CFF]   text-xl mb-2 flex items-center gap-2">
                🔒 Privy Wallet Active
              </h3>
              <p className="text-[#00E0E0]   text-sm break-all mb-2">
                {privyWallet.address}
              </p>
              <span className="text-xs bg-[#6C4DFF] text-[#0A0A0F]   px-2 py-1">
                SECURED BY PRIVY
              </span>
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(privyWallet.address);
                setMessage('Privy wallet address copied!');
              }}
              className="bg-[#6C4DFF] hover:bg-[#5A3DE6] text-[#0A0A0F]   px-4 py-2 transition-colors"
            >
              Copy Address
            </button>
          </div>
        </div>
      )}

      <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[#7A8CFF]   text-2xl">Main Wallet (Funding)</h2>
          <span className="text-xs bg-blue-600 text-[#0A0A0F]   px-2 py-1">
            PUBLIC WALLET
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <span className="text-[#7A8CFF]   text-sm">Connected Wallet:</span>
            <p className="text-[#00E0E0]   text-xs break-all">
              {wallet.publicKey?.toBase58() || 'Not connected'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-[#7A8CFF]   text-sm">SOL Balance:</span>
              <p className="text-[#00E0E0]   text-xl">
                {balance !== undefined ? balance.toFixed(4) : '...'} SOL
              </p>
            </div>

            <div>
              <span className="text-[#7A8CFF]   text-sm">BONK Balance:</span>
              <p className="text-[#00E0E0]   text-xl">
                {bonkBalance !== undefined ? bonkBalance.toFixed(2) : '...'} BONK
              </p>
            </div>
          </div>

          <p className="text-xs text-[#7A8CFF]   mt-2 p-2 bg-blue-900/20 rounded border border-blue-600/30">
            💡 This is your public wallet used for funding private transactions
          </p>
        </div>
      </div>

      <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-[#7A8CFF]   text-xl">App Wallet (Private)</h3>
          <div className="flex flex-wrap items-center gap-2">
            {authenticated && (
              <button
                onClick={async () => {
                  if (disconnectingPrivy) return;
                  setDisconnectingPrivy(true);
                  try {
                    await logout();
                    setMessage('Privy session disconnected. Create a new wallet to continue testing.');
                  } finally {
                    setDisconnectingPrivy(false);
                  }
                }}
                disabled={disconnectingPrivy}
                className="text-xs   uppercase tracking-wide text-red-300 underline decoration-dotted underline-offset-2 disabled:opacity-60"
              >
                {disconnectingPrivy ? 'Disconnecting…' : 'Disconnect Privy'}
              </button>
            )}
            {privyWallet ? (
              <span className="bg-[#6C4DFF] text-[#0A0A0F]   px-3 py-1">
                🔒 Privy Secured
              </span>
            ) : authenticated ? (
              <span className="bg-yellow-600 text-[#0A0A0F]   px-3 py-1">
                Creating...
              </span>
            ) : (
              <button
                onClick={login}
                className="bg-[#6C4DFF] hover:bg-[#5A3DE6] text-[#0A0A0F]   px-3 py-1 transition-colors"
              >
                Login with Privy
              </button>
            )}
          </div>
        </div>
        {privyWallet ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-[#1C1E27] text-[#7A8CFF]   px-2 py-1">PRIVY MANAGED</span>
              <span className="text-xs text-[#7A8CFF]  ">Secure, cross-device access</span>
            </div>
            <p className="text-[#00E0E0]   text-sm break-all">{privyWallet.address}</p>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(privyWallet.address);
                setMessage('Privy wallet address copied!');
              }}
              className="bg-[#6C4DFF] hover:bg-[#5A3DE6] text-[#0A0A0F]   px-3 py-1 transition-colors"
            >
              Copy Address
            </button>
          </div>
        ) : wallet.connected ? (
          <div className="space-y-2">
            <p className="text-[#00E0E0]   text-sm">
              Create a secure embedded wallet for private transactions.
            </p>
            <p className="text-xs text-[#7A8CFF]   mb-3">
              ✓ Secure key management<br />
              ✓ Cross-device access<br />
              ✓ No seed phrases to manage
            </p>
            <button
              onClick={login}
              className="w-full bg-[#6C4DFF] hover:bg-[#5A3DE6] text-[#0A0A0F]   px-4 py-2 transition-colors"
            >
              Create Privacy Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-yellow-300   text-sm">
              ⚠️ Connect your main wallet first (top right corner)
            </p>
            <p className="text-xs text-yellow-400  ">
              You need a connected wallet to fund your privacy wallet
            </p>
          </div>
        )}
      </div>

      <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
        <h3 className="text-[#7A8CFF]   text-xl mb-4">Send SOL</h3>

        <div className="space-y-4">
          <div>
            <label className="text-[#7A8CFF]   text-sm block mb-2">
              Recipient Address:
            </label>
            <input
              type="text"
              value={sendAddress}
              onChange={(e) => setSendAddress(e.target.value)}
              className="w-full bg-[#0A0A0F] border border-[#6C4DFF] text-[#7A8CFF]   p-2 outline-none focus:border-[#7A8CFF]"
              placeholder="Enter Solana address..."
            />
          </div>

          <div>
            <label className="text-[#7A8CFF]   text-sm block mb-2">Amount (SOL):</label>
            <input
              type="number"
              step="0.01"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              className="w-full bg-[#0A0A0F] border border-[#6C4DFF] text-[#7A8CFF]   p-2 outline-none focus:border-[#7A8CFF]"
              placeholder="0.00"
            />
          </div>

          <button
            onClick={handleSendSOL}
            disabled={sendingSOL || !sendAddress || !sendAmount}
            className="w-full bg-[#6C4DFF] hover:bg-[#5A3DE6] disabled:bg-[#2A2D36] text-[#0A0A0F]   py-2 px-4 transition-colors"
          >
            {sendingSOL ? 'Sending...' : 'Send SOL'}
          </button>
        </div>
      </div>

      <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
        <h3 className="text-[#7A8CFF]   text-xl mb-4">Request Airdrop (Devnet)</h3>

        <button
          onClick={handleAirdrop}
          disabled={requestingAirdrop}
          className="w-full bg-[#6C4DFF] hover:bg-[#5A3DE6] disabled:bg-[#2A2D36] text-[#0A0A0F]   py-2 px-4 transition-colors"
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
        <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
          <h3 className="text-[#7A8CFF]   text-xl mb-4">Token Accounts</h3>

          <div className="space-y-2">
            {tokens.map((token, index) => (
              <div key={index} className="border border-[#6C4DFF] p-3">
                <p className="text-[#7A8CFF]   text-xs break-all">Mint: {token.mint}</p>
                <p className="text-[#00E0E0]  ">
                  Balance: {token.amount?.toFixed(token.decimals || 0) || 0}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {privyWallet && (
        <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-6 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[#7A8CFF]   text-xl">Cloak Transfer History</h3>
            <button
              onClick={refreshCloakHistory}
              className="text-xs text-[#00E0E0] underline"
            >
              Refresh
            </button>
          </div>
          {cloakHistory.length === 0 ? (
            <p className="text-[#00E0E0]   text-sm">No private transfers yet.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {cloakHistory.map((record) => (
                <div key={record.id} className="border border-[#6C4DFF] p-3">
                  <div className="flex items-center justify-between text-xs  ">
                    <span className="uppercase text-[#7A8CFF]">{record.type}</span>
                    <span className="text-[#00E0E0]">{record.status}</span>
                  </div>
                  <p className="text-[#00E0E0]   text-sm">Amount: {record.amount} SOL</p>
                  <p className="text-[#00E0E0]   text-xs break-all">Recipient: {record.recipient}</p>
                  {record.delayedWithdrawalId && (
                    <p className="text-[#00E0E0]   text-xs">
                      Withdrawal ID: {record.delayedWithdrawalId}
                    </p>
                  )}
                  {record.executeAt && (
                    <p className="text-[#6C4DFF]   text-xs">Executes at: {record.executeAt}</p>
                  )}
                  {record.signature && (
                    <p className="text-[#6C4DFF]   text-xs break-all">Signature: {record.signature}</p>
                  )}
                  {record.note && (
                    <p className="text-[#6C4DFF]   text-xs">{record.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {message && (
        <div className="bg-[#0A0A0F] border-2 border-[#6C4DFF] p-4">
          <p className="text-[#7A8CFF]   text-sm">{message}</p>
        </div>
      )}
    </div>
  );
}
