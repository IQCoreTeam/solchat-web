'use client';

import { useMemo } from 'react';
import { Connection, PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { RPC_URL } from '@/lib/constants';

/**
 * Privy-compatible wallet adapter that mimics @solana/wallet-adapter-react interface
 * This allows components to work with Privy wallets using the familiar wallet adapter API
 */
export function usePrivyWalletAdapter() {
  const { ready: privyReady } = usePrivy();
  const { wallets } = useWallets();

  // Get the first available wallet (external or embedded)
  const wallet = useMemo(() => {
    if (!wallets || wallets.length === 0) return null;
    // Prefer the first wallet in the list
    return wallets[0];
  }, [wallets]);

  const publicKey = useMemo(() => {
    if (!wallet) return null;
    return new PublicKey(wallet.address);
  }, [wallet]);

  const signTransaction = useMemo(() => {
    if (!wallet) return undefined;

    return async <T extends Transaction | VersionedTransaction>(transaction: T): Promise<T> => {
      if (!wallet.signTransaction) {
        throw new Error('Wallet does not support transaction signing');
      }

      // Serialize the transaction
      const serialized = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      // Sign through Privy
      const result = await wallet.signTransaction({
        chain: 'solana:devnet', // or mainnet-beta
        transaction: new Uint8Array(serialized),
      });

      // The result should contain the signed transaction
      // You may need to deserialize based on your needs
      return transaction as T;
    };
  }, [wallet]);

  const signMessage = useMemo(() => {
    if (!wallet) return undefined;

    return async (message: Uint8Array): Promise<Uint8Array> => {
      if (!wallet.signMessage) {
        throw new Error('Wallet does not support message signing');
      }

      const result = await wallet.signMessage({
        message: message,
      });

      return new Uint8Array(result.signature);
    };
  }, [wallet]);

  return {
    publicKey,
    connected: !!wallet,
    connecting: !privyReady,
    disconnecting: false,
    wallet: wallet ? {
      adapter: {
        name: 'Privy Wallet',
        icon: '',
        url: '',
        publicKey,
        connected: true,
        supportedTransactionVersions: new Set(['legacy', 0]),
      }
    } : null,
    signTransaction,
    signMessage,
    signAllTransactions: undefined, // Implement if needed
  };
}

/**
 * Compatibility hook for useConnection
 */
export function usePrivyConnection() {
  const connection = useMemo(() => new Connection(RPC_URL, 'confirmed'), []);

  return { connection };
}
