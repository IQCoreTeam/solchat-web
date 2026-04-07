import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { PublicKey as Web3PublicKey, SystemProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { sendTx } from '@/lib/iqlabs/send-tx';
import { MESSAGE_COLUMNS, ROOT_ID } from '@/lib/iqlabs/constants';
import { decodeBytes, normalizeBytes } from '@/lib/shared/message-helpers';
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
  readConnection: Connection;
  rootPubkey: PublicKey;
  sortRoomsByTimestamp: (list: RoomMeta[]) => RoomMeta[];
  signer: SignerInput | null;
  builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
  dbRootId: Buffer;
};

export function useRooms({
  rootStatus,
  rootAccount,
  coder,
  connection,
  readConnection,
  rootPubkey,
  sortRoomsByTimestamp,
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
      // Use SDK reader to get table seeds (BorshAccountsCoder doesn't decode them correctly)
      const rootData = await iqlabs.reader.getTablelistFromRoot(readConnection, ROOT_ID);
      const seedsRaw = rootData.tableSeeds ?? [];

      // SDK returns table hints as hex-encoded UTF-8 strings.
      // toSeedBytes(string) hashes the string to 32 bytes for PDA derivation.
      // We must pass the decoded UTF-8 string, not the raw bytes.
      const entries = seedsRaw
        .map((entry: any) => {
          const hintStr = typeof entry === 'string'
            ? Buffer.from(entry, 'hex').toString('utf8')
            : Buffer.from(normalizeBytes(entry)).toString('utf8');
          if (!hintStr) return null;
          const seed = iqlabs.utils.toSeedBytes(hintStr);
          return { hint: Buffer.from(hintStr, 'utf8'), seed };
        })
        .filter(Boolean) as { hint: Uint8Array; seed: Uint8Array }[];

      // Dedupe by seed hex
      const uniqueSeeds = Array.from(
        new Map(entries.map(e => [Buffer.from(e.seed).toString('hex'), e] as const)).values()
      );

      if (uniqueSeeds.length === 0) {
        setRooms([]);
        return;
      }


      const seedsWithPdas = uniqueSeeds.map(({ seed }) => ({
        seed,
        seedHex: Buffer.from(seed).toString('hex'),
        tablePda: iqlabs.contract.getTablePda(rootPubkey, seed),
        instrPda: iqlabs.contract.getInstructionTablePda(rootPubkey, seed),
      }));


      // Batch fetch all table accounts
      const tablePdas = seedsWithPdas.map((s) => s.tablePda);
      const tableAccounts = await readConnection.getMultipleAccountsInfo(tablePdas);

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
  }, [rootStatus, rootAccount, coder, readConnection, rootPubkey, sortRoomsByTimestamp]);

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
      const table = iqlabs.contract.getTablePda(rootPubkey, tableSeed);
      const instructionTable = iqlabs.contract.getInstructionTablePda(
        rootPubkey,
        tableSeed
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
          table_hint: Buffer.from(trimmedName, 'utf8'),
          table_name: Buffer.from(trimmedName, 'utf8'),
          column_names: MESSAGE_COLUMNS.map((name) => Buffer.from(name, 'utf8')),
          id_col: Buffer.from('id', 'utf8'),
          ext_keys: [],
          table_hint: Buffer.from(tableSeed),
          gate_opt: gateMintPubkey ?? null,
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
  }, [signer, newRoomName, newRoomGateMint, connection, loadRooms, rootPubkey, builder, dbRootId]);

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
