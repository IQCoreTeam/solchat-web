// src/Lprovider/pdaprovider.ts
import { PublicKey } from "@solana/web3.js";
import { configs } from "../configs";
import { deriveSeedBytes, rootIdToBytes, toBytes, type BytesLike } from "../core/seed";

const PROGRAM_ID = new PublicKey(configs.programId);

function tableSeedBytes(input: string | BytesLike) {
  return typeof input === "string" ? deriveSeedBytes(input) : toBytes(input);
}

function dmSeedBytes(input: BytesLike) {
  return toBytes(input);
}

export function pdaRoot(rootId: BytesLike) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.rootSeed), PROGRAM_ID.toBuffer(), rootBytes],
    PROGRAM_ID
  )[0];
}

export function pdaTxRef(rootId: BytesLike) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId));
  return PublicKey.findProgramAddressSync(
    [Buffer.from(configs.txRefSeed), PROGRAM_ID.toBuffer(), rootBytes],
    PROGRAM_ID
  )[0];
}

export function pdaTargetTxRef(rootId: BytesLike) {
  const rootBytes = Buffer.from(rootIdToBytes(rootId));
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.txRefSeed),
      PROGRAM_ID.toBuffer(),
      rootBytes,
      Buffer.from(configs.targetSeed),
    ],
    PROGRAM_ID
  )[0];
}

export function pdaTable(root: PublicKey, tableNameOrSeed: string | BytesLike) {
  const tableSeed = tableSeedBytes(tableNameOrSeed);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      Buffer.from(tableSeed),
    ],
    PROGRAM_ID
  )[0];
}

export function pdaInstructionTable(root: PublicKey, tableNameOrSeed: string | BytesLike) {
  const tableSeed = tableSeedBytes(tableNameOrSeed);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      Buffer.from(tableSeed),
      Buffer.from(configs.instructionSeed),
    ],
    PROGRAM_ID
  )[0];
}

export function pdaDmTable(root: PublicKey, dmSeed: BytesLike) {
  const seed = dmSeedBytes(dmSeed);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmTableSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      Buffer.from(seed),
    ],
    PROGRAM_ID
  )[0];
}

export function pdaDmInstructionTable(root: PublicKey, dmSeed: BytesLike) {
  const seed = dmSeedBytes(dmSeed);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmTableSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      Buffer.from(seed),
      Buffer.from(configs.instructionSeed),
    ],
    PROGRAM_ID
  )[0];
}

/**
 * pdaExternalRecord
 *  tableSeed, PROGRAM_ID, root, baseTableName, idValue, extTableName
 */
export function pdaExternalRecord(
  root: PublicKey,
  baseTableSeed: Uint8Array,
  idValueBytes: Uint8Array,
  extTableSeed: Uint8Array
) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      Buffer.from(baseTableSeed),
      Buffer.from(idValueBytes),
      Buffer.from(extTableSeed),
    ],
    PROGRAM_ID
  )[0];
}

/**
 * pdaExternalRecordFromStrings
 */
export function pdaExternalRecordFromStrings(
  root: PublicKey,
  baseTableName: string,
  idValue: string,
  extTableName: string
) {
  const baseSeed = deriveSeedBytes(baseTableName);
  const extSeed = deriveSeedBytes(extTableName);
  return pdaExternalRecord(
    root,
    baseSeed,
    Buffer.from(idValue, "utf8"),
    extSeed
  );
}

export function pdaExtTable(root: PublicKey, tableNameOrSeed: string | BytesLike) {
  const tableSeed = tableSeedBytes(tableNameOrSeed);
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.tableSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      Buffer.from(tableSeed),
    ],
    PROGRAM_ID
  )[0];
}

/**
 * pdaDmListBox
 * - DM list box PDA for a specific user
 */
export function pdaDmListBox(root: PublicKey, user: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from(configs.dmListSeed),
      PROGRAM_ID.toBuffer(),
      root.toBuffer(),
      user.toBuffer(),
    ],
    PROGRAM_ID
  )[0];
}
