import {
  Connection,
  type Transaction,
  VersionedTransaction,
} from '@solana/web3.js';

/** Validate on the app's RPC before asking a wallet to sign. Never mutate the transaction. */
export async function signTransactionWithPreflight<
  T extends Transaction | VersionedTransaction,
>(
  connection: Connection,
  transaction: T,
  signTransaction: (transaction: T) => Promise<T>,
): Promise<T> {
  const simulation = await connection.simulateTransaction(
    'compileMessage' in transaction
      ? new VersionedTransaction(transaction.compileMessage())
      : transaction,
    { sigVerify: false, commitment: 'confirmed' },
  );
  if (simulation.value.err) {
    throw new Error(
      `Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`,
      { cause: simulation.value },
    );
  }
  return signTransaction(transaction);
}
