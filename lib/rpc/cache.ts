'use client'

import { Connection, PublicKey, ConfirmedSignatureInfo, VersionedTransactionResponse } from '@solana/web3.js'

// ============================================================================
// RPC Caching Layer - Centralized caching for Solana RPC calls
// ============================================================================

interface CacheEntry<T> {
  data: T
  timestamp: number
}

// Signature cache: address -> signatures (30 second TTL since new txs can arrive)
const signatureCache = new Map<string, CacheEntry<ConfirmedSignatureInfo[]>>()
const SIGNATURE_CACHE_TTL = 30_000

// Transaction cache: signature -> transaction (no TTL, transactions are immutable)
const transactionCache = new Map<string, VersionedTransactionResponse | null>()

// Account info cache: address -> account info (60 second TTL - WebSocket subscriptions handle updates)
const accountInfoCache = new Map<string, CacheEntry<any>>()
const ACCOUNT_INFO_CACHE_TTL = 60_000

// In-flight request deduplication
const inFlightSignatures = new Map<string, Promise<ConfirmedSignatureInfo[]>>()
const inFlightTransactions = new Map<string, Promise<VersionedTransactionResponse | null>>()
const inFlightAccounts = new Map<string, Promise<any>>()

/**
 * Cached getSignaturesForAddress with deduplication
 */
export async function getCachedSignatures(
  connection: Connection,
  address: PublicKey,
  limit: number,
  before?: string
): Promise<ConfirmedSignatureInfo[]> {
  const cacheKey = `${address.toBase58()}:${limit}:${before || 'none'}`

  // Check cache
  const cached = signatureCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SIGNATURE_CACHE_TTL) {
    return cached.data
  }

  // Check if request is already in flight
  const inFlight = inFlightSignatures.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  // Make the request
  const promise = (async () => {
    const result = await connection.getSignaturesForAddress(
      address,
      { limit, before },
      'confirmed'
    )
    return result
  })()

  inFlightSignatures.set(cacheKey, promise)

  try {
    const result = await promise
    signatureCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  } finally {
    inFlightSignatures.delete(cacheKey)
  }
}

/**
 * Cached getSignaturesForAddress with pagination support
 */
export async function getCachedSignaturesPaginated(
  connection: Connection,
  address: PublicKey,
  limit: number
): Promise<ConfirmedSignatureInfo[]> {
  const cacheKey = `${address.toBase58()}:${limit}:paginated`

  // Check cache
  const cached = signatureCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SIGNATURE_CACHE_TTL) {
    return cached.data
  }

  // Check if request is already in flight
  const inFlight = inFlightSignatures.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  // Make the request with pagination
  const promise = (async () => {
    const out: ConfirmedSignatureInfo[] = []
    let before: string | undefined = undefined
    while (out.length < limit) {
      const chunk = await connection.getSignaturesForAddress(
        address,
        { limit: Math.min(1000, limit - out.length), before },
        'confirmed'
      )
      if (chunk.length === 0) break
      out.push(...chunk)
      before = chunk[chunk.length - 1].signature
    }
    return out
  })()

  inFlightSignatures.set(cacheKey, promise)

  try {
    const result = await promise
    signatureCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  } finally {
    inFlightSignatures.delete(cacheKey)
  }
}

export interface CachedTransactionResult {
  tx: VersionedTransactionResponse | null
  fromCache: boolean
}

/**
 * Cached getTransaction with deduplication (transactions are immutable)
 * Returns both the transaction and whether it was a cache hit
 */
export async function getCachedTransaction(
  connection: Connection,
  signature: string
): Promise<CachedTransactionResult> {
  // Check cache first
  if (transactionCache.has(signature)) {
    const cachedTx = transactionCache.get(signature)
    if (cachedTx) {
      return { tx: cachedTx, fromCache: true }
    }
    transactionCache.delete(signature)
  }

  // Check if request is already in flight
  const inFlight = inFlightTransactions.get(signature)
  if (inFlight) {
    const tx = await inFlight
    return { tx, fromCache: true } // Deduplicated request counts as cache hit
  }

  // Make the request
  const promise = connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed',
  })

  inFlightTransactions.set(signature, promise)

  try {
    const result = await promise
    if (result) {
      transactionCache.set(signature, result)
    } else {
      transactionCache.delete(signature)
    }
    return { tx: result, fromCache: false }
  } finally {
    inFlightTransactions.delete(signature)
  }
}

/**
 * Cached getAccountInfo with deduplication
 */
export async function getCachedAccountInfo(
  connection: Connection,
  address: PublicKey
): Promise<any> {
  const cacheKey = address.toBase58()

  // Check cache
  const cached = accountInfoCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < ACCOUNT_INFO_CACHE_TTL) {
    return cached.data
  }

  // Check if request is already in flight
  const inFlight = inFlightAccounts.get(cacheKey)
  if (inFlight) {
    return inFlight
  }

  // Make the request
  const promise = connection.getAccountInfo(address)

  inFlightAccounts.set(cacheKey, promise)

  try {
    const result = await promise
    accountInfoCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
  } finally {
    inFlightAccounts.delete(cacheKey)
  }
}

/**
 * Clear transaction cache (useful for memory management)
 */
export function clearTransactionCache(): void {
  transactionCache.clear()
}

/**
 * Clear signature cache for a specific address
 */
export function invalidateSignatureCache(address?: string): void {
  if (address) {
    for (const key of signatureCache.keys()) {
      if (key.startsWith(address)) {
        signatureCache.delete(key)
      }
    }
  } else {
    signatureCache.clear()
  }
}

/**
 * Clear account info cache
 */
export function invalidateAccountCache(address?: string): void {
  if (address) {
    accountInfoCache.delete(address)
  } else {
    accountInfoCache.clear()
  }
}

/**
 * Update account info cache directly (for WebSocket subscription updates)
 */
export function updateAccountCache(address: string, data: any): void {
  accountInfoCache.set(address, { data, timestamp: Date.now() })
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  signatureCache.clear()
  transactionCache.clear()
  accountInfoCache.clear()
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats() {
  return {
    signatures: signatureCache.size,
    transactions: transactionCache.size,
    accounts: accountInfoCache.size,
    inFlightSignatures: inFlightSignatures.size,
    inFlightTransactions: inFlightTransactions.size,
    inFlightAccounts: inFlightAccounts.size,
  }
}
