// Web-friendly Reader API (shape and types for UI usage)
// Keep inputs simple (strings, numbers). Return serialized JSON-friendly results.
'use client'
import * as anchor from '@coral-xyz/anchor'
import type { Idl } from '@coral-xyz/anchor'
import { Connection, PublicKey, ParsedTransactionWithMeta, ConfirmedSignatureInfo, VersionedTransactionResponse } from '@solana/web3.js'
import bs58 from 'bs58'
import { Buffer } from 'buffer'
import { configs } from '../configs'
import { deriveSeedHex, rootIdToBytes, toBytes, type BytesLike } from '../core/seed'
import { pdaRoot, pdaTable, pdaTxRef, pdaInstructionTable, pdaDmTable, pdaDmInstructionTable } from '../provider/pda.provider'
import { getRpcThrottle } from './rpc-throttle'
import {
  getCachedSignaturesPaginated as getCachedSignatures,
  getCachedTransaction,
  getCachedAccountInfo,
  clearTransactionCache,
  invalidateSignatureCache,
} from '@/lib/rpc/cache'

export type Row = Record<string, any>

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Re-export cache utilities
export { clearTransactionCache, invalidateSignatureCache }

export type ReaderParams = {
  // Optional externally-provided connection; falls back to configs.network
  connection?: Connection
  // RPC endpoint to use when no connection is provided
  endpoint?: string
  // Required: user public key in base58
  userPublicKey: string
  // Required: database root identifier (string/bytes, <=32 bytes on-chain)
  rootId: BytesLike
  // Optional: program id override (base58)
  programId?: string
  // Optional IDL to decode accounts/instructions on web
  idl?: Idl
  // Optional limits for scanning
  maxTx?: number
  perTableLimit?: number
  // Allow loose JSON recovery when payloads are malformed
  looseJson?: boolean
}

export type ReaderResult = {
  // PDAs used during read
  meta: {
    rootPda: string
    txRefPda: string
    programId: string
    endpoint: string
  }
  // Table identifiers (seed hex strings)
  tableNames: string[]
  tableDisplayNames: Record<string, string>
  // Tables meta (columns, id/ext info and PDA strings)
  tables: Record<
    string,
    {
      name: string
      columns: string[]
      idColumn?: string | number | null
      extTableName?: string | null
      extKeys?: string[]
      tablePda: string
      instPda: string | null
    }
  >
  // Rows keyed by table
  rowsByTable: Record<string, Row[]>
}

/**
 * readRecentRows
 * - Web-facing reader entry.
 * - Keeps inputs simple and returns JSON-serializable output.
 * - Implementation TODO: decode program-specific instructions using IDL (client-provided)
 *   and scan TxRef PDA signatures similar to core/reader logic.
 */
// Web reader API - scan recent txs for TxRef PDA and decode using IDL

const toStr = (u8: any) => {
  try {
    if (typeof u8 === 'string') return u8
    const bytes = toU8(u8)
    if (bytes.length === 0) return ''
    try {
      return new TextDecoder().decode(bytes).replace(/\0+$/, '')
    } catch {
      // fall through to hex representation
    }
    return Buffer.from(bytes).toString('hex')
  } catch {
    return Buffer.from(toU8(u8)).toString('hex')
  }
}
const toU8 = (x: any): Uint8Array => {
  if (x instanceof Uint8Array) return x
  if (Array.isArray(x)) return new Uint8Array(x)
  if (x?.data) return new Uint8Array(x.data)
  return new Uint8Array()
}
const toHex = (x: any): string => Buffer.from(toU8(x)).toString('hex')

function makeAccountsCoder(idl: Idl) {
  return new anchor.BorshAccountsCoder(idl)
}
function makeIxCoder(idl: Idl) {
  return new anchor.BorshInstructionCoder(idl)
}

async function fetchAndDecode<T = any>(
  connection: Connection,
  coder: anchor.BorshAccountsCoder,
  pubkey: PublicKey,
  accountName: 'Root' | 'Table' | 'TxRef' | 'InstructionTable' | 'DMTable'
): Promise<T | null> {
  const info = await getCachedAccountInfo(connection, pubkey)
  if (!info) return null
  return coder.decode(accountName, info.data) as T
}

async function readTableListFromRoot(
  connection: Connection,
  idl: Idl,
  rootId: BytesLike
) {
  const accCoder = makeAccountsCoder(idl)
  const rootPda = pdaRoot(rootId)
  const root = await fetchAndDecode<any>(connection, accCoder, rootPda, 'Root')
  if (!root) {
    return {
      rootPda,
      creator: null as string | null,
      tableSeeds: [] as string[],
      globalTableSeeds: [] as string[],
    }
  }
  const creator = new PublicKey(root.creator).toBase58()
  const rawTableSeeds = (root.table_seeds ?? root.tableSeeds ?? root.table_names ?? []) as any[]
  const rawGlobalSeeds = (root.global_table_seeds ?? root.globalTableSeeds ?? root.global_table_names ?? []) as any[]
  const tableSeeds = rawTableSeeds.map((v) => toHex(v))
  const globalTableSeeds = rawGlobalSeeds.map((v) => toHex(v))
  return { rootPda, creator, tableSeeds, globalTableSeeds }
}

// getSignaturesFor replaced by getCachedSignatures above

function decodeAllIxsFromTx(
  tx: ParsedTransactionWithMeta | VersionedTransactionResponse,
  programIdB58: string,
  ixCoder: anchor.BorshInstructionCoder
) {
  const msg = tx.transaction?.message as any
  // Handle both ParsedTransactionWithMeta (accountKeys) and VersionedTransactionResponse (staticAccountKeys)
  const accKeys = msg?.accountKeys ?? msg?.staticAccountKeys ?? []
  const out: { name: string; data: any }[] = []

  // Handle both instruction formats: instructions (parsed) and compiledInstructions (versioned)
  const outer = msg?.instructions ?? msg?.compiledInstructions ?? []
  const innerGroups = tx.meta?.innerInstructions ?? []

  const decodeList = (list: any[]) => {
    for (const ix of list) {
      const pidIndex = (ix as any).programIdIndex
      const pid = pidIndex != null ? (accKeys[pidIndex]?.pubkey || accKeys[pidIndex]) : (ix as any).programId
      const pidB58 = typeof (pid as any)?.toBase58 === 'function' ? (pid as any).toBase58() : String(pid)
      if (pidB58 !== programIdB58) continue
      const data = (ix as any).data
      if (!data) continue
      try {
        const decoded = ixCoder.decode(typeof data === 'string' ? data : bs58.encode(toU8(data)), 'base58')
        if (decoded) out.push(decoded)
      } catch {
        // skip
      }
    }
  }

  decodeList(outer)
  if (out.length === 0 && innerGroups.length) {
    decodeList(innerGroups.flatMap((g: any) => g.instructions ?? []))
  }

  return out
}

function parsePayloadJson(raw: string, allowLoose = false): Row {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as Row
  } catch {
    if (!allowLoose) {
      return { value: raw }
    }
  }
  // loose fallback: basic replace of single quotes/keys for legacy data
  let normalized = trimmed.replace(/'([^']*)'/g, (_m, g1) => `"${g1}"`).replace(/(\w+)\s*:/g, `"$1":`)
  try {
    return JSON.parse(normalized)
  } catch {
    try {
      const fixed = normalized.replace(/(\{|,)\s*([A-Za-z0-9_]+)\s*:/g, `$1 "$2":`)
      return JSON.parse(fixed)
    } catch {
      return { value: raw }
    }
  }
}

function entriesToRow(entries: any[]): Row {
  const out: Row = {}
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const column =
      (entry as any).column ??
      (entry as any).col ??
      (entry as any).key ??
      (entry as any).name ??
      null
    if (!column) continue
    const data =
      (entry as any).data ??
      (entry as any).value ??
      (entry as any).val ??
      (entry as any).dataJson ??
      (entry as any).data_json ??
      null
    out[String(column)] = data
  }
  return out
}

function parseInstructionContent(raw: string, allowLoose = false): Row {
  const input = raw ?? ''
  const trimmed = input.trim()
  if (!trimmed) return { __delete: true }
  if (/^\s*\[/.test(trimmed)) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return entriesToRow(parsed)
      }
    } catch {
      // ignore, fall through
    }
  }
  const loose = parsePayloadJson(input, allowLoose)
  if (loose && typeof loose === 'object') {
    if (Array.isArray((loose as any).updates)) {
      return entriesToRow((loose as any).updates)
    }
    if (Array.isArray((loose as any).rows)) {
      return entriesToRow((loose as any).rows)
    }
    if (Array.isArray((loose as any).data)) {
      return entriesToRow((loose as any).data)
    }
  }
  return loose
}

/**
 * readRecentRows
 * - Web-friendly reader entry: returns JSON result.
 */
export async function readRecentRows(params: ReaderParams): Promise<ReaderResult> {
  const endpoint = params.endpoint || configs.network
  const connection = params.connection || new Connection(endpoint, 'confirmed')
  const programIdStr = params.programId || configs.programId
  const rootIdBytes = rootIdToBytes(params.rootId)
  const idl = params.idl

  // Compute PDAs (always safe on web)
  const root = pdaRoot(rootIdBytes)
  const txRef = pdaTxRef(rootIdBytes)

  // If no IDL, return metadata only (tables/rows empty)
  if (!idl) {
    return {
      meta: {
        rootPda: root.toBase58(),
        txRefPda: txRef.toBase58(),
        programId: programIdStr,
        endpoint,
      },
      tableNames: [],
      tableDisplayNames: {},
      tables: {},
      rowsByTable: {},
    }
  }

  // With IDL: read table list from root and build tables metadata
  const { tableSeeds } = await readTableListFromRoot(connection, idl, rootIdBytes)
  const accCoder = makeAccountsCoder(idl)
  const tables: ReaderResult['tables'] = {}
  const tableDisplayNames: Record<string, string> = {}

  if (tableSeeds.length === 0) {
    return {
      meta: {
        rootPda: root.toBase58(),
        txRefPda: txRef.toBase58(),
        programId: programIdStr,
        endpoint,
      },
      tableNames: [],
      tableDisplayNames: {},
      tables: {},
      rowsByTable: {},
    }
  }

  // Pre-compute all PDAs and batch fetch table accounts
  const seedsWithPdas = tableSeeds.map((seedHex) => ({
    seedHex,
    tablePda: pdaTable(root, seedHex),
    instPda: pdaInstructionTable(root, seedHex),
  }))

  const tablePdas = seedsWithPdas.map((s) => s.tablePda)
  const tableAccountInfos = await connection.getMultipleAccountsInfo(tablePdas)

  for (let i = 0; i < seedsWithPdas.length; i++) {
    const { seedHex, tablePda, instPda } = seedsWithPdas[i]
    const tableInfo = tableAccountInfos[i]
    let columns: string[] = []
    let idColumn: string | number | null | undefined = undefined
    let extTableName: string | null | undefined = undefined
    let extKeys: string[] = []
    let displayName = seedHex

    try {
      const tableAcc = tableInfo ? accCoder.decode('Table', tableInfo.data) as any : null
      if (tableAcc) {
        displayName = toStr(tableAcc.name ?? tableAcc.table_name ?? seedHex)
        columns = (tableAcc.column_names ?? tableAcc.columns ?? []).map((v: any) => toStr(v))
        // idColumn: try multiple keys, accept string or number
        const idRaw =
          tableAcc.id_column ??
          tableAcc.idColumn ??
          tableAcc.id_index ??
          tableAcc.idIndex ??
          null
        if (typeof idRaw === 'string') {
          idColumn = idRaw
        } else if (typeof idRaw === 'number') {
          idColumn = idRaw
        } else if (idRaw && typeof idRaw === 'object') {
          // bytes → string
          const s = toStr(idRaw)
          idColumn = s || null
        } else {
          idColumn = null
        }
        // extTableName: try multiple keys and cast to string
        const extRaw = tableAcc.ext_table_name ?? tableAcc.extTableName ?? null
        extTableName = extRaw != null ? toStr(extRaw) : null
        const extKeysRaw = (tableAcc.ext_keys ?? tableAcc.extKeys ?? []) as any[]
        if (Array.isArray(extKeysRaw)) {
          extKeys = extKeysRaw.map((v) => toStr(v))
        }
      }
    } catch {
      // best-effort
    }

    // default: first column as id if not provided
    if ((idColumn == null || idColumn === '') && columns.length > 0) {
      idColumn = columns[0]
    }

    tableDisplayNames[seedHex] = displayName
    tables[seedHex] = {
      name: displayName,
      columns,
      idColumn,
      extTableName,
      extKeys,
      tablePda: tablePda.toBase58(),
      instPda: instPda ? instPda.toBase58() : null,
    }
  }

  return {
    meta: {
      rootPda: root.toBase58(),
      txRefPda: txRef.toBase58(),
      programId: programIdStr,
      endpoint,
    },
    tableNames: tableSeeds,
    tableDisplayNames,
    tables,
    rowsByTable: {}, // rows are fetched on-demand per table
  }
}

/**
 * readRowsByTable
 * - 지정한 테이블 이름의 로우만 스캔/디코딩해서 반환
 */
export async function readRowsByTable(
  params: ReaderParams & {
    tableName: string
    onProgress?: (rows: Row[]) => void
    knownSignatures?: Set<string> | string[]
    signatures?: string[]
  }
): Promise<Row[]> {
  const endpoint = params.endpoint || configs.network
  const connection = params.connection || new Connection(endpoint, 'confirmed')
  const programIdStr = params.programId || configs.programId
  const rootIdBytes = rootIdToBytes(params.rootId)
  const idl = params.idl
  const tableName = params.tableName
  const maxTx = params.maxTx || 100
  const requestedSignatures = params.signatures || []
  const perTableLimit = params.perTableLimit

  if (!idl) return []

  let idColumnName: string | undefined

  const normalizeRow = (input: Row): Row => {
    if (!input || typeof input !== 'object') return input
    const clone: Row = { ...input }
    if (idColumnName && Object.prototype.hasOwnProperty.call(clone, idColumnName)) {
      try {
        Object.defineProperty(clone, '__rowId', {
          value: (clone as any)[idColumnName],
          enumerable: false,
          configurable: true,
          writable: true,
        })
      } catch {
        ; (clone as any).__rowId = (clone as any)[idColumnName]
      }
    }
    return clone
  }

  // fetch meta for id/ext info
  try {
    const meta = await readTableMeta({ ...params, connection })
    if (typeof meta.idColumn === 'string') {
      idColumnName = meta.idColumn
    } else if (typeof meta.idColumn === 'number' && meta.columns?.[meta.idColumn]) {
      idColumnName = meta.columns[meta.idColumn]
    }
    if (!idColumnName && meta.columns && meta.columns.length > 0) {
      idColumnName = meta.columns[0]
    }
  } catch {
    // ignore, best-effort
  }

  // Derive PDAs (pure computation, no network read)
  const rootPda = pdaRoot(rootIdBytes)
  const tablePda = pdaTable(rootPda, tableName)
  const targetSeedHex = deriveSeedHex(tableName)

  // Scan signatures touching both table PDA and instruction PDA (if present)
  const ixCoder = makeIxCoder(idl)
  const programId = new PublicKey(programIdStr)
  const programIdB58 = programId.toBase58()

  const rpcEndpoint = (connection as any)?._rpcEndpoint || endpoint
  const knownSigSet = params.knownSignatures
    ? new Set(Array.from(params.knownSignatures))
    : new Set<string>()

  const emitProgress = (rows: Row[]) => {
    if (!params.onProgress) return
    const limited = perTableLimit ? rows.slice(0, perTableLimit) : rows
    params.onProgress(limited)
  }

  {
    const sigsAll =
      requestedSignatures.length > 0
        ? requestedSignatures.map((s) => ({ signature: s } as ConfirmedSignatureInfo))
        : await getCachedSignatures(connection, tablePda, maxTx)
    const sigs = sigsAll.filter((s) => !knownSigSet.has(s.signature))
    const instructionMap = new Map<string, Row>()
    const writeRowBase = new Map<string, Row>()
    const rowMap = new Map<string, Row>()
    const throttle = getRpcThrottle(rpcEndpoint)

    const shouldDeleteLocal = (override: Row | undefined): boolean => {
      if (!override || typeof override !== 'object') return false
      const lower = (val: any) => (typeof val === 'string' ? val.toLowerCase() : '')
      if (
        override.delete === true ||
        override.deleted === true ||
        (override as any).__delete === true ||
        lower((override as any).action) === 'delete' ||
        lower((override as any).mode) === 'delete' ||
        lower((override as any).op) === 'delete' ||
        lower((override as any).type) === 'delete' ||
        lower((override as any).status) === 'deleted'
      ) {
        return true
      }
      return false
    }

    const applyInstruction = (baseRow: Row, override: Row | undefined): Row | null => {
      if (!override) return baseRow
      if (shouldDeleteLocal(override as Row)) return null

      const baseClone: Row = baseRow && typeof baseRow === 'object' ? { ...baseRow } : {}
      const baseRowId = (baseRow as any)?.__rowId
      if (baseRowId !== undefined) {
        try {
          Object.defineProperty(baseClone, '__rowId', {
            value: baseRowId,
            enumerable: false,
            configurable: true,
            writable: true,
          })
        } catch {
          ; (baseClone as any).__rowId = baseRowId
        }
      }

      if (typeof override !== 'object') {
        if (override == null) {
          return normalizeRow(baseClone)
        }
        baseClone.value = override
        return normalizeRow(baseClone)
      }

      if (Array.isArray(override.entries)) {
        const merged = entriesToRow(override.entries)
        return normalizeRow({ ...baseClone, ...merged })
      }

      const baseRowKeys = Object.keys(baseRow ?? {})
      const overrideKeys = Object.keys(override ?? {})
      const ordered = Array.from(new Set([...baseRowKeys, ...overrideKeys]))

      for (const key of ordered) {
        const baseVal = (baseRow as any)?.[key]
        const overrideVal = (override as any)?.[key]

        if (overrideVal === undefined) {
          if (baseVal !== undefined) baseClone[key] = baseVal
        } else if (overrideVal === null) {
          delete (baseClone as any)[key]
        } else {
          baseClone[key] = overrideVal
        }
      }

      if (idColumnName) {
        const overrideId = Object.prototype.hasOwnProperty.call(override, idColumnName)
          ? (override as any)[idColumnName]
          : undefined
        if (overrideId !== undefined && overrideId !== null) {
          baseClone[idColumnName] = overrideId
        } else if ((baseClone as any)[idColumnName] == null && (baseRow as any)?.[idColumnName] != null) {
          baseClone[idColumnName] = (baseRow as any)[idColumnName]
        }
        const refreshedId = (baseClone as any)[idColumnName]
        if (refreshedId !== undefined) {
          try {
            Object.defineProperty(baseClone, '__rowId', {
              value: refreshedId,
              enumerable: false,
              configurable: true,
              writable: true,
            })
          } catch {
            ; (baseClone as any).__rowId = refreshedId
          }
        }
      }
      return normalizeRow(baseClone)
    }

    const attachHiddenMeta = (row: Row, signature: string): Row => {
      if (!row || typeof row !== 'object') return row
      const clone: Row = { ...row }
      const defineHidden = (key: string, value: string) => {
        try {
          Object.defineProperty(clone, key, {
            value,
            enumerable: false,
            configurable: false,
            writable: false,
          })
        } catch {
          ; (clone as any)[key] = value
        }
      }
      defineHidden('__txSignature', signature)
      defineHidden('__tableSeed', targetSeedHex)
      return clone
    }

    const applyAndEmit = (signature: string) => {
      const base = writeRowBase.get(signature)
      if (!base) return
      const override = instructionMap.get(signature)
      const applied = applyInstruction(base, override)
      if (!applied) {
        rowMap.delete(signature)
      } else {
        rowMap.set(signature, attachHiddenMeta(applied, signature))
      }
      const sorted = Array.from(rowMap.values()).sort(
        (a, b) => ((a as any).timestamp ?? 0) - ((b as any).timestamp ?? 0)
      )
      emitProgress(sorted)
    }

    const processTx = (tx: ParsedTransactionWithMeta | null, signature: string) => {
      if (!tx) return
      const decoded = decodeAllIxsFromTx(tx as any, programIdB58, ixCoder)
      for (const d of decoded) {
        try {
          if (d.name === 'write_data') {
            const seedHex = toHex(d.data.table_seed ?? d.data[0])
            if (seedHex !== targetSeedHex) continue
            const payloadStr = toStr(d.data.row_json_tx ?? d.data.rowJsonTx ?? d.data[1])
            const normalized = normalizeRow(parsePayloadJson(payloadStr, params.looseJson))
            writeRowBase.set(signature, normalized)
            applyAndEmit(signature)
          } else if (d.name === 'database_instruction') {
            const seedHex = toHex(d.data.table_seed ?? d.data[0])
            if (seedHex !== targetSeedHex) continue
            const targetSig = toStr(d.data.target_tx ?? d.data[1])
            if (!targetSig) continue
            const contentStr = toStr(d.data.contentJsonTx ?? d.data.content_json_tx ?? d.data[3])
            instructionMap.set(targetSig, parseInstructionContent(contentStr, params.looseJson))
            applyAndEmit(targetSig)
          }
        } catch {
          // skip decode errors
        }
      }
    }

    // Batch fetch transactions in groups with caching to reduce RPC calls
    const batchSize = throttle.batchSize > 0 ? throttle.batchSize : 10
    for (let i = 0; i < sigs.length; i += batchSize) {
      const batch = sigs.slice(i, i + batchSize)
      const txPromises = batch.map((sig) => getCachedTransaction(connection, sig.signature))
      const txResults = await Promise.all(txPromises)

      let hadNetworkRequest = false
      for (let j = 0; j < batch.length; j++) {
        const result = txResults[j]
        if (!result.fromCache) hadNetworkRequest = true
        processTx(result.tx as ParsedTransactionWithMeta | null, batch[j].signature)
      }

      // Only throttle between batches if we made network requests
      const hasMore = i + batchSize < sigs.length
      if (hasMore && hadNetworkRequest && throttle.delayMs > 0) {
        await sleep(throttle.delayMs)
      }
    }

    const finalRows = Array.from(rowMap.values())
    return perTableLimit ? finalRows.slice(0, perTableLimit) : finalRows
  }
}

/**
 * readRowsByDmSeed
 * - Scan UseDMTable/write_dm_data instructions for a specific DM seed.
 */
export async function readRowsByDmSeed(
  params: ReaderParams & { dmSeed: BytesLike; onProgress?: (rows: Row[]) => void; knownSignatures?: Set<string> | string[] }
): Promise<Row[]> {
  const endpoint = params.endpoint || configs.network
  const connection = params.connection || new Connection(endpoint, 'confirmed')
  const programIdStr = params.programId || configs.programId
  const rootIdBytes = rootIdToBytes(params.rootId)
  const idl = params.idl
  const dmSeedBytes = toBytes(params.dmSeed)
  const maxTx = params.maxTx || 100
  const perTableLimit = params.perTableLimit

  if (!idl) return []

  let idColumnName: string | undefined

  const normalizeRow = (input: Row): Row => {
    if (!input || typeof input !== 'object') return input
    const clone: Row = { ...input }
    if (idColumnName && Object.prototype.hasOwnProperty.call(clone, idColumnName)) {
      try {
        Object.defineProperty(clone, '__rowId', {
          value: (clone as any)[idColumnName],
          enumerable: false,
          configurable: true,
          writable: true,
        })
      } catch {
        ; (clone as any).__rowId = (clone as any)[idColumnName]
      }
    }
    return clone
  }

  try {
    const meta = await readDmTableMeta({ ...params, connection })
    if (typeof meta.idColumn === 'string') {
      idColumnName = meta.idColumn
    } else if (typeof meta.idColumn === 'number' && meta.columns?.[meta.idColumn]) {
      idColumnName = meta.columns[meta.idColumn]
    }
    if (!idColumnName && meta.columns && meta.columns.length > 0) {
      idColumnName = meta.columns[0]
    }
  } catch {
    // best-effort
  }

  const rootPda = pdaRoot(rootIdBytes)
  const dmTablePda = pdaDmTable(rootPda, dmSeedBytes)
  const targetSeedHex = Buffer.from(dmSeedBytes).toString('hex')

  const ixCoder = makeIxCoder(idl)
  const programId = new PublicKey(programIdStr)
  const programIdB58 = programId.toBase58()

  const rpcEndpoint = (connection as any)?._rpcEndpoint || endpoint
  const knownSigSet = params.knownSignatures
    ? new Set(Array.from(params.knownSignatures))
    : new Set<string>()

  const emitProgress = (rows: Row[]) => {
    if (!params.onProgress) return
    const limited = perTableLimit ? rows.slice(0, perTableLimit) : rows
    params.onProgress(limited)
  }

  {
    const sigsAll = await getCachedSignatures(connection, dmTablePda, maxTx)
    const sigs = sigsAll.filter((s) => !knownSigSet.has(s.signature))
    const instructionMap = new Map<string, Row>()
    const writeRowBase = new Map<string, Row>()
    const rowMap = new Map<string, Row>()
    const throttle = getRpcThrottle(rpcEndpoint)

    const shouldDeleteLocal = (override: Row | undefined): boolean => {
      if (!override || typeof override !== 'object') return false
      const lower = (val: any) => (typeof val === 'string' ? val.toLowerCase() : '')
      if (
        override.delete === true ||
        override.deleted === true ||
        (override as any).__delete === true ||
        lower((override as any).action) === 'delete' ||
        lower((override as any).mode) === 'delete' ||
        lower((override as any).op) === 'delete' ||
        lower((override as any).type) === 'delete' ||
        lower((override as any).status) === 'deleted'
      ) {
        return true
      }
      return false
    }

    const applyInstruction = (baseRow: Row, override: Row | undefined): Row | null => {
      if (!override) return baseRow
      if (shouldDeleteLocal(override as Row)) return null

      const baseClone: Row = baseRow && typeof baseRow === 'object' ? { ...baseRow } : {}
      const baseRowId = (baseRow as any)?.__rowId
      if (baseRowId !== undefined) {
        try {
          Object.defineProperty(baseClone, '__rowId', {
            value: baseRowId,
            enumerable: false,
            configurable: true,
            writable: true,
          })
        } catch {
          ; (baseClone as any).__rowId = baseRowId
        }
      }

      if (typeof override !== 'object') {
        if (override == null) {
          return normalizeRow(baseClone)
        }
        baseClone.value = override
        return normalizeRow(baseClone)
      }

      if (Array.isArray(override.entries)) {
        const merged = entriesToRow(override.entries)
        return normalizeRow({ ...baseClone, ...merged })
      }

      const baseRowKeys = Object.keys(baseRow ?? {})
      const overrideKeys = Object.keys(override ?? {})
      const ordered = Array.from(new Set([...baseRowKeys, ...overrideKeys]))

      for (const key of ordered) {
        const baseVal = (baseRow as any)?.[key]
        const overrideVal = (override as any)?.[key]

        if (overrideVal === undefined) {
          if (baseVal !== undefined) baseClone[key] = baseVal
        } else if (overrideVal === null) {
          delete (baseClone as any)[key]
        } else {
          baseClone[key] = overrideVal
        }
      }

      if (idColumnName) {
        const overrideId = Object.prototype.hasOwnProperty.call(override, idColumnName)
          ? (override as any)[idColumnName]
          : undefined
        if (overrideId !== undefined && overrideId !== null) {
          baseClone[idColumnName] = overrideId
        } else if ((baseClone as any)[idColumnName] == null && (baseRow as any)?.[idColumnName] != null) {
          baseClone[idColumnName] = (baseRow as any)[idColumnName]
        }
        const refreshedId = (baseClone as any)[idColumnName]
        if (refreshedId !== undefined) {
          try {
            Object.defineProperty(baseClone, '__rowId', {
              value: refreshedId,
              enumerable: false,
              configurable: true,
              writable: true,
            })
          } catch {
            ; (baseClone as any).__rowId = refreshedId
          }
        }
      }
      return normalizeRow(baseClone)
    }

    const attachHiddenMeta = (row: Row, signature: string): Row => {
      if (!row || typeof row !== 'object') return row
      const clone: Row = { ...row }
      const defineHidden = (key: string, value: string) => {
        try {
          Object.defineProperty(clone, key, {
            value,
            enumerable: false,
            configurable: false,
            writable: false,
          })
        } catch {
          ; (clone as any)[key] = value
        }
      }
      defineHidden('__txSignature', signature)
      defineHidden('__tableSeed', targetSeedHex)
      return clone
    }

    const applyAndEmit = (signature: string) => {
      const base = writeRowBase.get(signature)
      if (!base) return
      const override = instructionMap.get(signature)
      const applied = applyInstruction(base, override)
      if (!applied) {
        rowMap.delete(signature)
      } else {
        rowMap.set(signature, attachHiddenMeta(applied, signature))
      }
      const sorted = Array.from(rowMap.values()).sort(
        (a, b) => ((a as any).timestamp ?? 0) - ((b as any).timestamp ?? 0)
      )
      emitProgress(sorted)
    }

    const processTx = (tx: ParsedTransactionWithMeta | null, signature: string) => {
      if (!tx) return
      const decoded = decodeAllIxsFromTx(tx as any, programIdB58, ixCoder)
      for (const d of decoded) {
        try {
          if (d.name === 'write_dm_data' || d.name === 'use_dm_table') {
            const seedHex = toHex(d.data.dm_seed ?? d.data._dm_seed ?? d.data[1])
            if (seedHex !== targetSeedHex) continue
            const payloadStr = toStr(d.data.row_json_tx ?? d.data.rowJsonTx ?? d.data[2])
            const normalized = normalizeRow(parsePayloadJson(payloadStr, params.looseJson))
            writeRowBase.set(signature, normalized)
            applyAndEmit(signature)
          } else if (d.name === 'database_instruction') {
            const seedHex = toHex(d.data.table_seed ?? d.data[0])
            if (seedHex !== targetSeedHex) continue
            const targetSig = toStr(d.data.target_tx ?? d.data[1])
            if (!targetSig) continue
            const contentStr = toStr(d.data.contentJsonTx ?? d.data.content_json_tx ?? d.data[3])
            instructionMap.set(targetSig, parseInstructionContent(contentStr, params.looseJson))
            applyAndEmit(targetSig)
          }
        } catch {
          // skip decode errors
        }
      }
    }

    // Batch fetch transactions in groups with caching to reduce RPC calls
    const batchSize = throttle.batchSize > 0 ? throttle.batchSize : 10
    for (let i = 0; i < sigs.length; i += batchSize) {
      const batch = sigs.slice(i, i + batchSize)
      const txPromises = batch.map((sig) => getCachedTransaction(connection, sig.signature))
      const txResults = await Promise.all(txPromises)

      let hadNetworkRequest = false
      for (let j = 0; j < batch.length; j++) {
        const result = txResults[j]
        if (!result.fromCache) hadNetworkRequest = true
        processTx(result.tx as ParsedTransactionWithMeta | null, batch[j].signature)
      }

      // Only throttle between batches if we made network requests
      const hasMore = i + batchSize < sigs.length
      if (hasMore && hadNetworkRequest && throttle.delayMs > 0) {
        await sleep(throttle.delayMs)
      }
    }

    const finalRows = Array.from(rowMap.values())
    return perTableLimit ? finalRows.slice(0, perTableLimit) : finalRows
  }
}


export async function readTableMeta(
  params: ReaderParams & { tableName: string }
): Promise<{ name: string; columns: string[]; idColumn?: string | number | null; extTableName?: string | null; extKeys?: string[]; tablePda: string; instPda: string | null }> {
  const endpoint = params.endpoint || configs.network
  const connection = params.connection || new Connection(endpoint, 'confirmed')
  const rootIdBytes = rootIdToBytes(params.rootId)
  const idl = params.idl
  const tableName = params.tableName

  const rootPda = pdaRoot(rootIdBytes)
  const tablePda = pdaTable(rootPda, tableName)
  const instPda = pdaInstructionTable(rootPda, tableName)

  if (!idl) {
    return { name: toStr(tableName), columns: [], idColumn: null, extTableName: null, extKeys: [], tablePda: tablePda.toBase58(), instPda: instPda ? instPda.toBase58() : null }
  }

  const accCoder = makeAccountsCoder(idl)
  try {
    const tableAcc = await fetchAndDecode<any>(connection, accCoder, tablePda, 'Table')
    const name = tableAcc ? toStr(tableAcc.name ?? tableAcc.table_name ?? tableName) : toStr(tableName)
    const columns = tableAcc ? (tableAcc.column_names ?? tableAcc.columns ?? []).map((v: any) => toStr(v)) : []
    // Try multiple key candidates for id/ext
    let idColumn: string | number | null | undefined = null
    let extTableName: string | null | undefined = null
    let extKeys: string[] = []

    const idRaw =
      tableAcc?.id_column ??
      tableAcc?.idColumn ??
      tableAcc?.id_index ??
      tableAcc?.idIndex ??
      null
    if (typeof idRaw === 'string') {
      idColumn = idRaw
    } else if (typeof idRaw === 'number') {
      idColumn = idRaw
    } else if (idRaw && typeof idRaw === 'object') {
      const s = toStr(idRaw)
      idColumn = s || null
    } else {
      idColumn = null
    }

    const extRaw = tableAcc?.ext_table_name ?? tableAcc?.extTableName ?? null
    extTableName = extRaw != null ? toStr(extRaw) : null

    const extKeysRaw = tableAcc?.ext_keys ?? tableAcc?.extKeys ?? []
    if (Array.isArray(extKeysRaw)) {
      extKeys = extKeysRaw.map((v: any) => toStr(v)).filter((s: string) => s.length > 0)
    }

    // default: if idColumn missing, fallback to first column name
    if ((idColumn == null || idColumn === '') && columns.length > 0) {
      idColumn = columns[0]
    }

    return { name, columns, idColumn, extTableName, extKeys, tablePda: tablePda.toBase58(), instPda: instPda ? instPda.toBase58() : null }
  } catch {
    return { name: toStr(tableName), columns: [], idColumn: null, extTableName: null, extKeys: [], tablePda: tablePda.toBase58(), instPda: instPda ? instPda.toBase58() : null }
  }
}

export async function readDmTableMeta(
  params: ReaderParams & { dmSeed: BytesLike }
): Promise<{ name: string; columns: string[]; idColumn?: string | number | null; extKeys?: string[]; tablePda: string; instPda: string | null; partyA?: string | null; partyB?: string | null }> {
  const endpoint = params.endpoint || configs.network
  const connection = params.connection || new Connection(endpoint, 'confirmed')
  const rootIdBytes = rootIdToBytes(params.rootId)
  const idl = params.idl

  const rootPda = pdaRoot(rootIdBytes)
  const dmTablePda = pdaDmTable(rootPda, params.dmSeed)
  const instPda = pdaDmInstructionTable(rootPda, params.dmSeed)

  if (!idl) {
    return {
      name: toStr(params.dmSeed),
      columns: [],
      idColumn: null,
      extKeys: [],
      tablePda: dmTablePda.toBase58(),
      instPda: instPda ? instPda.toBase58() : null,
      partyA: null,
      partyB: null,
    }
  }

  const accCoder = makeAccountsCoder(idl)
  try {
    const tableAcc = await fetchAndDecode<any>(connection, accCoder, dmTablePda, 'DMTable')
    const name = tableAcc ? toStr(tableAcc.name ?? params.dmSeed) : toStr(params.dmSeed)
    const columns = tableAcc ? (tableAcc.column_names ?? tableAcc.columns ?? []).map((v: any) => toStr(v)) : []
    const idRaw =
      tableAcc?.id_col ??
      tableAcc?.id_column ??
      tableAcc?.idColumn ??
      tableAcc?.id_index ??
      tableAcc?.idIndex ??
      null

    let idColumn: string | number | null | undefined = null
    if (typeof idRaw === 'string') {
      idColumn = idRaw
    } else if (typeof idRaw === 'number') {
      idColumn = idRaw
    } else if (idRaw && typeof idRaw === 'object') {
      idColumn = toStr(idRaw)
    } else {
      idColumn = null
    }

    const extKeysRaw = tableAcc?.ext_keys ?? tableAcc?.extKeys ?? []
    const extKeys = Array.isArray(extKeysRaw) ? extKeysRaw.map((v: any) => toStr(v)).filter((s: string) => s.length > 0) : []

    if ((idColumn == null || idColumn === '') && columns.length > 0) {
      idColumn = columns[0]
    }

    const partyA = tableAcc?.party_a ? new PublicKey(tableAcc.party_a).toBase58() : null
    const partyB = tableAcc?.party_b ? new PublicKey(tableAcc.party_b).toBase58() : null

    return { name, columns, idColumn, extKeys, tablePda: dmTablePda.toBase58(), instPda: instPda ? instPda.toBase58() : null, partyA, partyB }
  } catch {
    return {
      name: toStr(params.dmSeed),
      columns: [],
      idColumn: null,
      extKeys: [],
      tablePda: dmTablePda.toBase58(),
      instPda: instPda ? instPda.toBase58() : null,
      partyA: null,
      partyB: null,
    }
  }
}
