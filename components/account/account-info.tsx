'use client';

import { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { lamportsToSol, ellipsify } from '@/lib/iq/utils';
import { sendSol, requestAirdrop } from '@/lib/iq/transaction';
import { getBonkBalance, sendBonk } from '@/lib/token/bonk';

export function AccountInfo() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendingSOL, setSendingSOL] = useState(false);
  const [requestingAirdrop, setRequestingAirdrop] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch SOL balance
  const { data: balance, refetch: refetchBalance } = useQuery({
    queryKey: ['balance', wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (!wallet.publicKey) return 0;
      const bal = await connection.getBalance(wallet.publicKey);
      return lamportsToSol(bal);
    },
    enabled: !!wallet.publicKey,
    refetchInterval: 10000, // Refetch every 10 seconds
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
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

      {/* Send SOL Section */}
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

      {/* Airdrop Section (Devnet only) */}
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

      {/* Token Accounts */}
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

      {/* Message Display */}
      {message && (
        <div className="bg-black border-2 border-green-600 p-4">
          <p className="text-green-400 font-mono text-sm">{message}</p>
        </div>
      )}
    </div>
  );
}
