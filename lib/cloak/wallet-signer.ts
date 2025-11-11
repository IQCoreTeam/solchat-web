'use client';

import type { TransactionSigner } from '@cloak-labs/sdk';
import type { WalletContextState } from '@solana/wallet-adapter-react';
import type { Transaction, VersionedTransaction } from '@solana/web3.js';

function ensureSignTransaction(wallet: WalletContextState) {
  if (!wallet.signTransaction) {
    throw new Error('Wallet must support signTransaction to use Cloak');
  }
  return wallet.signTransaction;
}

export function createWalletAdapterSigner(wallet: WalletContextState): TransactionSigner {
  if (!wallet.publicKey) {
    throw new Error('Connect your wallet to continue');
  }

  const signTransaction = ensureSignTransaction(wallet);

  return {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) =>
      (await signTransaction(tx as any)) as T,
    signAllTransactions: wallet.signAllTransactions
      ? async <T extends Transaction | VersionedTransaction>(txs: T[]) =>
          (await wallet.signAllTransactions!(txs as any)) as T[]
      : async <T extends Transaction | VersionedTransaction>(txs: T[]) =>
          Promise.all(txs.map((tx) => signTransaction(tx as any))) as Promise<T[]>,
    signMessage: wallet.signMessage
      ? async (message: Uint8Array) => wallet.signMessage!(message)
      : undefined,
  } satisfies TransactionSigner;
}
