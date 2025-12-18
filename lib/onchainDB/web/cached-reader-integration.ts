/**
 * Cached Reader Integration
 *
 * This file provides backward-compatible wrappers that add caching to the existing reader functions.
 * Import these instead of the original reader functions to get automatic caching.
 *
 * Usage:
 * ```ts
 * // Old way:
 * import { readRowsByTable } from '@/lib/onchainDB/web/reader';
 *
 * // New way (with caching):
 * import { readRowsByTable } from '@/lib/onchainDB/web/cached-reader-integration';
 * ```
 */

'use client';

import {
  readRowsByTable as originalReadRowsByTable,
  readRowsByDmSeed as originalReadRowsByDmSeed,
  type Row,
} from './reader';
import { getCacheManager } from '@/lib/cache/cache-manager';
import type { Connection } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';

export type { Row };

interface ReadTableParams {
  connection: Connection;
  rootId: string;
  tableName: string;
  userPublicKey: string;
  idl: Idl;
  maxTx?: number;
  signatures?: string[];
  knownSignatures?: Set<string> | string[];
  perTableLimit?: number;
  onProgress?: (rows: Row[]) => void;
}

interface ReadDmParams {
  connection: Connection;
  rootId: string;
  dmSeed: Uint8Array;
  userPublicKey: string;
  idl: Idl;
  maxTx?: number;
  perTableLimit?: number;
  onProgress?: (rows: Row[]) => void;
}

/**
 * Read table rows with automatic caching
 */
export async function readRowsByTable(params: ReadTableParams): Promise<Row[]> {
  const { tableName } = params;
  const roomId = `room:${tableName}`;

  try {
    const forceNetwork = Boolean(
      (Array.isArray(params.signatures) && params.signatures.length) ||
      params.maxTx
    );
    const manager = getCacheManager();

    if (forceNetwork) {
      const rows = await originalReadRowsByTable(params);
      if (manager.isReady()) {
        try {
          await manager.updateRoomCache(roomId, rows);
        } catch (error) {
          console.warn('[CachedReader] Failed to update cache after network fetch:', error);
        }
      }
      return rows;
    }

    // If cache not ready, fallback to original
    if (!manager.isReady()) {
      console.log('[CachedReader] Cache not ready, using direct fetch');
      return await originalReadRowsByTable(params);
    }

    // Load with cache
    const result = await manager.loadRoomMessages(
      roomId,
      () => originalReadRowsByTable(params),
      {
        backgroundRefresh: true,
        maxRetries: 2,
        retryDelay: 500,
        onProgress: params.onProgress,
      }
    );

    if (result.fromCache) {
      console.log(`[CachedReader] Loaded ${result.messages.length} messages from cache for ${tableName}`);
    }

    return result.messages;
  } catch (error) {
    console.error('[CachedReader] Cache error, falling back to direct fetch:', error);
    return await originalReadRowsByTable(params);
  }
}

/**
 * Read DM rows with automatic caching
 */
export async function readRowsByDmSeed(params: ReadDmParams): Promise<Row[]> {
  const { dmSeed } = params;
  const dmSeedHex = Buffer.from(dmSeed).toString('hex');

  try {
    const manager = getCacheManager();

    // If cache not ready, fallback to original
    if (!manager.isReady()) {
      console.log('[CachedReader] Cache not ready, using direct fetch');
      return await originalReadRowsByDmSeed(params);
    }

    // Load with cache
    const result = await manager.loadDmMessages(
      dmSeedHex,
      () => originalReadRowsByDmSeed(params),
      {
        backgroundRefresh: false,
        maxRetries: 2,
        retryDelay: 500,
        onProgress: params.onProgress,
      }
    );

    if (result.fromCache) {
      console.log(`[CachedReader] Loaded ${result.messages.length} DM messages from cache`);
    }

    return result.messages;
  } catch (error) {
    console.error('[CachedReader] Cache error, falling back to direct fetch:', error);
    return await originalReadRowsByDmSeed(params);
  }
}

/**
 * Utility: Invalidate room cache
 */
export async function invalidateRoomCache(tableName: string): Promise<void> {
  const roomId = `room:${tableName}`;
  const manager = getCacheManager();
  await manager.invalidateRoom(roomId);
  console.log(`[CachedReader] Invalidated cache for room: ${tableName}`);
}

/**
 * Utility: Invalidate DM cache
 */
export async function invalidateDmCache(dmSeed: Uint8Array): Promise<void> {
  const dmSeedHex = Buffer.from(dmSeed).toString('hex');
  const manager = getCacheManager();
  await manager.invalidateDm(dmSeedHex);
  console.log(`[CachedReader] Invalidated cache for DM: ${dmSeedHex.slice(0, 8)}...`);
}
