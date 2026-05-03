'use client';

/**
 * Unified wallet hook. Returns the same AppWallet interface regardless of which
 * underlying provider is active:
 *  - 'privy'  → Privy embedded Solana wallet (no per-tx popup, email/SMS login)
 *  - 'wallet' → Solana wallet-adapter (Phantom/Solflare/Torus/Ledger, signs each tx)
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { RPC_URL, HELIUS_RPC_URL } from '@/lib/constants';
import { setRpcUrl } from 'iqlabs-sdk';
import { useWalletMode } from './wallet-mode';

export interface AppWallet {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  sendTransaction: (tx: Transaction, connection: Connection) => Promise<string>;
}

const EMPTY_WALLET: AppWallet = {
  publicKey: null,
  connected: false,
  connecting: false,
  disconnecting: false,
  signTransaction: async () => {
    throw new Error('No wallet connected');
  },
  signAllTransactions: async () => {
    throw new Error('No wallet connected');
  },
  signMessage: async () => {
    throw new Error('No wallet connected');
  },
  sendTransaction: async () => {
    throw new Error('No wallet connected');
  },
};

function usePrivyAppWallet(): AppWallet {
  const { ready: privyReady, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  const embeddedWallet = useMemo(() => {
    if (!user || !user.linkedAccounts) return null;
    const solanaWallet = user.linkedAccounts.find(
      (account: any) =>
        account.type === 'wallet' &&
        account.walletClientType === 'privy' &&
        account.chainType === 'solana'
    ) as any;
    return solanaWallet || null;
  }, [user]);

  // IMPORTANT: never fall back to wallets[0] — that could be an external wallet
  // attached for funding, not the embedded signing wallet.
  const connectedWallet = useMemo(() => {
    if (!wallets || wallets.length === 0 || !embeddedWallet?.address) return null;
    return wallets.find((w) => w.address === embeddedWallet.address) || null;
  }, [wallets, embeddedWallet]);

  const publicKey = useMemo(() => {
    if (!embeddedWallet?.address) return null;
    return new PublicKey(embeddedWallet.address);
  }, [embeddedWallet]);

  const signTransaction = useMemo(() => {
    return async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (!connectedWallet || !publicKey) {
        throw new Error('Please log in with Privy to continue');
      }
      if (!connectedWallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }
      const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta';
      const chain = `solana:${cluster}` as const;
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });
      const result = await connectedWallet.signTransaction({
        chain,
        transaction: new Uint8Array(serialized),
      });
      const signedTx = Transaction.from(result.signedTransaction);
      return signedTx as T;
    };
  }, [connectedWallet, publicKey]);

  const signAllTransactions = useMemo(() => {
    return async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      return Promise.all(txs.map((tx) => signTransaction(tx)));
    };
  }, [signTransaction]);

  const signMessage = useMemo(() => {
    return async (message: Uint8Array): Promise<Uint8Array> => {
      if (!connectedWallet) {
        throw new Error('Please log in with Privy to continue');
      }
      if (!connectedWallet.signMessage) {
        throw new Error('Wallet does not support message signing');
      }
      const result = await connectedWallet.signMessage({ message });
      return new Uint8Array(result.signature);
    };
  }, [connectedWallet]);

  const sendTransaction = useMemo(() => {
    return async (tx: Transaction, connection: Connection): Promise<string> => {
      const signed = await signTransaction(tx);
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(signature, 'confirmed');
      return signature;
    };
  }, [signTransaction]);

  return {
    publicKey,
    connected: !!embeddedWallet && !!connectedWallet,
    connecting: !privyReady || (authenticated && !embeddedWallet),
    disconnecting: false,
    signTransaction,
    signAllTransactions,
    signMessage,
    sendTransaction,
  };
}

function useExternalAppWallet(): AppWallet {
  const w = useWallet();

  const signTransaction = useMemo(() => {
    return async <T extends Transaction | VersionedTransaction>(tx: T): Promise<T> => {
      if (!w.signTransaction) throw new Error('Wallet does not support transaction signing');
      return w.signTransaction(tx);
    };
  }, [w.signTransaction]);

  const signAllTransactions = useMemo(() => {
    return async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      if (!w.signAllTransactions) throw new Error('Wallet does not support batch signing');
      return w.signAllTransactions(txs);
    };
  }, [w.signAllTransactions]);

  const signMessage = useMemo(() => {
    return async (message: Uint8Array): Promise<Uint8Array> => {
      if (!w.signMessage) throw new Error('Wallet does not support message signing');
      return w.signMessage(message);
    };
  }, [w.signMessage]);

  const sendTransaction = useMemo(() => {
    return async (tx: Transaction, connection: Connection): Promise<string> => {
      const signature = await w.sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, 'confirmed');
      return signature;
    };
  }, [w.sendTransaction]);

  return {
    publicKey: w.publicKey,
    connected: w.connected,
    connecting: w.connecting,
    disconnecting: w.disconnecting,
    signTransaction,
    signAllTransactions,
    signMessage,
    sendTransaction,
  };
}

export function useAppWallet(): AppWallet {
  const { mode } = useWalletMode();
  const privyWallet = usePrivyAppWallet();
  const externalWallet = useExternalAppWallet();

  if (mode === 'wallet') return externalWallet;
  if (mode === 'privy') return privyWallet;
  return EMPTY_WALLET;
}

/**
 * Connection hook - returns consistent Solana connection
 */
const RPC_STORAGE_KEY = 'solchat:rpc-endpoint';

function extractWalletRpcEndpoint(wallet: any): string | null {
  if (!wallet) return null;
  return (
    wallet.rpcUrl ||
    wallet.rpcEndpoint ||
    wallet.endpoint ||
    wallet.url ||
    wallet.provider?.rpcUrl ||
    wallet.provider?.endpoint ||
    null
  );
}

export function useAppConnection() {
  const { mode } = useWalletMode();
  const { wallets } = useWallets();
  const [customRpc, setCustomRpc] = useState<string | null>(null);
  const [providerRpc, setProviderRpc] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(RPC_STORAGE_KEY);
      if (stored) {
        setCustomRpc(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (mode !== 'privy') {
      setProviderRpc(null);
      return;
    }
    const primary = wallets && wallets.length > 0 ? wallets[0] : null;
    const candidate = extractWalletRpcEndpoint(primary);
    setProviderRpc(candidate);
  }, [mode, wallets]);

  const setCustomRpcEndpoint = useCallback((endpoint: string | null) => {
    setCustomRpc(endpoint);
    if (typeof window !== 'undefined') {
      try {
        if (endpoint) {
          window.localStorage.setItem(RPC_STORAGE_KEY, endpoint);
        } else {
          window.localStorage.removeItem(RPC_STORAGE_KEY);
        }
      } catch {
        // ignore
      }
    }
  }, []);

  const endpoint = customRpc || providerRpc || RPC_URL;
  const endpointSource: 'custom' | 'provider' | 'default' = customRpc
    ? 'custom'
    : providerRpc
      ? 'provider'
      : 'default';

  // Write connection: skip preflight since the default RPC's simulation
  // is unreliable and can falsely reject valid signed transactions
  const connection = useMemo(() => {
    const conn = new Connection(endpoint, 'confirmed');
    const origSendRawTransaction = conn.sendRawTransaction.bind(conn);
    conn.sendRawTransaction = (raw: Buffer | Uint8Array | number[], opts?: any) =>
      origSendRawTransaction(raw, { ...opts, skipPreflight: true });
    return conn;
  }, [endpoint]);

  // Read connection: Helius (reliable reads, tx history support)
  const readConnection = useMemo(
    () => HELIUS_RPC_URL ? new Connection(HELIUS_RPC_URL, 'confirmed') : connection,
    [connection]
  );

  useEffect(() => {
    setRpcUrl(HELIUS_RPC_URL || endpoint);
  }, [endpoint]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).solchatSetRpcEndpoint = setCustomRpcEndpoint;
  }, [setCustomRpcEndpoint]);

  return { connection, readConnection, rpcEndpoint: endpoint, endpointSource, setCustomRpcEndpoint };
}
