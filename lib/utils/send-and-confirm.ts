import type { Connection, TransactionInstruction } from '@solana/web3.js';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { sendTx } from '@/lib/iqlabs/send-tx';

/**
 * Send a transaction and verify it succeeded on-chain.
 *
 * The SDK's `sendTx` with `skipPreflight: true` only checks that the
 * transaction was included in a block — it does NOT detect instruction
 * failures. This wrapper fetches the transaction after confirmation and
 * throws if the instruction errored.
 */
export async function sendAndConfirmTx(
  writeConnection: Connection,
  readConnection: Connection,
  signer: SignerInput,
  instructions: TransactionInstruction | TransactionInstruction[],
): Promise<string> {
  const signature = await sendTx(writeConnection, signer, instructions);

  // Give the read RPC a moment to index the transaction
  await new Promise((r) => setTimeout(r, 1500));

  const tx = await readConnection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  });

  if (tx?.meta?.err) {
    const errJson = JSON.stringify(tx.meta.err);
    const logs = tx.meta.logMessages?.join('\n') ?? '';
    throw new Error(
      `Transaction succeeded on-chain but instruction failed: ${errJson}\n${logs}`,
    );
  }

  return signature;
}
