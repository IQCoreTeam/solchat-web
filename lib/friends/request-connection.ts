import { Buffer } from 'buffer';
import { PublicKey, SystemProgram, type TransactionInstruction } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';

type RequestConnectionIxParams = {
  builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
  dbRootId: Uint8Array;
  programId: PublicKey;
  requester: PublicKey;
  receiver: PublicKey;
  tableName: string;
  columns: readonly string[];
  idCol: string;
};

export function buildRequestConnectionInstruction(
  params: RequestConnectionIxParams
): {
  ix: TransactionInstruction;
  connectionSeed: Uint8Array;
  connectionTable: PublicKey;
} {
  const {
    builder,
    dbRootId,
    programId,
    requester,
    receiver,
    tableName,
    columns,
    idCol,
  } = params;

  const dbRoot = iqlabs.contract.getDbRootPda(dbRootId, programId);
  const connectionSeed = iqlabs.utils.deriveDmSeed(requester.toBase58(), receiver.toBase58());
  const connectionSeedBuf = Buffer.from(connectionSeed);
  const connectionTable = iqlabs.contract.getConnectionTablePda(
    dbRoot,
    connectionSeed,
    programId
  );
  const instructionTable = iqlabs.contract.getConnectionInstructionTablePda(
    dbRoot,
    connectionSeed,
    programId
  );
  const tableRef = iqlabs.contract.getConnectionTableRefPda(
    dbRoot,
    connectionSeed,
    programId
  );
  const targetTableRef = iqlabs.contract.getTargetConnectionTableRefPda(
    dbRoot,
    connectionSeed,
    programId
  );
  const requesterUser = iqlabs.contract.getUserPda(requester, programId);
  const receiverUser = iqlabs.contract.getUserPda(receiver, programId);
  const payloadBody = { dmTable: connectionTable.toBase58() };

  const ix = iqlabs.contract.requestConnectionInstruction(
    builder,
    {
      requester,
      db_root: dbRoot,
      connection_table: connectionTable,
      instruction_table: instructionTable,
      requester_user: requesterUser,
      receiver_user: receiverUser,
      table_ref: tableRef,
      target_table_ref: targetTableRef,
      system_program: SystemProgram.programId,
    },
    {
      db_root_id: dbRootId,
      connection_seed: connectionSeedBuf,
      receiver,
      table_name: Buffer.from(tableName, 'utf8'),
      column_names: columns.map((name) => Buffer.from(name, 'utf8')),
      id_col: Buffer.from(idCol, 'utf8'),
      ext_keys: [],
      user_payload: Buffer.from(JSON.stringify(payloadBody), 'utf8'),
    }
  );

  return { ix, connectionSeed, connectionTable };
}
