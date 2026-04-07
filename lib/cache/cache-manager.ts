/**
 * Central Cache Manager
 *
 * Coordinates all caching operations across the application:
 * - Message caching for rooms and DMs
 * - Transaction caching
 * - Signature caching
 * - Cache lifecycle management
 * - Error handling and fallbacks
 *
 * Goal (reference only, not implemented yet):
 * 1) Each room owns `{ txs: string[]; messages: Record<signature, { id; text; sender; timestamp }> }`.
 * 2) Entering a room fetches only the latest 100 tx signatures, shows cached messages immediately.
 * 3) Only signatures missing from the cache are queued for decoding.
 * 4) Queue drains via the existing RPC throttle (1 tx/sec default RPC, 8 tx/sec custom RPC).
 * 5) Every decoded message updates the cache so UI fills in gradually.
 * 6) No extra range math; comparing the 100 signatures against cache is enough, even if there are gaps.
 * 7) This approach prioritizes UX/stability; “sync in progress” tells users when backfill is happening.
 */

'use client';

import { getCacheDB, initCacheDB, DEFAULT_MESSAGE_TTL, DEFAULT_TRANSACTION_TTL, DEFAULT_SIGNATURE_TTL } from './db';
import {
  loadMessagesWithCache,
  getCachedMessages,
  updateCache,
  addMessageToCache,
  invalidateCache,
  syncMessages,
  type MessageCacheOptions,
  type LoadMessagesResult,
} from './message-cache';
import type { MessageRow } from '@/lib/shared/message-helpers';
import type { ConfirmedSignatureInfo } from '@solana/web3.js';

// ============================================================================
// Cache Manager Class
// ============================================================================

class CacheManager {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * TODO: Align room caches with the new architecture.
   * - Each room keeps a tx/signature list plus a signature->message map.
   *   Only store `{ id, text, sender, timestamp }` per entry to keep it lean, while leaving `expiresAt`
   *   support in the storage layer for future TTL policies if needed.
   * - Rename storage/manager pieces to make their role clearer (e.g. CacheDB -> CacheStore/RoomCacheStore and
   *   move db.ts -> room-cache-store.ts or similar) once the new structure lands, so the IndexedDB layer
   *   isn’t mistaken for an on-chain/database API.
   * - Initial load should grab the latest ~100 txs, show cached messages instantly,
   *   diff the signature list against cache to find misses, then feed only those
   *   missing signatures into the queue, letting the existing rpc-throttle helpers
   *   pace message decoding/fetching in the background.
   * - Plan of attack:
   *   1) Update the cache storage layer (DB schema + function names) to support tx lists + signature maps,
   *      and document the lean per-message shape (`id`, `text`, `sender`, `timestamp`) so the UI knows
   *      what data comes straight from cache.
   *   2) Build a loader/queue module that fetches the latest 100 signatures, diffs with cache, and enqueues misses.
   *   3) Wire CacheManager + cached-reader integration to consume that loader so ChatClient sees cache-first data.
   *   4) Add the "sync in progress" signal/UI hook; later we can prioritize viewport-adjacent messages.
   * - When users scroll past the cached range (i.e. no more cached messages but history exists),
   *   trigger an additional fetch to extend the window so busy rooms don't lose older context.
   * - Surface a lightweight "sync in progress" indicator while the queue drains; later we can
   *   revisit prioritizing messages near the current viewport after the basic end-to-end flow lands.
   */

  /**
   * Initialize the cache system
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('[CacheManager] Initializing cache system...');

      await initCacheDB();

      this.initialized = true;

      console.log('[CacheManager] Cache system initialized successfully');

      // Log cache stats
      this.logStats();
    } catch (error) {
      console.error('[CacheManager] Failed to initialize cache system:', error);
      // Don't throw - app should work without cache
    }
  }

  /**
   * Check if cache is ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ==========================================================================
  // Room Message Operations
  // ==========================================================================

  /**
   * Load room messages with caching
   */
  async loadRoomMessages(
    roomId: string,
    fetchFn: () => Promise<MessageRow[]>,
    options?: MessageCacheOptions
  ): Promise<LoadMessagesResult> {
    if (!this.isReady()) {
      console.warn('[CacheManager] Cache not ready, fetching directly');
      try {
        const messages = await fetchFn();
        return { messages, fromCache: false, refreshing: false };
      } catch (error) {
        console.error('[CacheManager] Failed to fetch messages:', error);
        throw error;
      }
    }

    try {
      return await loadMessagesWithCache(roomId, fetchFn, options);
    } catch (error) {
      console.error('[CacheManager] Cache load failed, falling back to network:', error);
      const messages = await fetchFn();
      return { messages, fromCache: false, refreshing: false };
    }
  }

  /**
   * Get cached room messages (no network fetch)
   */
  async getCachedRoomMessages(roomId: string): Promise<MessageRow[]> {
    if (!this.isReady()) {
      return [];
    }

    try {
      const cached = await getCachedMessages(roomId);
      return cached.map((msg) => ({
        id: msg.id,
        text: msg.text,
        file: msg.file,
        sender: msg.sender,
        displayName: msg.displayName,
        avatarHue: msg.avatarHue,
        timestamp: msg.timestamp,
        status: msg.status,
        room: msg.room,
      }));
    } catch (error) {
      console.error('[CacheManager] Failed to get cached messages:', error);
      return [];
    }
  }

  /**
   * Update room message cache
   */
  async updateRoomCache(roomId: string, messages: MessageRow[], ttl?: number): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await updateCache(roomId, messages, ttl ?? DEFAULT_MESSAGE_TTL);
    } catch (error) {
      console.error('[CacheManager] Failed to update room cache:', error);
    }
  }

  /**
   * Add optimistic message to cache
   */
  async addOptimisticMessage(roomId: string, message: MessageRow): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await addMessageToCache(roomId, message, DEFAULT_MESSAGE_TTL);
    } catch (error) {
      console.error('[CacheManager] Failed to add optimistic message:', error);
    }
  }

  /**
   * Invalidate room cache
   */
  async invalidateRoom(roomId: string): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      await invalidateCache(roomId);
    } catch (error) {
      console.error('[CacheManager] Failed to invalidate room:', error);
    }
  }

  /**
   * Sync room messages (force refresh)
   */
  async syncRoom(roomId: string, fetchFn: () => Promise<MessageRow[]>): Promise<MessageRow[]> {
    if (!this.isReady()) {
      return fetchFn();
    }

    try {
      return await syncMessages(roomId, fetchFn, DEFAULT_MESSAGE_TTL);
    } catch (error) {
      console.error('[CacheManager] Failed to sync room:', error);
      throw error;
    }
  }

  // ==========================================================================
  // DM Message Operations
  // ==========================================================================

  /**
   * Load DM messages with caching
   * DMs use a seed hex as roomId
   */
  async loadDmMessages(
    dmSeedHex: string,
    fetchFn: () => Promise<MessageRow[]>,
    options?: MessageCacheOptions
  ): Promise<LoadMessagesResult> {
    // DMs use the same caching mechanism as rooms
    return this.loadRoomMessages(`dm:${dmSeedHex}`, fetchFn, options);
  }

  /**
   * Get cached DM messages
   */
  async getCachedDmMessages(dmSeedHex: string): Promise<MessageRow[]> {
    return this.getCachedRoomMessages(`dm:${dmSeedHex}`);
  }

  /**
   * Update DM message cache
   */
  async updateDmCache(dmSeedHex: string, messages: MessageRow[], ttl?: number): Promise<void> {
    return this.updateRoomCache(`dm:${dmSeedHex}`, messages, ttl);
  }

  /**
   * Invalidate DM cache
   */
  async invalidateDm(dmSeedHex: string): Promise<void> {
    return this.invalidateRoom(`dm:${dmSeedHex}`);
  }

  /**
   * Sync DM messages
   */
  async syncDm(dmSeedHex: string, fetchFn: () => Promise<MessageRow[]>): Promise<MessageRow[]> {
    return this.syncRoom(`dm:${dmSeedHex}`, fetchFn);
  }

  // ==========================================================================
  // Transaction Operations
  // ==========================================================================

  /**
   * Get cached transaction
   */
  async getTransaction(signature: string): Promise<any | null> {
    if (!this.isReady()) {
      return null;
    }

    try {
      const db = getCacheDB();
      const cached = await db.getTransaction(signature);
      return cached?.data ?? null;
    } catch (error) {
      console.error('[CacheManager] Failed to get transaction:', error);
      return null;
    }
  }

  /**
   * Cache transaction
   */
  async cacheTransaction(signature: string, roomId: string, data: any, ttl?: number): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      const db = getCacheDB();
      await db.cacheTransaction(signature, roomId, data, ttl ?? DEFAULT_TRANSACTION_TTL);
    } catch (error) {
      console.error('[CacheManager] Failed to cache transaction:', error);
    }
  }

  /**
   * Load transaction with caching
   */
  async loadTransaction(
    signature: string,
    roomId: string,
    fetchFn: () => Promise<any>
  ): Promise<{ data: any; fromCache: boolean }> {
    if (!this.isReady()) {
      const data = await fetchFn();
      return { data, fromCache: false };
    }

    try {
      // Try cache first
      const cached = await this.getTransaction(signature);
      if (cached) {
        console.log(`[CacheManager] Transaction cache hit: ${signature.slice(0, 8)}...`);
        return { data: cached, fromCache: true };
      }

      // Fetch from network
      console.log(`[CacheManager] Transaction cache miss: ${signature.slice(0, 8)}...`);
      const data = await fetchFn();

      // Update cache in background
      this.cacheTransaction(signature, roomId, data).catch((error) => {
        console.warn('[CacheManager] Failed to cache transaction:', error);
      });

      return { data, fromCache: false };
    } catch (error) {
      console.error('[CacheManager] Failed to load transaction:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Signature Operations
  // ==========================================================================

  /**
   * Get cached signatures for an account
   */
  async getSignatures(accountAddress: string, limit?: number): Promise<any[]> {
    if (!this.isReady()) {
      return [];
    }

    try {
      const db = getCacheDB();
      const signatures = await db.getSignatures(accountAddress, limit);
      return signatures.map((sig) => ({
        signature: sig.signature,
        blockTime: sig.blockTime,
        slot: sig.slot,
      }));
    } catch (error) {
      console.error('[CacheManager] Failed to get signatures:', error);
      return [];
    }
  }

  /**
   * Cache signatures
   */
  async cacheSignatures(accountAddress: string, signatures: ConfirmedSignatureInfo[]): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      const db = getCacheDB();
      const cached = signatures.map((sig) => ({
        signature: sig.signature,
        accountAddress,
        blockTime: sig.blockTime ?? undefined,
        slot: sig.slot,
        cachedAt: Date.now(),
      }));

      await db.cacheSignatures(cached);
    } catch (error) {
      console.error('[CacheManager] Failed to cache signatures:', error);
    }
  }

  /**
   * Load signatures with caching
   */
  async loadSignatures(
    accountAddress: string,
    fetchFn: () => Promise<ConfirmedSignatureInfo[]>,
    limit?: number
  ): Promise<{ signatures: ConfirmedSignatureInfo[]; fromCache: boolean }> {
    if (!this.isReady()) {
      const signatures = await fetchFn();
      return { signatures, fromCache: false };
    }

    try {
      // Try cache first
      const cached = await this.getSignatures(accountAddress, limit);
      if (cached.length > 0) {
        console.log(`[CacheManager] Signature cache hit: ${cached.length} signatures`);
        return { signatures: cached as any, fromCache: true };
      }

      // Fetch from network
      console.log('[CacheManager] Signature cache miss, fetching...');
      const signatures = await fetchFn();

      // Update cache in background
      this.cacheSignatures(accountAddress, signatures).catch((error) => {
        console.warn('[CacheManager] Failed to cache signatures:', error);
      });

      return { signatures, fromCache: false };
    } catch (error) {
      console.error('[CacheManager] Failed to load signatures:', error);
      throw error;
    }
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Clear all cache data
   */
  async clearAll(): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      const db = getCacheDB();
      await db.clearAll();
      console.log('[CacheManager] All cache data cleared');
    } catch (error) {
      console.error('[CacheManager] Failed to clear cache:', error);
    }
  }

  /**
   * Run cache cleanup (remove expired entries)
   */
  async cleanup(): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      const db = getCacheDB();
      await db.cleanupExpired();
      console.log('[CacheManager] Cache cleanup completed');
    } catch (error) {
      console.error('[CacheManager] Failed to cleanup cache:', error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    messages: number;
    transactions: number;
    signatures: number;
  }> {
    if (!this.isReady()) {
      return { messages: 0, transactions: 0, signatures: 0 };
    }

    try {
      const db = getCacheDB();
      return await db.getStats();
    } catch (error) {
      console.error('[CacheManager] Failed to get stats:', error);
      return { messages: 0, transactions: 0, signatures: 0 };
    }
  }

  /**
   * Log cache statistics to console
   */
  async logStats(): Promise<void> {
    if (!this.isReady()) {
      console.log('[CacheManager] Cache not initialized');
      return;
    }

    try {
      const stats = await this.getStats();
      console.log('[CacheManager] Cache statistics:', stats);
    } catch (error) {
      console.error('[CacheManager] Failed to log stats:', error);
    }
  }

  // ==========================================================================
  // Metadata Operations
  // ==========================================================================

  /**
   * Get cache metadata
   */
  async getMetadata(key: string): Promise<string | number | null> {
    if (!this.isReady()) {
      return null;
    }

    try {
      const db = getCacheDB();
      return await db.getMetadata(key);
    } catch (error) {
      console.error('[CacheManager] Failed to get metadata:', error);
      return null;
    }
  }

  /**
   * Set cache metadata
   */
  async setMetadata(key: string, value: string | number): Promise<void> {
    if (!this.isReady()) {
      return;
    }

    try {
      const db = getCacheDB();
      await db.setMetadata(key, value);
    } catch (error) {
      console.error('[CacheManager] Failed to set metadata:', error);
    }
  }

  /**
   * Get cache version
   */
  async getCacheVersion(): Promise<number> {
    const version = await this.getMetadata('cache-version');
    return typeof version === 'number' ? version : 1;
  }

  /**
   * Set cache version
   */
  async setCacheVersion(version: number): Promise<void> {
    await this.setMetadata('cache-version', version);
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let managerInstance: CacheManager | null = null;

/**
 * Get the singleton cache manager instance
 */
export function getCacheManager(): CacheManager {
  if (!managerInstance) {
    managerInstance = new CacheManager();
  }
  return managerInstance;
}

/**
 * Initialize the cache manager (call once on app startup)
 */
export async function initCacheManager(): Promise<void> {
  const manager = getCacheManager();
  await manager.initialize();
}

// ============================================================================
// Convenience Exports
// ============================================================================

export type { MessageCacheOptions, LoadMessagesResult };
export { DEFAULT_MESSAGE_TTL, DEFAULT_TRANSACTION_TTL, DEFAULT_SIGNATURE_TTL };
