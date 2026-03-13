import { Buffer } from 'buffer';
import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import { BorshInstructionCoder, type Idl } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk';
import idl from 'iqlabs-sdk/idl/code_in.json';
import { FEE_RECEIVER } from '@/lib/iqlabs/constants';

const FEE_RECEIVER_PUBKEY = new PublicKey(FEE_RECEIVER);

type RequestConnectionIxParams = {
  dbRootId: Uint8Array;
  programId: PublicKey;
  requester: PublicKey;
  receiver: PublicKey;
  tableName: string;
  columns: readonly string[];
  idCol: string;
};

/**
 * Build a request_connection instruction with the correct account ordering.
 *
 * The deployed on-chain program (commit 9000cfa) added `fee_receiver` as the
 * first account in the RequestConnection context, but the SDK IDL was never
 * updated. We encode args via the SDK's BorshInstructionCoder and manually
 * assemble the accounts in the order the program expects:
 *
 *   fee_receiver, requester, db_root, connection_table, instruction_table,
 *   requester_user, receiver_user, table_ref, target_table_ref, system_program
 */
export function buildRequestConnectionInstruction(
  params: RequestConnectionIxParams,
): {
  ix: TransactionInstruction;
  connectionSeed: Uint8Array;
  connectionTable: PublicKey;
} {
  const { dbRootId, programId, requester, receiver, tableName, columns, idCol } = params;

  const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, programId);
  const connectionSeed = iqlabs.utils.deriveDmSeed(
    requester.toBase58(),
    receiver.toBase58(),
  );
  const connectionSeedBuf = Buffer.from(connectionSeed);
  const connectionTable = iqlabs.contract.getConnectionTablePda(
    dbRoot, connectionSeed, programId,
  );
  const instructionTable = iqlabs.contract.getConnectionInstructionTablePda(
    dbRoot, connectionSeed, programId,
  );
  const tableRef = iqlabs.contract.getConnectionTableRefPda(
    dbRoot, connectionSeed, programId,
  );
  const targetTableRef = iqlabs.contract.getTargetConnectionTableRefPda(
    dbRoot, connectionSeed, programId,
  );
  const requesterUser = iqlabs.contract.getUserPda(requester, programId);
  const receiverUser = iqlabs.contract.getUserPda(receiver, programId);

  // Encode instruction data (args are identical to the IDL)
  const coder = new BorshInstructionCoder(idl as Idl);
  const data = coder.encode('request_connection', {
    db_root_id: Buffer.from(dbRootId),
    connection_seed: connectionSeedBuf,
    receiver,
    table_name: Buffer.from(tableName, 'utf8'),
    column_names: columns.map((name) => Buffer.from(name, 'utf8')),
    id_col: Buffer.from(idCol, 'utf8'),
    ext_keys: [],
    user_payload: Buffer.from(
      JSON.stringify({ dmTable: connectionTable.toBase58() }),
      'utf8',
    ),
  });

  // Account ordering must match the deployed Rust struct (commit 9000cfa):
  // fee_receiver (first), requester, db_root, then the rest
  const ix = new TransactionInstruction({
    programId,
    keys: [
      { pubkey: FEE_RECEIVER_PUBKEY, isSigner: false, isWritable: true },
      { pubkey: requester, isSigner: true, isWritable: true },
      { pubkey: dbRoot, isSigner: false, isWritable: true },
      { pubkey: connectionTable, isSigner: false, isWritable: true },
      { pubkey: instructionTable, isSigner: false, isWritable: true },
      { pubkey: requesterUser, isSigner: false, isWritable: true },
      { pubkey: receiverUser, isSigner: false, isWritable: true },
      { pubkey: tableRef, isSigner: false, isWritable: true },
      { pubkey: targetTableRef, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });

  return { ix, connectionSeed, connectionTable };
}
