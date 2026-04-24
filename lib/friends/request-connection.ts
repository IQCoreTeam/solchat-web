import { Connection, PublicKey } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/utils';

/**
 * Request a DM connection between two wallets.
 * SDK 0.1.20 IDL has the correct account ordering (fee_receiver first),
 * so we use iqlabs.writer.requestConnection() directly.
 */
export async function requestDmConnection(
  connection: Connection,
  signer: SignerInput,
  dbRootId: Uint8Array,
  requesterPub: string,
  receiverPub: string,
): Promise<{ signature: string; connectionSeed: Uint8Array; connectionTable: PublicKey }> {
  const connectionSeed = iqlabs.utils.deriveDmSeed(requesterPub, receiverPub);
  const dbRoot = iqlabs.contract.getDbRootPda(dbRootId);
  const connectionTable = iqlabs.contract.getConnectionTablePda(dbRoot, connectionSeed);

  const signature = await iqlabs.writer.requestConnection(
    connection,
    signer,
    dbRootId,
    requesterPub,
    receiverPub,
    "messages",
    ["content", "timestamp"],
    "timestamp",
    [],
  );

  return { signature, connectionSeed, connectionTable };
}
