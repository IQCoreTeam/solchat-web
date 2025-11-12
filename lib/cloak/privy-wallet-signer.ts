'use client';

/**
 * Privy wallet signer adapter for Cloak SDK
 * Converts Privy wallet to TransactionSigner interface
 */

import type { TransactionSigner } from '@cloak-dev/sdk';
import type { Transaction, VersionedTransaction, PublicKey } from '@solana/web3.js';
import type { AppWallet } from '@/lib/wallet/use-app-wallet';

export function createPrivyWalletSigner(wallet: AppWallet): TransactionSigner {
  if (!wallet.publicKey) {
    throw new Error('Please log in with Privy to continue');
  }

  return {
    publicKey: wallet.publicKey,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) =>
      (await wallet.signTransaction(tx)) as T,
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) =>
      (await wallet.signAllTransactions(txs)) as T[],
    signMessage: async (message: Uint8Array) => wallet.signMessage(message),
  } satisfies TransactionSigner;
}
