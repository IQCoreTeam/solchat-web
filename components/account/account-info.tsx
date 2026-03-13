'use client';

import { useState } from 'react';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Window, WindowHeader, WindowContent, Cutout, Button, Frame } from 'react95';
import { useAppWallet } from '@/lib/wallet/use-app-wallet';

function formatAddress(value?: string | null, chars = 4) {
  if (!value) return '';
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function AccountInfo() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const privyWallet = useAppWallet();
  const privyAddress = privyWallet.publicKey?.toBase58();

  const [sendAmount, setSendAmount] = useState('');
  const [sendingSOL, setSendingSOL] = useState(false);
  const [message, setMessage] = useState('');
  const [lastTxId, setLastTxId] = useState('');

  const { data: balance, refetch: refetchBalance } = useQuery({
    queryKey: ['balance', wallet.publicKey?.toBase58()],
    queryFn: async () => {
      if (!wallet.publicKey) return 0;
      return (await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL;
    },
    enabled: !!wallet.publicKey,
    refetchInterval: 10000,
  });

  const { data: privyBalance, refetch: refetchPrivyBalance } = useQuery({
    queryKey: ['privy-balance', privyAddress],
    queryFn: async () => {
      if (!privyWallet.publicKey) return 0;
      return (await connection.getBalance(privyWallet.publicKey)) / LAMPORTS_PER_SOL;
    },
    enabled: !!privyWallet.publicKey,
    refetchInterval: 10000,
  });

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

  const handleFundPrivy = async () => {
    if (!wallet.publicKey || !wallet.signTransaction || !privyAddress || !sendAmount) {
      setMessage('Please fill in amount');
      return;
    }
    try {
      setSendingSOL(true);
      setLastTxId('');
      setMessage('Funding Privy wallet...');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: new PublicKey(privyAddress),
          lamports: parseFloat(sendAmount) * LAMPORTS_PER_SOL,
        })
      );
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await wallet.signTransaction(tx);
      const txid = await connection.sendRawTransaction(signed.serialize());
      setLastTxId(txid);
      setMessage(`Success! TX: ${txid.slice(0, 8)}...${txid.slice(-8)}`);
      setSendAmount('');
      refetchBalance();
      refetchPrivyBalance();
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setSendingSOL(false);
    }
  };

  if (!wallet.connected) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <Window className="w-full">
          <WindowHeader>
            <span>[SOLCHAT - ACCOUNT ACCESS]</span>
          </WindowHeader>
          <WindowContent className="space-y-3">
            <h2 className="text-2xl">Connect your wallet to begin</h2>
            <Frame style={{ padding: '1rem' }}>
              <ol className="space-y-2 text-xs">
                <li>1. Click &quot;Connect Wallet&quot; in the top-right corner</li>
                <li>2. Authenticate with Privy to set up your wallet</li>
                <li>3. Return here to manage your account</li>
              </ol>
            </Frame>
          </WindowContent>
        </Window>
      </div>
    );
  }

  const publicAddress = wallet.publicKey?.toBase58();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      <Window className="w-full shadow-md">
        <WindowHeader>
          <span>[PUBLIC WALLET]</span>
        </WindowHeader>
        <WindowContent className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em]">Wallet</p>
            <h3 className="text-2xl mt-1">{formatAddress(publicAddress, 6)}</h3>
          </div>
          <Cutout className="p-4 text-xs break-all border">{publicAddress}</Cutout>
          <Cutout className="border p-4">
            <p className="text-xs mb-1">SOL balance</p>
            <p className="text-2xl font-bold">
              {balance !== undefined ? balance.toFixed(4) : '…'}
            </p>
          </Cutout>
        </WindowContent>
      </Window>

      <Window className="w-full shadow-md">
        <WindowHeader>
          <span>[PRIVY WALLET]</span>
        </WindowHeader>
        <WindowContent className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em]">Embedded Wallet</p>
            <h3 className="text-2xl mt-1">{privyAddress ? formatAddress(privyAddress, 6) : 'Not available'}</h3>
          </div>
          {privyAddress && (
            <Cutout className="p-4 text-xs break-all border">{privyAddress}</Cutout>
          )}
          <Cutout className="border p-4">
            <p className="text-xs mb-1">SOL balance</p>
            <p className="text-2xl font-bold">
              {privyBalance !== undefined ? privyBalance.toFixed(4) : '…'}
            </p>
          </Cutout>
        </WindowContent>
      </Window>

      <Window className="w-full shadow-md">
        <WindowHeader>
          <span>[FUND PRIVY WALLET]</span>
        </WindowHeader>
        <WindowContent className="space-y-4">
          <div>
            <label className="text-sm block mb-2">Recipient (Privy wallet)</label>
            <Cutout className="p-3 text-xs break-all border">{privyAddress || 'Privy wallet not available'}</Cutout>
          </div>
          <div>
            <label className="text-sm block mb-2">Amount (SOL)</label>
            <input
              type="number"
              step="0.01"
              value={sendAmount}
              onChange={(e) => setSendAmount(e.target.value)}
              className="w-full rounded-md border p-3 focus:ring-2 outline-none"
              placeholder="0.00"
            />
          </div>
          <Button
            fullWidth
            onClick={handleFundPrivy}
            disabled={sendingSOL || !privyAddress || !sendAmount}
          >
            {sendingSOL ? 'Funding…' : 'Fund Privy Wallet'}
          </Button>
        </WindowContent>
      </Window>

      {tokens && tokens.length > 0 && (
        <Window className="w-full shadow-md">
          <WindowHeader>
            <span>[TOKEN ACCOUNTS] ({tokens.length})</span>
          </WindowHeader>
          <WindowContent className="space-y-3 max-h-64 overflow-y-auto">
            {tokens.map((token, i) => (
              <div key={`${token.mint}-${i}`} className="rounded-lg border p-3 text-sm">
                <p className="text-[11px] uppercase tracking-[0.3em] mb-1">Mint</p>
                <p className="break-all mb-2">{token.mint}</p>
                <p>Balance: {token.amount?.toFixed(token.decimals || 0) || 0}</p>
              </div>
            ))}
          </WindowContent>
        </Window>
      )}

      {message && (
        <div className="rounded-xl border p-6 shadow-md backdrop-blur-sm space-y-2">
          <p className="text-sm">{message}</p>
          {lastTxId && (
            <Button
              onClick={() => window.open(`https://solscan.io/tx/${lastTxId}`, '_blank')}
            >
              View on Solscan
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
