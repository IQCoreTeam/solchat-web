/**
 * Cache Module Entry Point
 *
 * Provides a comprehensive caching system for SolChat messages and data.
 */

'use client';

// Export cache manager (main API)
export {
  getCacheManager,
  initCacheManager,
  type MessageCacheOptions,
  type LoadMessagesResult,
  DEFAULT_MESSAGE_TTL,
  DEFAULT_TRANSACTION_TTL,
  DEFAULT_SIGNATURE_TTL,
} from './cache-manager';

// Export database types
export type { CachedMessage, CachedTransaction, CachedSignature, CacheMetadata } from './db';

// Export message cache utilities
export {
  deduplicateMessages,
  mergeMessages,
  sortMessages,
  getCacheStats,
  loadMultipleRooms,
  invalidateMultiple,
} from './message-cache';

// Export React hooks
export { useCacheManager, useCachedRoomMessages, useCachedDmMessages } from './use-cache';

// Export cached readers
export { readRowsByTableCached, readRowsByDmSeedCached, invalidateRoomCache, invalidateDmCache, syncRoomMessages, syncDmMessages } from './cached-reader';
