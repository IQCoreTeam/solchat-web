'use client';

/**
 * Unified wallet hook that always uses Privy embedded wallet for all app functionality.
 * External wallets (Phantom, Solflare) are ONLY used for Privy authentication.
 */

import { useMemo, useState, useEffect, useCallback } from 'react';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { RPC_URL } from '@/lib/constants';
import { setRpcUrl } from 'iqlabs-sdk/src';

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

/**
 * Main wallet hook - always returns Privy embedded wallet
 * External wallets are only for Privy login/signup
 */
export function useAppWallet(): AppWallet {
  const { ready: privyReady, authenticated, user } = usePrivy();
  const { wallets } = useWallets();

  // Get Privy embedded wallet from linked accounts
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

  // Get the connected wallet from useWallets (for signing capabilities)
  const connectedWallet = useMemo(() => {
    if (!wallets || wallets.length === 0) return null;

    // Find the embedded wallet in connected wallets
    // If user has linked account, it should be in wallets array when ready
    return wallets.find((w) => w.address === embeddedWallet?.address) || wallets[0] || null;
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

      // Use the cluster from environment variable
      const cluster = process.env.NEXT_PUBLIC_SOLANA_CLUSTER || 'mainnet-beta';
      const chain = `solana:${cluster}` as const;

      // Serialize the transaction to get the message
      const serialized = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Sign through Privy (UI modal disabled globally via showWalletUIs: false)
      const result = await connectedWallet.signTransaction({
        chain,
        transaction: new Uint8Array(serialized),
      });

      // Deserialize the signed transaction and return it
      const signedTx = Transaction.from(result.signedTransaction);
      return signedTx as T;
    };
  }, [connectedWallet, publicKey]);

  const signAllTransactions = useMemo(() => {
    return async <T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> => {
      if (!connectedWallet) {
        throw new Error('Please log in with Privy to continue');
      }

      return Promise.all(txs.map((tx) => signTransaction(tx)));
    };
  }, [connectedWallet, signTransaction]);

  const signMessage = useMemo(() => {
    return async (message: Uint8Array): Promise<Uint8Array> => {
      if (!connectedWallet) {
        throw new Error('Please log in with Privy to continue');
      }

      if (!connectedWallet.signMessage) {
        throw new Error('Wallet does not support message signing');
      }

      const result = await connectedWallet.signMessage({
        message: message,
      });

      return new Uint8Array(result.signature);
    };
  }, [connectedWallet]);

  const sendTransaction = useMemo(() => {
    return async (tx: Transaction, connection: Connection): Promise<string> => {
      if (!connectedWallet || !publicKey) {
        throw new Error('Please log in with Privy to continue');
      }

      // Sign the transaction (without popup)
      const signed = await signTransaction(tx);

      // Send the signed transaction
      const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });

      // Confirm the transaction
      await connection.confirmTransaction(signature, 'confirmed');

      return signature;
    };
  }, [connectedWallet, publicKey, signTransaction]);

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
  const { wallets } = useWallets();
  const [customRpc, setCustomRpc] = useState<string | null>(null);
  const [providerRpc, setProviderRpc] = useState<string | null>(null);

  // Load persisted custom RPC once on mount
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

  // Track RPC exposed by the connected wallet (if any)
  useEffect(() => {
    const primary = wallets && wallets.length > 0 ? wallets[0] : null;
    const candidate = extractWalletRpcEndpoint(primary);
    if (candidate) {
      setProviderRpc(candidate);
    } else {
      setProviderRpc(null);
    }
  }, [wallets]);

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

  const connection = useMemo(() => new Connection(endpoint, 'confirmed'), [endpoint]);

  useEffect(() => {
    setRpcUrl(endpoint);
  }, [endpoint]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    (window as any).solchatSetRpcEndpoint = setCustomRpcEndpoint;
  }, [setCustomRpcEndpoint]);

  return { connection, rpcEndpoint: endpoint, endpointSource, setCustomRpcEndpoint };
}
