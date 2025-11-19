/**
 * Transaction sending helpers for Solana
 */

import { Connection, Transaction } from '@solana/web3.js';

export interface WalletLike {
  publicKey: { toBase58: () => string } | null;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

/**
 * Send and confirm a transaction
 * @param connection - Solana connection
 * @param wallet - Wallet adapter
 * @param tx - Transaction to send
 * @param successMsg - Message to log on success (optional)
 * @returns Transaction signature
 */
export async function sendAndConfirmTx(
  connection: Connection,
  wallet: WalletLike,
  tx: Transaction,
  successMsg?: string
): Promise<string> {
  if (!wallet.publicKey) {
    throw new Error('Wallet not connected');
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = wallet.publicKey as any;

  const signed = await wallet.signTransaction(tx);
  const serialized = signed.serialize();
  const signature = await connection.sendRawTransaction(serialized);

  if (successMsg) {
    console.log(successMsg, signature);
  }

  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    'processed'
  );

  return signature;
}
