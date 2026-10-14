'use client';

/**
 * Unified wallet hook. Returns the same AppWallet interface regardless of which
 * underlying provider is active:
 *  - 'privy'  → Privy embedded Solana wallet (no per-tx popup, email/SMS login)
 *  - 'wallet' → Solana wallet-adapter (Phantom/Solflare/Torus/Ledger, signs each tx)
 */

import { useMemo, useCallback } from 'react';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { useWallet } from '@solana/wallet-adapter-react';
import { useAppConnection } from './app-connection';
export { useAppConnection } from './app-connection';
import { useWalletMode } from './wallet-mode';
import { signTransactionWithPreflight } from './transaction-preflight';

export interface AppWallet {
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  disconnecting: boolean;
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
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


  return {
    publicKey,
    connected: !!embeddedWallet && !!connectedWallet,
    connecting: !privyReady || (authenticated && !embeddedWallet),
    disconnecting: false,
    signTransaction,
    signAllTransactions,
    signMessage,
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


  return {
    publicKey: w.publicKey,
    connected: w.connected,
    connecting: w.connecting,
    disconnecting: w.disconnecting,
    signTransaction,
    signAllTransactions,
    signMessage,
  };
}

export function useAppWallet(): AppWallet {
  const { mode } = useWalletMode();
  const privyWallet = usePrivyAppWallet();
  const externalWallet = useExternalAppWallet();
  const { connection } = useAppConnection();
  const wallet = mode === 'wallet' ? externalWallet : mode === 'privy' ? privyWallet : EMPTY_WALLET;
  const signTransaction = useCallback(
    <T extends Transaction | VersionedTransaction>(transaction: T) =>
      signTransactionWithPreflight(connection, transaction, wallet.signTransaction),
    [connection, wallet.signTransaction],
  );

  return mode ? { ...wallet, signTransaction } : EMPTY_WALLET;
}
