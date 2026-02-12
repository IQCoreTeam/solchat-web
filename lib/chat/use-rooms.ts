import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { PublicKey as Web3PublicKey, SystemProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/dist/sdk/utils/wallet';
import { sendTx } from 'iqlabs-sdk/dist/sdk/writer/writer_utils';
import { MESSAGE_COLUMNS } from '@/lib/iqlabs/constants';
import { decodeBytes, normalizeBytes } from '@/lib/shared/message-helpers';
import type { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';
import type { RootStatus } from './use-root-account';

export type RoomMeta = {
  seedHex: string;
  seedBytes: Uint8Array;
  name: string;
  tableAddress: string;
  instructionAddress: string;
  columns: string[];
  lastTimestamp: number;
};

type UseRoomsOptions = {
  rootStatus: RootStatus;
  rootAccount: AccountInfo<Buffer> | null;
  coder: BorshAccountsCoder;
  connection: Connection;
  rootPubkey: PublicKey;
  programId: PublicKey;
  sortRoomsByTimestamp: (list: RoomMeta[]) => RoomMeta[];
  runWithRpcRateLimit: typeof runWithRpcRateLimit;
  signer: SignerInput | null;
  builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
  dbRootId: Buffer;
};

export function useRooms({
  rootStatus,
  rootAccount,
  coder,
  connection,
  rootPubkey,
  programId,
  sortRoomsByTimestamp,
  runWithRpcRateLimit,
  signer,
  builder,
  dbRootId,
}: UseRoomsOptions) {
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [newRoomName, setNewRoomName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomGateMint, setNewRoomGateMint] = useState('');

  const loadRooms = useCallback(async () => {
    if (rootStatus !== 'ready' || !rootAccount) return;
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const decoded = coder.decode('DbRoot', rootAccount.data) as {
        table_seeds?: (Uint8Array | number[])[];
        tableSeeds?: (Uint8Array | number[])[];
        global_table_seeds?: (Uint8Array | number[])[];
        globalTableSeeds?: (Uint8Array | number[])[];
      } | null;
      if (!decoded) throw new Error('Failed to decode root account');

      // Use table_seeds from the root account; exclude global tables
      const seedsRaw = decoded.table_seeds ?? decoded.tableSeeds ?? [];

      const uniqueSeeds = Array.from(
        new Map(
          seedsRaw
            .map((entry) => normalizeBytes(entry))
            .filter((seed) => seed.length)
            .map((seed) => [Buffer.from(seed).toString('hex'), seed] as const)
        ).values()
      );

      if (uniqueSeeds.length === 0) {
        setRooms([]);
        return;
      }

      // Pre-compute all PDAs
      const seedsWithPdas = uniqueSeeds.map((seed) => ({
        seed,
        seedHex: Buffer.from(seed).toString('hex'),
        tablePda: iqlabs.contract.getTablePda(rootPubkey, seed, programId),
        instrPda: iqlabs.contract.getInstructionTablePda(rootPubkey, seed, programId),
      }));

      // Batch fetch all table accounts using getMultipleAccountsInfo
      const tablePdas = seedsWithPdas.map((s) => s.tablePda);
      const tableAccounts = await runWithRpcRateLimit(
        () => connection.getMultipleAccountsInfo(tablePdas),
        { endpoint: connection.rpcEndpoint }
      );

      const roomList: RoomMeta[] = [];
      for (let i = 0; i < seedsWithPdas.length; i++) {
        const { seed, seedHex, tablePda, instrPda } = seedsWithPdas[i];
        const tableAcc = tableAccounts[i];
        if (!tableAcc) continue;
        const tableDecoded = coder.decode('Table', tableAcc.data) as {
          name?: Uint8Array | string | null;
          columnNames?: (Uint8Array | string)[];
          column_names?: (Uint8Array | string)[];
        } | null;
        if (!tableDecoded) continue;
        const name = decodeBytes(tableDecoded.name);
        const columnSource = tableDecoded.columnNames ?? tableDecoded.column_names ?? [];
        const columns = columnSource.map((value) => decodeBytes(value));
        const decodedRecord = tableDecoded as Record<string, unknown>;
        const lastTimestampRaw =
          (decodedRecord.last_timestamp as number | string | undefined)
          ?? (decodedRecord.lastTimestamp as number | string | undefined)
          ?? 0;
        const lastTimestamp = typeof lastTimestampRaw === 'number'
          ? lastTimestampRaw
          : Number(lastTimestampRaw || 0);
        roomList.push({
          seedHex,
          seedBytes: seed,
          name,
          tableAddress: tablePda.toBase58(),
          instructionAddress: instrPda.toBase58(),
          columns,
          lastTimestamp,
        });
      }
      setRooms(sortRoomsByTimestamp(roomList));
    } catch (err) {
      console.error('[ChatClient] Load rooms error:', err);
      setRoomsError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setRoomsLoading(false);
    }
  }, [rootStatus, rootAccount, coder, connection, rootPubkey, programId, sortRoomsByTimestamp, runWithRpcRateLimit]);

  const lastRootAccountRef = useRef<AccountInfo<Buffer> | null>(null);
  useEffect(() => {
    if (rootStatus !== 'ready' || !rootAccount) {
      lastRootAccountRef.current = null;
      return;
    }
    if (lastRootAccountRef.current === rootAccount) {
      return;
    }
    lastRootAccountRef.current = rootAccount;
    loadRooms();
  }, [rootStatus, rootAccount, loadRooms]);

  const handleCreateRoom = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!signer || !newRoomName.trim()) return;

    setCreatingRoom(true);
    setRoomsError(null);

    try {
      const gateMintPubkey = newRoomGateMint?.trim()
        ? new Web3PublicKey(newRoomGateMint.trim())
        : undefined;
      const trimmedName = newRoomName.trim();
      const tableSeed = iqlabs.utils.toSeedBytes(trimmedName);
      const table = iqlabs.contract.getTablePda(rootPubkey, tableSeed, programId);
      const instructionTable = iqlabs.contract.getInstructionTablePda(
        rootPubkey,
        tableSeed,
        programId
      );
      const ix = iqlabs.contract.createTableInstruction(
        builder,
        {
          db_root: rootPubkey,
          receiver: new Web3PublicKey(iqlabs.constants.DEFAULT_WRITE_FEE_RECEIVER),
          signer: signer.publicKey,
          table,
          instruction_table: instructionTable,
          system_program: SystemProgram.programId,
        },
        {
          db_root_id: dbRootId,
          table_seed: Buffer.from(tableSeed),
          table_name: Buffer.from(trimmedName, 'utf8'),
          column_names: MESSAGE_COLUMNS.map((name) => Buffer.from(name, 'utf8')),
          id_col: Buffer.from('id', 'utf8'),
          ext_keys: [],
          gate_mint_opt: gateMintPubkey ?? null,
          writers_opt: null,
        }
      );
      await sendTx(connection, signer, ix);

      setNewRoomName('');
      setNewRoomGateMint('');
      await loadRooms();
    } catch (err) {
      console.error('[ChatClient] Create room error:', err);
      setRoomsError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setCreatingRoom(false);
    }
  }, [signer, newRoomName, newRoomGateMint, connection, loadRooms, rootPubkey, programId, builder, dbRootId]);

  return {
    rooms,
    setRooms,
    roomsLoading,
    roomsError,
    newRoomName,
    setNewRoomName,
    newRoomGateMint,
    setNewRoomGateMint,
    creatingRoom,
    handleCreateRoom,
  };
}
