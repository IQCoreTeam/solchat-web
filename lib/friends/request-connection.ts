import { Connection, PublicKey } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { DM_TABLE_NAME, MESSAGE_COLUMNS } from '@/lib/iqlabs/constants';

export async function requestDmConnection(
  connection: Connection,
  signer: SignerInput,
  dbRootId: Uint8Array,
  requesterPub: string,
  receiverPub: string,
): Promise<{ signature: string | null; connectionSeed: Uint8Array; connectionTable: PublicKey; alreadyExists: boolean }> {
  const connectionSeed = iqlabs.utils.deriveDmSeed(requesterPub, receiverPub);
  const dbRoot = iqlabs.contract.getDbRootPda(dbRootId);
  const connectionTable = iqlabs.contract.getConnectionTablePda(dbRoot, connectionSeed);

  const existing = await connection.getAccountInfo(connectionTable);
  if (existing) {
    return { signature: null, connectionSeed, connectionTable, alreadyExists: true };
  }

  const signature = await iqlabs.writer.requestConnection(
    connection,
    signer,
    dbRootId,
    requesterPub,
    receiverPub,
    DM_TABLE_NAME,
    [...MESSAGE_COLUMNS],
    'id',
    [],
  );

  const txInfo = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (txInfo?.meta?.err) {
    const logs = txInfo.meta.logMessages?.join('\n') ?? '';
    const insufficient = logs.includes('insufficient lamports');
    throw new Error(insufficient ? 'Insufficient SOL balance to create DM connection (~0.002 SOL required).' : `Transaction reverted on-chain: ${JSON.stringify(txInfo.meta.err)}`);
  }

  return { signature, connectionSeed, connectionTable, alreadyExists: false };
}
