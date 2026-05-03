'use client';

import { useState } from 'react';
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { useWallet } from '@solana/wallet-adapter-react';
import { Window, WindowHeader, WindowContent, Cutout, Button, Frame } from 'react95';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useWalletMode } from '@/lib/wallet/wallet-mode';
import { useExportWallet } from '@privy-io/react-auth/solana';
import { shorten } from '@/lib/utils/message-utils';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      style={{ minWidth: 60, marginLeft: 8 }}
    >
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

export function AccountInfo() {
  const { connection, readConnection } = useAppConnection();
  const { mode } = useWalletMode();
  const appWallet = useAppWallet();
  const fundingWallet = useWallet();
  const { exportWallet } = useExportWallet();

  const isPrivyMode = mode === 'privy';

  const mainAddress = appWallet.publicKey?.toBase58();
  const fundingAddress = fundingWallet.publicKey?.toBase58();

  const [sendAmount, setSendAmount] = useState('');
  const [sendingSOL, setSendingSOL] = useState(false);
  const [message, setMessage] = useState('');
  const [lastTxId, setLastTxId] = useState('');

  const { data: mainBalance, refetch: refetchMainBalance } = useQuery({
    queryKey: ['main-balance', mainAddress],
    queryFn: async () => {
      if (!appWallet.publicKey) return 0;
      return (await readConnection.getBalance(appWallet.publicKey)) / LAMPORTS_PER_SOL;
    },
    enabled: !!appWallet.publicKey,
    refetchInterval: 10000,
  });

  const { data: fundingBalance, refetch: refetchFundingBalance } = useQuery({
    queryKey: ['funding-balance', fundingAddress],
    queryFn: async () => {
      if (!fundingWallet.publicKey) return 0;
      return (await readConnection.getBalance(fundingWallet.publicKey)) / LAMPORTS_PER_SOL;
    },
    enabled: isPrivyMode && !!fundingWallet.publicKey,
    refetchInterval: 10000,
  });

  const { data: tokens } = useQuery({
    queryKey: ['tokens', mainAddress],
    queryFn: async () => {
      if (!appWallet.publicKey) return [];
      const accounts = await readConnection.getParsedTokenAccountsByOwner(appWallet.publicKey, {
        programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
      });
      return accounts.value.map((acc) => ({
        mint: acc.account.data.parsed.info.mint,
        amount: acc.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: acc.account.data.parsed.info.tokenAmount.decimals,
      }));
    },
    enabled: !!appWallet.publicKey,
  });

  const handleFundPrivy = async () => {
    if (!fundingWallet.publicKey || !fundingWallet.signTransaction || !mainAddress || !sendAmount) {
      setMessage('Please fill in amount');
      return;
    }
    try {
      setSendingSOL(true);
      setLastTxId('');
      setMessage('Funding Privy wallet...');
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: fundingWallet.publicKey,
          toPubkey: new PublicKey(mainAddress),
          lamports: parseFloat(sendAmount) * LAMPORTS_PER_SOL,
        })
      );
      tx.feePayer = fundingWallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      const signed = await fundingWallet.signTransaction(tx);
      const txid = await connection.sendRawTransaction(signed.serialize());
      setLastTxId(txid);
      setMessage(`Success! TX: ${txid.slice(0, 8)}...${txid.slice(-8)}`);
      setSendAmount('');
      refetchMainBalance();
      refetchFundingBalance();
    } catch (error) {
      setMessage(`Error: ${error}`);
    } finally {
      setSendingSOL(false);
    }
  };

  if (!appWallet.connected) {
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
                <li>2. Pick Privy (no signing popups) or a Solana wallet (Phantom, Solflare…)</li>
                <li>3. Return here to manage your account</li>
              </ol>
            </Frame>
          </WindowContent>
        </Window>
      </div>
    );
  }

  const mainCardTitle = isPrivyMode ? '[PRIVY WALLET]' : '[WALLET]';
  const mainCardSubtitle = isPrivyMode ? 'Embedded Wallet' : 'Connected Wallet';

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-6">
      {isPrivyMode && fundingWallet.connected && (
        <Window className="w-full shadow-md">
          <WindowHeader>
            <span>[FUNDING WALLET]</span>
          </WindowHeader>
          <WindowContent className="space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em]">External Wallet</p>
              <h3 className="text-2xl mt-1">{shorten(fundingAddress ?? '', 6)}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Cutout className="p-4 text-xs break-all border flex-1">{fundingAddress}</Cutout>
              {fundingAddress && <CopyButton text={fundingAddress} />}
            </div>
            <Cutout className="border p-4">
              <p className="text-xs mb-1">SOL balance</p>
              <p className="text-2xl font-bold">
                {fundingBalance !== undefined ? fundingBalance.toFixed(4) : '…'}
              </p>
            </Cutout>
          </WindowContent>
        </Window>
      )}

      <Window className="w-full shadow-md">
        <WindowHeader>
          <span>{mainCardTitle}</span>
        </WindowHeader>
        <WindowContent className="space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.4em]">{mainCardSubtitle}</p>
            <h3 className="text-2xl mt-1">{mainAddress ? shorten(mainAddress, 6) : 'Not available'}</h3>
          </div>
          {mainAddress && (
            <div className="flex items-center gap-2">
              <Cutout className="p-4 text-xs break-all border flex-1">{mainAddress}</Cutout>
              <CopyButton text={mainAddress} />
            </div>
          )}
          <Cutout className="border p-4">
            <p className="text-xs mb-1">SOL balance</p>
            <p className="text-2xl font-bold">
              {mainBalance !== undefined ? mainBalance.toFixed(4) : '…'}
            </p>
          </Cutout>
          {isPrivyMode && (
            <Button fullWidth onClick={() => exportWallet()}>
              Export Private Key
            </Button>
          )}
        </WindowContent>
      </Window>

      {isPrivyMode && (
        <Window className="w-full shadow-md">
          <WindowHeader>
            <span>[FUND PRIVY WALLET]</span>
          </WindowHeader>
          <WindowContent className="space-y-4">
            <div>
              <label className="text-sm block mb-2">Recipient (Privy wallet)</label>
              <Cutout className="p-3 text-xs break-all border">{mainAddress || 'Privy wallet not available'}</Cutout>
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
            {!fundingWallet.connected && (
              <p className="text-xs">Connect a funding wallet from the wallet dropdown to send SOL into your Privy wallet.</p>
            )}
            <Button
              fullWidth
              onClick={handleFundPrivy}
              disabled={sendingSOL || !mainAddress || !sendAmount || !fundingWallet.connected}
            >
              {sendingSOL ? 'Funding…' : 'Fund Privy Wallet'}
            </Button>
          </WindowContent>
        </Window>
      )}

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
