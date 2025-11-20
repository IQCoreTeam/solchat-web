'use client'

import type { Idl, Program } from '@coral-xyz/anchor'
import { Connection, PublicKey, SystemProgram } from '@solana/web3.js'
import { configs } from '../configs'
import { deriveSeedBytes, rootIdToBytes, toBytes, type BytesLike } from '../core/seed'
import { getAnchorProvider, getProgram, type WalletAdapterLike } from './provider'

const enc = new TextEncoder()

// Resolve program id from ctx.idl or fallback configs
function programPkFromCtx<T extends Idl>(ctx: { idl: T; programId?: string }) {
  const addr = (ctx.programId as string) || ((ctx.idl as any)?.address as string) || configs.programId
  return new PublicKey(addr)
}

// PDA helpers calculated with program id from IDL (must match on-chain seeds)
function pdaRootDyn(programId: PublicKey, rootId: BytesLike) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.rootSeed), programId.toBuffer(), rootBytes],
    programId
  )[0]
}
function pdaTxRefDyn(programId: PublicKey, rootId: BytesLike) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.txRefSeed), programId.toBuffer(), rootBytes],
    programId
  )[0]
}
function pdaTargetTxRefDyn(programId: PublicKey, rootId: BytesLike) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.txRefSeed),
      programId.toBuffer(),
      rootBytes,
      Buffer.from(configs.targetSeed),
    ],
    programId
  )[0]
}
function pdaTableDyn(programId: PublicKey, rootPk: PublicKey, tableName: string) {
  const tableSeed = deriveSeedBytes(tableName)
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.tableSeed), programId.toBuffer(), rootPk.toBuffer(), Buffer.from(tableSeed)],
    programId
  )[0]
}
function pdaInstructionTableDyn(programId: PublicKey, rootPk: PublicKey, tableName: string) {
  const tableSeed = deriveSeedBytes(tableName)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programId.toBuffer(),
      rootPk.toBuffer(),
      Buffer.from(tableSeed),
      Buffer.from(configs.instructionSeed),
    ],
    programId
  )[0]
}

function pdaDmTableDyn(programId: PublicKey, rootPk: PublicKey, dmSeed: BytesLike) {
  const seed = Buffer.from(toBytes(dmSeed))
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmTableSeed),
      programId.toBuffer(),
      rootPk.toBuffer(),
      seed,
    ],
    programId
  )[0]
}

function pdaDmInstructionTableDyn(programId: PublicKey, rootPk: PublicKey, dmSeed: BytesLike) {
  const seed = Buffer.from(toBytes(dmSeed))
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmTableSeed),
      programId.toBuffer(),
      rootPk.toBuffer(),
      seed,
      Buffer.from(configs.instructionSeed),
    ],
    programId
  )[0]
}

function pdaExtTableDyn(programId: PublicKey, rootPk: PublicKey, tableName: string) {
  const tableNameBytes = deriveSeedBytes(tableName)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programId.toBuffer(),
      rootPk.toBuffer(),
      Buffer.from(tableNameBytes),
    ],
    programId
  )[0]
}

function pdaExtInstructionTableDyn(programId: PublicKey, rootPk: PublicKey, tableName: string) {
  const tableNameBytes = deriveSeedBytes(tableName)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programId.toBuffer(),
      rootPk.toBuffer(),
      Buffer.from(tableNameBytes),
      Buffer.from(configs.instructionSeed),
    ],
    programId
  )[0]
}

function pdaDmListBoxDyn(programId: PublicKey, rootPk: PublicKey, userPk: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmListSeed),
      programId.toBuffer(),
      rootPk.toBuffer(),
      userPk.toBuffer(),
    ],
    programId
  )[0]
}

export type WriterCtx<T extends Idl = Idl> = {
  connection: Connection
  wallet: WalletAdapterLike
  idl: T
  programId?: string
}

function programFromCtx(ctx: WriterCtx): Program {
  const provider = getAnchorProvider(ctx.connection, ctx.wallet)
  return getProgram(provider, ctx.idl as Idl, ctx.programId)
}

/**
 * initializeRootWeb
 * - Initialize root/txRef PDAs for the wallet owner
 */
export async function initializeRootWeb<T extends Idl>(ctx: WriterCtx<T>, rootId: BytesLike) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))

  // Derive PDAs with program id from IDL
  const rootPda = pdaRootDyn(programId, rootId)
  const txRefPda = pdaTxRefDyn(programId, rootId)
  const targetTxRefPda = pdaTargetTxRefDyn(programId, rootId)

  // Resolve method name dynamically (camelCase or snake_case)
  const methods = (program as any).methods as Record<string, any>
  const init = methods?.initializeRoot ?? methods?.initialize_root
  if (!init) {
    throw new Error('Instruction "initializeRoot" (or initialize_root) not found in IDL')
  }

  const tx = await init(rootIdBuf)
    .accounts({
      root: rootPda,
      tx_ref: txRefPda,
      target_tx_ref: targetTxRefPda,
      signer,
      system_program: SystemProgram.programId,
    })
    .transaction()

  return { tx, root: rootPda.toBase58(), txRef: txRefPda.toBase58() }
}

/**
 * createTableWeb
 * - Create a table for given name + columns under caller's root
 * - options: { idColumn?: string|number; extKeys?: string[] }
 */
export async function createTableWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  tableName: string,
  columnNames: string[],
  options?: { idColumn?: string | number; extKeys?: string[]; gateMint?: PublicKey | string | null }
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))

  // Derive PDAs from IDL.address
  const root = pdaRootDyn(programId, rootId)
  const table = pdaTableDyn(programId, root, tableName)
  const instTable = pdaInstructionTableDyn(programId, root, tableName)

  const methods = (program as any).methods as Record<string, any>
  const create = methods?.create_table ?? methods?.createTable
  if (!create) {
    throw new Error('Instruction "create_table" not found in IDL')
  }

  // IDL args: (table_name: bytes, column_names: Vec<bytes>, id_col: bytes, ext_keys: Vec<bytes>)
  const tableSeed = deriveSeedBytes(tableName)
  const tableSeedBuf = Buffer.from(tableSeed)
  const nameBuf = Buffer.from(tableName, 'utf8')
  const colBufs = columnNames.map((s) => Buffer.from(s, 'utf8'))

  // id_col must be a column name present in column_names
  const idOpt = options?.idColumn
  const idName =
    typeof idOpt === 'string'
      ? idOpt
      : typeof idOpt === 'number' && columnNames[idOpt]
      ? columnNames[idOpt]
      : columnNames[0]
  if (!idName) throw new Error('idColumn is required to create table')
  const idColBuf = Buffer.from(idName, 'utf8')

  const extKeys = options?.extKeys ?? []
  const extKeysBufs = extKeys.map((s) => Buffer.from(String(s), 'utf8'))

  const gateMintOpt = options?.gateMint
    ? typeof options.gateMint === 'string'
      ? new PublicKey(options.gateMint)
      : options.gateMint
    : null

  const tx = await create(
    rootIdBuf,
    tableSeedBuf,
    nameBuf,
    colBufs,
    idColBuf,
    extKeysBufs,
    gateMintOpt
  )
    .accounts({
      root,
      signer,
      table,
      instruction_table: instTable,
      system_program: SystemProgram.programId,
    })
    .transaction()

  return { tx, table: table.toBase58(), instructionTable: instTable.toBase58() }
}

/**
 * createDmTableWeb
 * - Create a private DM table for two participants using the CreateDMTable instruction.
 * - DM tables are derived from a sorted pair seed instead of the global table list.
 */
export async function createDmTableWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  dmSeed: BytesLike,
  tableName: string,
  columnNames: string[],
  options: { idColumn?: string | number; extKeys?: string[]; partyA: PublicKey | string; partyB: PublicKey | string }
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))

  const root = pdaRootDyn(programId, rootId)
  const dmTable = pdaDmTableDyn(programId, root, dmSeed)
  const instTable = pdaDmInstructionTableDyn(programId, root, dmSeed)

  const methods = (program as any).methods as Record<string, any>
  const createDm = methods?.create_dm_table ?? methods?.createDmTable
  if (!createDm) {
    throw new Error('Instruction "create_dm_table" not found in IDL')
  }

  const seedBuf = Buffer.from(toBytes(dmSeed))
  const nameBuf = Buffer.from(tableName, 'utf8')
  const colBufs = columnNames.map((s) => Buffer.from(s, 'utf8'))

  const idOpt = options?.idColumn
  const idName =
    typeof idOpt === 'string'
      ? idOpt
      : typeof idOpt === 'number' && columnNames[idOpt]
      ? columnNames[idOpt]
      : columnNames[0]
  if (!idName) throw new Error('idColumn is required to create DM table')
  const idColBuf = Buffer.from(idName, 'utf8')

  const extKeys = options?.extKeys ?? []
  const extKeysBufs = extKeys.map((s) => Buffer.from(String(s), 'utf8'))

  const partyA = typeof options.partyA === 'string' ? new PublicKey(options.partyA) : options.partyA
  const partyB = typeof options.partyB === 'string' ? new PublicKey(options.partyB) : options.partyB

  const tx = await createDm(
    rootIdBuf,
    seedBuf,
    nameBuf,
    colBufs,
    idColBuf,
    extKeysBufs,
    partyA,
    partyB
  )
    .accounts({
      signer,
      root,
      dm_table: dmTable,
      instruction_table: instTable,
      system_program: SystemProgram.programId,
    })
    .transaction()

  return { tx, table: dmTable.toBase58(), instructionTable: instTable.toBase58() }
}

export async function createExtTableWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  tableName: string,
  columnNames: string[],
  options?: { idColumn?: string | number; extKeys?: string[]; gateMint?: PublicKey | string | null }
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))

  const root = pdaRootDyn(programId, rootId)
  const table = pdaExtTableDyn(programId, root, tableName)
  const instTable = pdaExtInstructionTableDyn(programId, root, tableName)

  const methods = (program as any).methods as Record<string, any>
  const createExt = methods?.create_ext_table ?? methods?.createExtTable
  if (!createExt) {
    throw new Error('Instruction "create_ext_table" not found in IDL')
  }

  const tableSeed = deriveSeedBytes(tableName)
  const tableSeedBuf = Buffer.from(tableSeed)
  const nameBuf = Buffer.from(tableName, 'utf8')
  const colBufs = columnNames.map((s) => Buffer.from(s, 'utf8'))

  const idOpt = options?.idColumn
  const idName =
    typeof idOpt === 'string'
      ? idOpt
      : typeof idOpt === 'number' && columnNames[idOpt]
      ? columnNames[idOpt]
      : columnNames[0]
  if (!idName) throw new Error('idColumn is required to create extension table')
  const idColBuf = Buffer.from(idName, 'utf8')

  const extKeys = options?.extKeys ?? []
  const extKeysBufs = extKeys.map((s) => Buffer.from(String(s), 'utf8'))

  const gateMintOpt = options?.gateMint
    ? typeof options.gateMint === 'string'
      ? new PublicKey(options.gateMint)
      : options.gateMint
    : null

  const tx = await createExt(
    rootIdBuf,
    tableSeedBuf,
    nameBuf,
    colBufs,
    idColBuf,
    extKeysBufs,
    gateMintOpt
  )
    .accounts({
      root,
      signer,
      table,
      instruction_table: instTable,
      system_program: SystemProgram.programId,
    })
    .transaction()

  return { tx, table: table.toBase58(), instructionTable: instTable.toBase58() }
}

/**
 * updateTableColumnsWeb
 * - Update a table's column list by name.
 * - options: { idColumn?: string|number; extKeys?: string[] }
 * - Resolves method name dynamically
 */
export async function updateTableColumnsWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  tableName: string,
  columnNames: string[],
  options?: { idColumn?: string | number; extKeys?: string[] }
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))

  const root = pdaRootDyn(programId, rootId)
  const table = pdaTableDyn(programId, root, tableName)

  const methods = (program as any).methods as Record<string, any>
  const upd = methods?.update_table ?? methods?.updateTable
  if (!upd) {
    throw new Error('Instruction "update_table" not found in IDL')
  }

  const tableSeed = deriveSeedBytes(tableName)
  const tableSeedBuf = Buffer.from(tableSeed)
  const nameBuf = Buffer.from(tableName, 'utf8')
  const colBufs = columnNames.map((s) => Buffer.from(s, 'utf8'))
  const idOpt = options?.idColumn
  const idName =
    typeof idOpt === 'string'
      ? idOpt
      : typeof idOpt === 'number' && columnNames[idOpt]
      ? columnNames[idOpt]
      : columnNames[0]
  if (!idName) throw new Error('idColumn is required to update table')
  const idColBuf = Buffer.from(idName, 'utf8')

  const extKeys = options?.extKeys ?? []
  const extKeysBufs = extKeys.map((s) => Buffer.from(String(s), 'utf8'))

  const tx = await upd(rootIdBuf, tableSeedBuf, nameBuf, colBufs, idColBuf, extKeysBufs)
    .accounts({
      root,
      table,
      signer,
    })
    .transaction()

  return { tx, table: table.toBase58() }
}

/**
 * writeRowWeb
 * - Write a JSON row to table and reference TxRef
 */
export async function writeRowWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  tableName: string,
  rowJson: string,
  options?: { signerAta?: PublicKey | string | null }
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const txRef = pdaTxRefDyn(programId, rootId)
  const table = pdaTableDyn(programId, root, tableName)

  const methods = (program as any).methods as Record<string, any>
  const write = methods?.write_data ?? methods?.writeData
  if (!write) {
    throw new Error('Instruction "write_data" not found in IDL')
  }

  const tableSeed = deriveSeedBytes(tableName)
  const tableSeedBuf = Buffer.from(tableSeed)
  const nameBuf = Buffer.from(tableName, 'utf8')
  const signerAta =
    options?.signerAta == null
      ? null
      : typeof options.signerAta === 'string'
      ? new PublicKey(options.signerAta)
      : options.signerAta

  const tx = await write(rootIdBuf, tableSeedBuf, nameBuf, Buffer.from(rowJson, 'utf8'))
    .accounts({
      root,
      table,
      tx_ref: txRef,
      signerAta,
      signer,
    })
    .transaction()

  return { tx }
}

/**
 * writeDmRowWeb
 * - Write a JSON row into a DM table using UseDMTable / write_dm_data.
 */
export async function writeDmRowWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  dmSeed: BytesLike,
  rowJson: string
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const txRef = pdaTxRefDyn(programId, rootId)
  const dmTable = pdaDmTableDyn(programId, root, dmSeed)

  const methods = (program as any).methods as Record<string, any>
  const writeDm = methods?.write_dm_data ?? methods?.writeDmData ?? methods?.useDmTable
  if (!writeDm) {
    throw new Error('Instruction "write_dm_data" not found in IDL')
  }

  const seedBuf = Buffer.from(toBytes(dmSeed))
  const tx = await writeDm(rootIdBuf, seedBuf, Buffer.from(rowJson, 'utf8'))
    .accounts({
      root,
      dm_table: dmTable,
      tx_ref: txRef,
      signer,
    })
    .transaction()

  return { tx }
}

/**
 * pushDbInstructionWeb
 * - Append update/delete instruction row for a given table
 */
export async function pushDbInstructionWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  tableName: string,
  targetTxSig: string,
  contentJson: string,
  options?: { signerAta?: PublicKey | string | null }
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const txRef = pdaTxRefDyn(programId, rootId)
  const targetTxRef = pdaTargetTxRefDyn(programId, rootId)
  const table = pdaTableDyn(programId, root, tableName)
  const instTable = pdaInstructionTableDyn(programId, root, tableName)

  const methods = (program as any).methods as Record<string, any>
  const dbInstr = methods?.database_instruction ?? methods?.databaseInstruction
  if (!dbInstr) {
    throw new Error('Instruction "database_instruction" not found in IDL')
  }

  const tableSeedBytes = deriveSeedBytes(tableName)
  const tableSeedBuf = Buffer.from(tableSeedBytes)
  const tableNameBuf = Buffer.from(tableName, 'utf8')
  const targetSigBuf = Buffer.from(targetTxSig, 'utf8')
  const contentBuf = Buffer.from(contentJson, 'utf8')

  const signerAta =
    options?.signerAta == null
      ? null
      : typeof options.signerAta === 'string'
      ? new PublicKey(options.signerAta)
      : options.signerAta

  const tx = await dbInstr(rootIdBuf, tableSeedBuf, tableNameBuf, targetSigBuf, contentBuf)
    .accounts({
      root,
      table,
      instruction_table: instTable,
      tx_ref: txRef,
      target_tx_ref: targetTxRef,
      signerAta,
      signer,
    })
    .transaction()

  return { tx }
}

/**
 * requestDmWeb
 * - Send a friend request by creating a DM table between two users
 */
export async function requestDmWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  dmSeed: BytesLike,
  tableName: string,
  columnNames: string[],
  friend: PublicKey | string,
  dmBoxPayload: string | Record<string, unknown>,
  options?: { idColumn?: string | number; extKeys?: string[] }
) {
  const program = programFromCtx(ctx)

  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)

  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const dmTable = pdaDmTableDyn(programId, root, dmSeed)
  const instTable = pdaDmInstructionTableDyn(programId, root, dmSeed)

  const friendPubkey = typeof friend === 'string' ? new PublicKey(friend) : friend
  const requesterDmBox = pdaDmListBoxDyn(programId, root, signer)

  const receiverDmBox = pdaDmListBoxDyn(programId, root, friendPubkey)

  const methods = (program as any).methods as Record<string, any>
  const requestDm = methods?.request_dm ?? methods?.requestDm
  if (!requestDm) {
    throw new Error('Instruction "request_dm" not found in IDL')
  }

  const seedBuf = Buffer.from(toBytes(dmSeed))
  const nameBuf = Buffer.from(tableName, 'utf8')
  const colBufs = columnNames.map((s) => Buffer.from(s, 'utf8'))

  const idOpt = options?.idColumn
  const idName =
    typeof idOpt === 'string'
      ? idOpt
      : typeof idOpt === 'number' && columnNames[idOpt]
      ? columnNames[idOpt]
      : columnNames[0]
  if (!idName) throw new Error('idColumn is required to request DM')
  const idColBuf = Buffer.from(idName, 'utf8')

  const extKeys = options?.extKeys ?? []
  const extKeysBufs = extKeys.map((s) => Buffer.from(String(s), 'utf8'))

  const payloadValue =
    typeof dmBoxPayload === 'string'
      ? (() => {
          try {
            return JSON.parse(dmBoxPayload)
          } catch {
            return { message: dmBoxPayload }
          }
        })()
      : dmBoxPayload ?? {}

  const payloadBuf = Buffer.from(
    JSON.stringify({ dmTable: dmTable.toBase58(), ...payloadValue }),
    'utf8'
  )
  const tx = await requestDm(
      rootIdBuf,
      seedBuf,
      friendPubkey,
      nameBuf,
      colBufs,
      idColBuf,
      extKeysBufs,
      payloadBuf
  ).accounts({
      requester: signer,
      root:root,
      dm_table: dmTable,
      instruction_table: instTable,
      requester_dm_box: requesterDmBox,
      receiver_dm_box: receiverDmBox,
      system_program: SystemProgram.programId,
    })
    .transaction()


  const firstIx = tx.instructions[0]
  if (firstIx) {
    console.log(
      '[requestDmWeb] ix accounts',
      firstIx.keys.map((key: (typeof firstIx.keys)[number]) => key.pubkey.toBase58())
    )
  }
  console.log('[requestDmWeb] programId', programId.toBase58())
  console.log('[requestDmWeb] rootPda', root.toBase58())


  return { tx, dmTable: dmTable.toBase58(), instructionTable: instTable.toBase58() }
}

/**
 * manageDmWeb
 * - Update DM status (approve, block, etc.)
 */
export async function manageDmWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  dmSeed: BytesLike,
  newStatus: number
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const dmTable = pdaDmTableDyn(programId, root, dmSeed)

  const methods = (program as any).methods as Record<string, any>
  const manageDm = methods?.manage_dm ?? methods?.manageDm
  if (!manageDm) {
    throw new Error('Instruction "manage_dm" not found in IDL')
  }

  const seedBuf = Buffer.from(toBytes(dmSeed))

  const tx = await manageDm(rootIdBuf, seedBuf, newStatus)
    .accounts({
      root,
      dm_table: dmTable,
      signer,
    })
    .transaction()

  return { tx, dmTable: dmTable.toBase58() }
}

/**
 * pdaUserDyn
 * - User account PDA helper for writer functions
 */
function pdaUserDyn(programId: PublicKey, rootId: BytesLike, user: PublicKey) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.userSeed),
      programId.toBuffer(),
      root.toBuffer(),
      user.toBuffer(),
    ],
    programId
  )[0]
}

/**
 * updateUserMetadataWeb
 * - Update user profile metadata (name, bio, profile picture)
 * - Uses init_if_needed so user account is auto-created
 */
export async function updateUserMetadataWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  metadata: string
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const user = pdaUserDyn(programId, rootId, signer)

  const methods = (program as any).methods as Record<string, any>
  const updateUserMetadata = methods?.update_user_metadata ?? methods?.updateUserMetadata
  if (!updateUserMetadata) {
    throw new Error('Instruction "update_user_metadata" not found in IDL')
  }

  const metadataBytes = Buffer.from(metadata, 'utf8')

  const tx = await updateUserMetadata(rootIdBuf, metadataBytes)
    .accounts({
      user,
      root,
      signer,
      system_program: SystemProgram.programId,
    })
    .transaction()

  return { tx, user: user.toBase58() }
}

/**
 * createAdminTableWeb
 * - Create an admin table (like userlist for storing all user pubkeys)
 * - Similar to createExtTableWeb but uses create_admin_table instruction
 */
export async function createAdminTableWeb<T extends Idl>(
  ctx: WriterCtx<T>,
  rootId: BytesLike,
  tableName: string,
  columns: string[],
  idColumn: string = 'id',
  gateMintOpt?: string
) {
  const program = programFromCtx(ctx)
  const signer = program.provider.publicKey!
  const programId = programPkFromCtx(ctx)
  const rootIdBuf = Buffer.from(rootIdToBytes(rootId))
  const root = pdaRootDyn(programId, rootId)
  const tableSeed = deriveSeedBytes(tableName)
  const table = pdaExtTableDyn(programId, root, tableName)
  const instrTable = pdaInstructionTableDyn(programId, root, tableName)

  const methods = (program as any).methods as Record<string, any>
  const createAdminTable = methods?.create_admin_table ?? methods?.createAdminTable
  if (!createAdminTable) {
    throw new Error('Instruction "create_admin_table" not found in IDL')
  }

  const tableNameBytes = Buffer.from(tableName, 'utf8')
  const columnBytes = columns.map((col) => Buffer.from(col, 'utf8'))
  const idColBytes = Buffer.from(idColumn, 'utf8')
  const extKeys: Buffer[] = []
  const mint = gateMintOpt ? new PublicKey(gateMintOpt) : null

  const tx = await createAdminTable(
    rootIdBuf,
    tableSeed,
    tableNameBytes,
    columnBytes,
    idColBytes,
    extKeys,
    mint
  )
    .accounts({
      root,
      table,
      instruction_table: instrTable,
      signer,
      system_program: SystemProgram.programId,
    })
    .transaction()

  return { tx, table: table.toBase58(), instructionTable: instrTable.toBase58() }
}
