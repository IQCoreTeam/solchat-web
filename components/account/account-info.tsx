'use client';

import { useEffect, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PublicKey } from '@solana/web3.js';
import { useQuery } from '@tanstack/react-query';
import { lamportsToSol, ellipsify } from '@/lib/iq/utils';
import { sendSol, requestAirdrop, type WalletExecutor } from '@/lib/iq/transaction';
import { getBonkBalance } from '@/lib/token/bonk';
import { PrivateEntryCard } from './private-entry-card';
import { PrivateExitCard } from './private-exit-card';
import { usePrivyAppWallet, useHasPrivyWallet } from '@/lib/wallet/privy-app-wallet';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Window, WindowHeader, WindowContent, Panel, Cutout, Button } from 'react95';

const CARD_BASE =
  'rounded-xl border border-green-600/60 bg-black/80 p-6 shadow-[0_0_25px_rgba(16,185,129,0.15)] backdrop-blur-sm';
function formatAddress(value?: string | null, chars = 4) {
  if (!value) return '';
  return `${value.slice(0, chars)}…${value.slice(-chars)}`;
}

export function AccountInfo() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { ready: privyReady, authenticated, login, logout } = usePrivy();
  const privyWallet = usePrivyAppWallet();
  const hasPrivyWallet = useHasPrivyWallet();

  const [sendAddress, setSendAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendingSOL, setSendingSOL] = useState(false);
  const [requestingAirdrop, setRequestingAirdrop] = useState(false);
  const [message, setMessage] = useState('');
  const [disconnectingPrivy, setDisconnectingPrivy] = useState(false);

  // Debug logging and wallet creation
  useEffect(() => {
    console.log('🔍 Privy Debug:', {
      ready: privyReady,
      authenticated,
      hasPrivyWallet,
      privyWalletAddress: privyWallet?.address,
      user: authenticated ? 'User exists' : 'No user',
    });

    if (authenticated && !privyWallet && !hasPrivyWallet) {
      console.log('⚠️ User authenticated but no Privy Solana wallet found. May need manual creation.');
    }
  }, [privyReady, authenticated, privyWallet, hasPrivyWallet]);

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

      const walletExecutor: WalletExecutor = {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction ?? undefined,
        sendTransaction: wallet.sendTransaction ?? undefined,
      };

      const txid = await sendSol(connection, walletExecutor, new PublicKey(sendAddress), parseFloat(sendAmount));

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
  };

  const handleCopyPrivyAddress = async () => {
    if (!privyWallet?.address) return;
    try {
      await navigator.clipboard.writeText(privyWallet.address);
      setMessage('Privy wallet address copied!');
    } catch (error) {
      console.error('Failed to copy address', error);
    }
  };

  const handleDisconnectPrivy = async () => {
    if (!authenticated || disconnectingPrivy) return;
    setDisconnectingPrivy(true);
    try {
      await logout();
      setMessage('Privy session disconnected. Create a new wallet to continue testing.');
    } finally {
      setDisconnectingPrivy(false);
    }
  };

  const renderPrivyCard = () => {
    if (!authenticated) {
      return (
        <Window className="w-full">
          <WindowHeader className="!bg-green-500 !text-black    ">
            <span>[PRIVY SETUP]</span>
          </WindowHeader>
          <WindowContent className="bg-black text-green-100     space-y-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-green-300/80">Private Treasury</p>
              <h3 className="text-2xl mt-2">Create your Privy wallet</h3>
              <p className="text-sm text-green-200/80 mt-2">
                Set up a Privy-managed wallet to hold your shielded balance and authenticate with Cloak.
              </p>
            </div>
            <ul className="text-xs text-green-200/80 space-y-1">
              <li>✓ Enterprise-grade custody</li>
              <li>✓ Cross-device continuity</li>
              <li>✓ Required for Cloak deposits & exits</li>
            </ul>
            <Button
              fullWidth
              onClick={login}
              className="    font-bold uppercase tracking-wide"
              style={{ backgroundColor: '#22c55e', color: '#0a0a0a' }}
            >
                Create Privacy Wallet
            </Button>
          </WindowContent>
        </Window>
      );
    }

    if (authenticated && !privyWallet) {
      return (
        <Window className="w-full">
          <WindowHeader className="!bg-yellow-400 !text-black    ">
            <span>[PRIVY SETUP]</span>
          </WindowHeader>
          <WindowContent className="bg-black text-yellow-100     space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-yellow-400 animate-pulse" />
              <h3 className="text-xl">Provisioning Privy wallet…</h3>
            </div>
            <p className="text-sm text-yellow-200/80">
              Hang tight while we finish creating your embedded wallet. If this takes more than a minute, refresh the
              page.
            </p>
          </WindowContent>
        </Window>
      );
    }

    return (
      <Window className="w-full">
        <WindowHeader className="!bg-green-500 !text-black    ">
          <span>[PRIVY TREASURY]</span>
        </WindowHeader>
        <WindowContent className="bg-black text-green-100     space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-green-400/70">Shielded wallet</p>
              <h3 className="text-2xl mt-1">Privy wallet ready</h3>
            </div>
            <span className="px-3 py-1 rounded-full text-xs bg-green-500 text-black">CLOAK READY</span>
          </div>
          <p className="text-sm text-green-200/80 leading-relaxed">
            Fund this wallet privately with Cloak and use it as your shielded identity across SolChat.
          </p>
          <Cutout className="bg-[#050505] border border-green-700/40 p-3">
            <p className="text-xs text-green-400/80 mb-1">Privy wallet address</p>
            <p className="text-green-100 text-sm break-all">{privyWallet?.address}</p>
          </Cutout>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={handleCopyPrivyAddress}
              className="    font-semibold uppercase tracking-wide px-4"
              style={{ backgroundColor: '#22c55e', color: '#0a0a0a' }}
            >
              Copy Address
            </Button>
            <Button
              onClick={handleDisconnectPrivy}
              disabled={disconnectingPrivy}
              className="    font-semibold uppercase tracking-wide px-4"
              style={{
                backgroundColor: disconnectingPrivy ? '#cbd5f5' : '#dc2626',
                color: '#000',
                opacity: disconnectingPrivy ? 0.6 : 1,
              }}
            >
              {disconnectingPrivy ? 'Disconnecting…' : 'Disconnect Privy'}
            </Button>
          </div>
        </WindowContent>
      </Window>
    );
  };

  // Show connect wallet prompt if not connected
  if (!wallet.connected) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <Window className="w-full">
          <WindowHeader className="!bg-green-500 !text-black    ">
            <span>[SOLCHAT - ACCOUNT ACCESS]</span>
          </WindowHeader>
          <WindowContent className="bg-black text-green-100     space-y-3">
            <h2 className="text-2xl text-green-100">Connect your funding wallet to begin</h2>
            <p className="text-sm text-green-200/80">
              SolChat needs your public wallet to fund private deposits and confirm Solana transactions.
            </p>
            <ol className="space-y-2 text-xs text-green-200/80">
              <li>1️⃣ Click “Connect Wallet” in the top-right corner</li>
              <li>2️⃣ Authenticate with Privy to spin up a private wallet</li>
              <li>3️⃣ Return here to fund/exit via Cloak</li>
            </ol>
          </WindowContent>
        </Window>
      </div>
    );
  }

  const fundingAddress = wallet.publicKey?.toBase58();
  const privyAddress = privyWallet?.address ?? null;

  const heroPills = [
    {
      label: 'Funding Wallet',
      value: fundingAddress ? formatAddress(fundingAddress) : 'Connect wallet',
      variant: fundingAddress ? 'ready' : 'warn',
    },
    {
      label: 'Privacy Wallet',
      value: privyAddress ? formatAddress(privyAddress) : authenticated ? 'Provisioning' : 'Required',
      variant: privyAddress ? 'ready' : 'warn',
    },
    {
      label: 'Cloak Status',
      value: privyAddress ? 'Ready' : 'Awaiting Privy',
      variant: privyAddress ? 'ready' : 'warn',
    },
  ] as const;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 max-w-6xl mx-auto space-y-6">
      <Window className="w-full shadow-[0_0_30px_rgba(34,197,94,0.25)]">
        <WindowHeader className="!bg-green-500 !text-black    ">
          <span>[SOLCHAT - ACCOUNT CONSOLE]</span>
        </WindowHeader>
        <WindowContent className="bg-black text-green-100     space-y-4">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.4em] text-green-300/70 ">Account Control</p>
              <h1 className="text-3xl sm:text-4xl  text-green-100 mt-2">Own your privacy on Solana</h1>
              <p className="text-green-100/80     text-sm mt-3 max-w-2xl">
                Fund your chat wallet with Cloak for a completely private communication experience. Private entry and exit points combined with AES-256-GCM encryption ensure your messages remain secure.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {heroPills.map((pill) => (
                <Panel
                  key={pill.label}
                  variant="outside"
                  className={`flex min-h-[88px] min-w-[180px] flex-col justify-between rounded-lg border border-black/30 p-4     ${
                    pill.variant === 'ready' ? 'bg-green-900/30 text-green-100' : 'bg-yellow-900/30 text-yellow-100'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-[0.3em] block opacity-80">{pill.label}</span>
                  <span className="text-lg">{pill.value}</span>
                </Panel>
              ))}
            </div>
          </div>
        </WindowContent>
      </Window>

      <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          {renderPrivyCard()}
          <PrivateEntryCard privyWallet={privyWallet} onAfterAction={handleCloakSuccess} />
          <PrivateExitCard privyWallet={privyWallet} onAfterAction={handleCloakSuccess} />
        </section>

        <section className="space-y-6">
          <Window className="w-full shadow-[0_0_25px_rgba(16,185,129,0.15)]">
            <WindowHeader className="!bg-blue-400 !text-black    ">
              <span>[PUBLIC WALLET]</span>
            </WindowHeader>
            <WindowContent className="bg-black text-green-100     space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.4em] text-green-400/70">Funding wallet</p>
                  <h3 className="text-2xl mt-1 text-green-100">Public balances</h3>
                </div>
                <span className="px-3 py-1 rounded-full text-xs bg-blue-500/80 text-black">PUBLIC</span>
              </div>
              <Cutout className="bg-[#050505] border border-green-600/40 p-4 text-xs break-all">
                {fundingAddress}
              </Cutout>
              <div className="grid gap-4 sm:grid-cols-2">
                <Cutout className="bg-[#060606] border border-green-600/30 p-4">
                  <p className="text-xs text-green-400/70 mb-1">SOL balance</p>
                  <p className="text-2xl font-bold text-green-100">
                    {balance !== undefined ? balance.toFixed(4) : '…'}
                  </p>
                </Cutout>
                <Cutout className="bg-[#060606] border border-green-600/30 p-4">
                  <p className="text-xs text-green-400/70 mb-1">BONK balance</p>
                  <p className="text-2xl font-bold text-green-100">
                    {bonkBalance !== undefined ? bonkBalance.toFixed(2) : '…'}
                  </p>
                </Cutout>
              </div>
              <p className="text-xs text-green-300/80">
                Use this wallet to fund private deposits. Cloak keeps your Privy wallet unlinkable.
              </p>
            </WindowContent>
          </Window>

          <div className={`${CARD_BASE} space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-green-200     text-xl">Send SOL</h3>
              <span className="text-xs     text-green-400/80">Direct transfer</span>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-green-400     text-sm block mb-2">Recipient address</label>
                <input
                  type="text"
                  value={sendAddress}
                  onChange={(e) => setSendAddress(e.target.value)}
                  className="w-full rounded-md border border-green-600/50 bg-black/70 text-green-100     p-3 focus:border-green-300 outline-none"
                  placeholder="Enter Solana address…"
                />
              </div>
              <div>
                <label className="text-green-400     text-sm block mb-2">Amount (SOL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={sendAmount}
                  onChange={(e) => setSendAmount(e.target.value)}
                  className="w-full rounded-md border border-green-600/50 bg-black/70 text-green-100     p-3 focus:border-green-300 outline-none"
                  placeholder="0.00"
                />
              </div>
              <button
                onClick={handleSendSOL}
                disabled={sendingSOL || !sendAddress || !sendAmount}
                className="w-full bg-green-500/90 hover:bg-green-400 text-black     py-3 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {sendingSOL ? 'Sending…' : 'Send SOL'}
              </button>
            </div>
          </div>

          <div className={`${CARD_BASE} space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-green-200     text-xl">Quick tools</h3>
              <span className="text-xs     text-green-400/80">Devnet helpers</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                onClick={handleAirdrop}
                disabled={requestingAirdrop}
                className="w-full bg-green-500/90 hover:bg-green-400 text-black     py-3 rounded-md disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {requestingAirdrop ? 'Requesting…' : 'Request 1 SOL'}
              </button>
              <button
                onClick={() => {
                  refetchBalance();
                  refetchBonk();
                  setMessage('Balances refreshed');
                }}
                className="w-full border border-green-500/60 text-green-100     py-3 rounded-md hover:bg-green-500/10 transition-colors"
              >
                Refresh balances
              </button>
            </div>
            <p className="text-xs text-green-300/80    ">
              Requests are Devnet-only. Use refresh if airdrops or transfers haven’t reflected yet.
            </p>
          </div>

          <div className={`${CARD_BASE} space-y-4`}>
            <div className="flex items-center justify-between">
              <h3 className="text-green-200     text-xl">Token accounts</h3>
              <span className="text-xs     text-green-400/80">{tokens?.length ?? 0} tracked</span>
            </div>
            {tokens && tokens.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {tokens.map((token, index) => (
                  <div
                    key={`${token.mint}-${index}`}
                    className="rounded-lg border border-green-600/30 bg-black/60 p-3 text-sm text-green-100    "
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-green-400/70 mb-1">Mint</p>
                    <p className="break-all mb-2">{token.mint}</p>
                    <p>
                      Balance:{' '}
                      <span className="text-green-300">
                        {token.amount?.toFixed(token.decimals || 0) || 0}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-green-300/80    ">No SPL token accounts detected for this wallet.</p>
            )}
          </div>
        </section>
      </div>

      {message && (
        <div className={`${CARD_BASE} border-green-500/60`}>
          <p className="text-green-300     text-sm">{message}</p>
        </div>
      )}
    </div>
  );
}
