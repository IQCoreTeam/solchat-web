/**
 * Cached Reader Wrappers
 *
 * Drop-in replacements for onchainDB readers that add caching.
 */

'use client';

import { Buffer } from 'buffer';
import iqlabs from 'iqlabs-sdk';
import type { Row } from '@/lib/shared/message-helpers';
import { getCacheManager } from './cache-manager';
import type { Connection } from '@solana/web3.js';
import type { Idl } from '@coral-xyz/anchor';

export interface ReaderParams {
  connection: Connection;
  rootId: string;
  userPublicKey: string;
  idl: Idl;
  maxTx?: number;
}

async function readRowsByTable(
  params: ReaderParams & { tableName: string }
): Promise<Row[]> {
  const { rootId, tableName, maxTx } = params;
  const dbRootId = Buffer.from(rootId, 'utf8');
  const dbRoot = iqlabs.contract.getDbRootPda(dbRootId);
  const tableSeed = iqlabs.utils.toSeedBytes(tableName);
  const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed);
  return iqlabs.reader.readTableRows(tablePda, { limit: maxTx }) as Promise<Row[]>;
}

async function readRowsByDmSeed(
  params: ReaderParams & { dmSeed: Uint8Array }
): Promise<Row[]> {
  const { rootId, dmSeed, maxTx } = params;
  const dbRootId = Buffer.from(rootId, 'utf8');
  const dbRoot = iqlabs.contract.getDbRootPda(dbRootId);
  const tablePda = iqlabs.contract.getConnectionTablePda(dbRoot, dmSeed);
  return iqlabs.reader.readTableRows(tablePda, { limit: maxTx }) as Promise<Row[]>;
}

/**
 * Read room messages with caching
 */
export async function readRowsByTableCached(
  params: ReaderParams & { tableName: string }
): Promise<Row[]> {
  const { tableName, ...readerParams } = params;
  const roomId = `room:${tableName}`;

  console.log(`[CachedReader] Loading room: ${tableName}`);

  const manager = getCacheManager();

  // Ensure cache is initialized
  if (!manager.isReady()) {
    await manager.initialize();
  }

  // Define fetch function
  const fetchFn = () => readRowsByTable(params);

  try {
    const result = await manager.loadRoomMessages(roomId, fetchFn, {
      backgroundRefresh: true,
      maxRetries: 3,
    });

    if (result.fromCache) {
      console.log(`[CachedReader] Loaded ${result.messages.length} messages from cache (refreshing: ${result.refreshing})`);
    } else {
      console.log(`[CachedReader] Loaded ${result.messages.length} messages from network`);
    }

    return result.messages;
  } catch (error) {
    console.error('[CachedReader] Failed to load messages:', error);
    // Fallback to direct fetch
    console.log('[CachedReader] Falling back to direct fetch');
    return await readRowsByTable(params);
  }
}

/**
 * Read DM messages with caching
 */
export async function readRowsByDmSeedCached(
  params: ReaderParams & { dmSeed: Uint8Array }
): Promise<Row[]> {
  const { dmSeed } = params;
  const dmSeedHex = Buffer.from(dmSeed).toString('hex');
  const roomId = `dm:${dmSeedHex}`;

  console.log(`[CachedReader] Loading DM: ${dmSeedHex.slice(0, 8)}...`);

  const manager = getCacheManager();

  // Ensure cache is initialized
  if (!manager.isReady()) {
    await manager.initialize();
  }

  // Define fetch function
  const fetchFn = () => readRowsByDmSeed(params);

  try {
    const result = await manager.loadDmMessages(dmSeedHex, fetchFn, {
      backgroundRefresh: true,
      maxRetries: 3,
    });

    if (result.fromCache) {
      console.log(`[CachedReader] Loaded ${result.messages.length} DM messages from cache (refreshing: ${result.refreshing})`);
    } else {
      console.log(`[CachedReader] Loaded ${result.messages.length} DM messages from network`);
    }

    return result.messages;
  } catch (error) {
    console.error('[CachedReader] Failed to load DM messages:', error);
    // Fallback to direct fetch
    console.log('[CachedReader] Falling back to direct fetch');
    return await readRowsByDmSeed(params);
  }
}

/**
 * Invalidate room cache
 */
export async function invalidateRoomCache(tableName: string): Promise<void> {
  const roomId = `room:${tableName}`;
  const manager = getCacheManager();
  await manager.invalidateRoom(roomId);
}

/**
 * Invalidate DM cache
 */
export async function invalidateDmCache(dmSeed: Uint8Array): Promise<void> {
  const dmSeedHex = Buffer.from(dmSeed).toString('hex');
  const manager = getCacheManager();
  await manager.invalidateDm(dmSeedHex);
}

/**
 * Sync room messages (force refresh)
 */
export async function syncRoomMessages(
  params: ReaderParams & { tableName: string }
): Promise<Row[]> {
  const { tableName } = params;
  const roomId = `room:${tableName}`;
  const manager = getCacheManager();

  console.log(`[CachedReader] Syncing room: ${tableName}`);

  const fetchFn = () => readRowsByTable(params);

  return await manager.syncRoom(roomId, fetchFn);
}

/**
 * Sync DM messages (force refresh)
 */
export async function syncDmMessages(
  params: ReaderParams & { dmSeed: Uint8Array }
): Promise<Row[]> {
  const { dmSeed } = params;
  const dmSeedHex = Buffer.from(dmSeed).toString('hex');
  const manager = getCacheManager();

  console.log(`[CachedReader] Syncing DM: ${dmSeedHex.slice(0, 8)}...`);

  const fetchFn = () => readRowsByDmSeed(params);

  return await manager.syncDm(dmSeedHex, fetchFn);
}
