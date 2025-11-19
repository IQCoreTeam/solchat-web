// src/Lprovider/pdaprovider.ts
import { PublicKey } from '@solana/web3.js'
import { configs } from '../configs'
import { deriveSeedBytes, rootIdToBytes, toBytes, type BytesLike } from '../core/seed'

function resolveProgramId(programId?: PublicKey | string) {
  if (!programId) {
    return new PublicKey(configs.programId)
  }
  if (programId instanceof PublicKey) {
    return programId
  }
  return new PublicKey(programId)
}

function tableSeedBytes(input: string | BytesLike) {
  return typeof input === 'string' ? deriveSeedBytes(input) : toBytes(input)
}

function dmSeedBytes(input: BytesLike) {
  return toBytes(input)
}

export function pdaRoot(rootId: BytesLike, programId?: PublicKey | string) {
  const programPk = resolveProgramId(programId)
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.rootSeed), programPk.toBuffer(), rootBytes],
    programPk
  )[0]
}

export function pdaTxRef(rootId: BytesLike, programId?: PublicKey | string) {
  const programPk = resolveProgramId(programId)
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.txRefSeed), programPk.toBuffer(), rootBytes],
    programPk
  )[0]
}

export function pdaTargetTxRef(rootId: BytesLike, programId?: PublicKey | string) {
  const programPk = resolveProgramId(programId)
  const rootBytes = Buffer.from(rootIdToBytes(rootId))
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.txRefSeed),
      programPk.toBuffer(),
      rootBytes,
      Buffer.from(configs.targetSeed),
    ],
    programPk
  )[0]
}

export function pdaTable(
  root: PublicKey,
  tableNameOrSeed: string | BytesLike,
  programId?: PublicKey | string
) {
  const programPk = resolveProgramId(programId)
  const tableSeed = tableSeedBytes(tableNameOrSeed)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      Buffer.from(tableSeed),
    ],
    programPk
  )[0]
}

export function pdaInstructionTable(
  root: PublicKey,
  tableNameOrSeed: string | BytesLike,
  programId?: PublicKey | string
) {
  const programPk = resolveProgramId(programId)
  const tableSeed = tableSeedBytes(tableNameOrSeed)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      Buffer.from(tableSeed),
      Buffer.from(configs.instructionSeed),
    ],
    programPk
  )[0]
}

export function pdaDmTable(root: PublicKey, dmSeed: BytesLike, programId?: PublicKey | string) {
  const programPk = resolveProgramId(programId)
  const seed = dmSeedBytes(dmSeed)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmTableSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      Buffer.from(seed),
    ],
    programPk
  )[0]
}

export function pdaDmInstructionTable(
  root: PublicKey,
  dmSeed: BytesLike,
  programId?: PublicKey | string
) {
  const programPk = resolveProgramId(programId)
  const seed = dmSeedBytes(dmSeed)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmTableSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      Buffer.from(seed),
      Buffer.from(configs.instructionSeed),
    ],
    programPk
  )[0]
}

/**
 * pdaExternalRecord
 *  tableSeed, PROGRAM_ID, root, baseTableName, idValue, extTableName
 */
export function pdaExternalRecord(
  root: PublicKey,
  baseTableSeed: Uint8Array,
  idValueBytes: Uint8Array,
  extTableSeed: Uint8Array,
  programId?: PublicKey | string
) {
  const programPk = resolveProgramId(programId)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      Buffer.from(baseTableSeed),
      Buffer.from(idValueBytes),
      Buffer.from(extTableSeed),
    ],
    programPk
  )[0]
}

/**
 * pdaExternalRecordFromStrings
 */
export function pdaExternalRecordFromStrings(
  root: PublicKey,
  baseTableName: string,
  idValue: string,
  extTableName: string,
  programId?: PublicKey | string
) {
  const baseSeed = deriveSeedBytes(baseTableName)
  const extSeed = deriveSeedBytes(extTableName)
  return pdaExternalRecord(
    root,
    baseSeed,
    Buffer.from(idValue, "utf8"),
    extSeed,
    programId
  )
}

export function pdaExtTable(
  root: PublicKey,
  tableNameOrSeed: string | BytesLike,
  programId?: PublicKey | string
) {
  const programPk = resolveProgramId(programId)
  const tableSeed = tableSeedBytes(tableNameOrSeed)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      Buffer.from(tableSeed),
    ],
    programPk
  )[0]
}

/**
 * pdaDmListBox
 * - DM list box PDA for a specific user
 */
export function pdaDmListBox(root: PublicKey, user: PublicKey, programId?: PublicKey | string) {
  const programPk = resolveProgramId(programId)
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmListSeed),
      programPk.toBuffer(),
      root.toBuffer(),
      user.toBuffer(),
    ],
    programPk
  )[0]
}
