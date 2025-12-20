// onchainDB public API for web usage
// - Keep inputs simple (strings, numbers) and outputs JSON-friendly
// - Re-export PDA utilities and configs for low-level usage

export { configs } from './configs'

// Import locally so we can use them in this module (e.g., inside getPdas)
import { pdaRoot, pdaTxRef, pdaTargetTxRef, pdaTable, pdaInstructionTable, pdaExternalRecord, pdaExternalRecordFromStrings, pdaExtTable, pdaDmTable, pdaDmInstructionTable, pdaDmListBox, pdaUser } from './provider/pda.provider'
export { pdaRoot, pdaTxRef, pdaTargetTxRef, pdaTable, pdaInstructionTable, pdaExternalRecord, pdaExternalRecordFromStrings, pdaExtTable, pdaDmTable, pdaDmInstructionTable, pdaDmListBox, pdaUser }

// Web reader API (UI-friendly) - using cached versions
export type { ReaderParams, ReaderResult } from './web/reader'
export type { Row } from './web/cached-reader-integration'
export { readRecentRows, readTableMeta, readDmTableMeta } from './web/reader'
export { readRowsByTable, readRowsByDmSeed, invalidateRoomCache, invalidateDmCache } from './web/cached-reader-integration'
export type { BytesLike } from './core/seed'

// Web writer API (wallet-adapter + Anchor Program)
export type { WriterCtx } from './web/writer'
export {
  initializeRootWeb,
  createTableWeb,
  createExtTableWeb,
  createAdminTableWeb,
  createDmTableWeb,
  updateTableColumnsWeb,
  updateUserMetadataWeb,
  writeRowWeb,
  writeDmRowWeb,
  pushDbInstructionWeb,
  requestDmWeb,
  manageDmWeb,
} from './web/writer'

// Low-level helper exports (optional)
export { getAnchorProvider, getProgram } from './web/provider'

// Convenience helpers (pure)
import { PublicKey } from '@solana/web3.js'
import type { BytesLike } from './core/seed'

/**
 * getPdas
 * - Return PDAs for a given database root id + user signer
 * - Useful for debugging, devtools, and low-level integrations
 */
export function getPdas(params: { rootId: BytesLike; userPublicKey: string }) {
  const { rootId, userPublicKey } = params
  const user = new PublicKey(userPublicKey)
  return {
    root: pdaRoot(rootId).toBase58(),
    txRef: pdaTxRef(rootId).toBase58(),
    targetTxRef: pdaTargetTxRef(rootId).toBase58(),
  }
}
