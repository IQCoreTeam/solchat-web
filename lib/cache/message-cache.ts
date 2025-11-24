/**
 * Message Cache Layer
 *
 * Provides high-level caching operations for chat messages with:
 * - Cache-first loading strategy
 * - Background refresh
 * - Deduplication
 * - Message ordering
 * - Retry logic with exponential backoff
 */

'use client';

import { getCacheDB, type CachedMessage, DEFAULT_MESSAGE_TTL } from './db';
import type { Row } from '@/lib/onchainDB/web/reader';

// ============================================================================
// Types
// ============================================================================

export interface MessageCacheOptions {
  maxRetries?: number;
  retryDelay?: number; // Initial delay in ms
  backgroundRefresh?: boolean;
  ttl?: number;
  onProgress?: (rows: Row[]) => void;
}

export interface LoadMessagesResult {
  messages: Row[];
  fromCache: boolean;
  refreshing: boolean;
}

// ============================================================================
// Cache-First Loading Strategy
// ============================================================================

/**
 * Load messages with cache-first strategy:
 * 1. Return cached messages immediately if available
 * 2. Fetch fresh data from network in background
 * 3. Update cache with new data
 * 4. Fallback to network if cache fails
 */
export async function loadMessagesWithCache(
  roomId: string,
  fetchFn: () => Promise<Row[]>,
  options: MessageCacheOptions = {}
): Promise<LoadMessagesResult> {
  const {
    maxRetries = 3,
    retryDelay = 3000,
    backgroundRefresh = true,
    ttl = DEFAULT_MESSAGE_TTL,
  } = options;


  try {
    // Try to get from cache first
    const cached = await getCachedMessages(roomId);

    if (cached.length > 0) {

      // Start background refresh if enabled
      if (backgroundRefresh) {
        console.log('[MessageCache] Starting background refresh...');
        fetchAndUpdateCache(roomId, fetchFn, ttl).catch((error) => {
          console.warn('[MessageCache] Background refresh failed:', error);
        });
      }

      return {
        messages: cached.map(cachedToRow),
        fromCache: true,
        refreshing: backgroundRefresh,
      };
    }

    console.log('[MessageCache] Cache miss, fetching from network...');
  } catch (error) {
    console.warn('[MessageCache] Cache read failed, falling back to network:', error);
  }

  // Cache miss or error - fetch from network with retry
  const messages = await fetchWithRetry(fetchFn, maxRetries, retryDelay);

  // Update cache in background
  updateCache(roomId, messages, ttl).catch((error) => {
    console.warn('[MessageCache] Failed to update cache:', error);
  });

  return {
    messages,
    fromCache: false,
    refreshing: false,
  };
}

/**
 * Get cached messages for a room
 */
export async function getCachedMessages(roomId: string): Promise<CachedMessage[]> {
  try {
    const db = getCacheDB();
    return await db.getMessages(roomId);
  } catch (error) {
    console.error('[MessageCache] Failed to get cached messages:', error);
    return [];
  }
}

/**
 * Update cache with new messages
 */
export async function updateCache(
  roomId: string,
  messages: Row[],
  ttl: number = DEFAULT_MESSAGE_TTL
): Promise<void> {
  try {
    if (messages.length === 0) {
      console.log(`[MessageCache] No messages to cache for room: ${roomId.slice(0, 8)}...`);
      return;
    }

    const db = getCacheDB();
    const cachedMessages = messages.map((msg) => rowToCached(msg, roomId));
    await db.cacheMessages(roomId, cachedMessages, ttl);

    console.log(`[MessageCache] Cached ${messages.length} messages for room: ${roomId.slice(0, 8)}...`);
  } catch (error) {
    console.error('[MessageCache] Failed to update cache:', error);
    // Don't throw - caching is optional
  }
}

/**
 * Add a single message to cache (for optimistic updates)
 */
export async function addMessageToCache(
  roomId: string,
  message: Row,
  ttl: number = DEFAULT_MESSAGE_TTL
): Promise<void> {
  try {
    const db = getCacheDB();
    const cachedMessage = rowToCached(message, roomId);
    await db.addMessage(cachedMessage, ttl);

    console.log(`[MessageCache] Added message to cache: ${message.id || 'unknown'}`);
  } catch (error) {
    console.error('[MessageCache] Failed to add message to cache:', error);
  }
}

/**
 * Clear cache for a specific room
 */
export async function invalidateCache(roomId: string): Promise<void> {
  try {
    const db = getCacheDB();
    await db.clearMessages(roomId);

    console.log(`[MessageCache] Invalidated cache for room: ${roomId.slice(0, 8)}...`);
  } catch (error) {
    console.error('[MessageCache] Failed to invalidate cache:', error);
  }
}

/**
 * Sync messages: fetch new and update cache
 */
export async function syncMessages(
  roomId: string,
  fetchFn: () => Promise<Row[]>,
  ttl: number = DEFAULT_MESSAGE_TTL
): Promise<Row[]> {
  console.log(`[MessageCache] Syncing messages for room: ${roomId.slice(0, 8)}...`);

  try {
    const messages = await fetchFn();
    await updateCache(roomId, messages, ttl);
    return messages;
  } catch (error) {
    console.error('[MessageCache] Sync failed:', error);
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch data with exponential backoff retry
 */
async function fetchWithRetry<T>(
  fetchFn: () => Promise<T>,
  maxRetries: number,
  initialDelay: number
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFn();
    } catch (error) {
      lastError = error as Error;
      console.warn(`[MessageCache] Fetch attempt ${attempt + 1} failed:`, error);

      if (attempt < maxRetries) {
        const delay = initialDelay * Math.pow(2, attempt);
        console.log(`[MessageCache] Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

/**
 * Fetch fresh data and update cache (background operation)
 */
async function fetchAndUpdateCache(
  roomId: string,
  fetchFn: () => Promise<Row[]>,
  ttl: number
): Promise<void> {
  try {
    const messages = await fetchFn();
    await updateCache(roomId, messages, ttl);
    console.log(`[MessageCache] Background refresh completed: ${messages.length} messages`);
  } catch (error) {
    console.error('[MessageCache] Background refresh failed:', error);
    throw error;
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert Row to CachedMessage
 */
function rowToCached(row: Row, roomId: string): Omit<CachedMessage, 'cachedAt' | 'expiresAt'> {
  const idCandidate =
    row.id ??
    (row as any).__rowId ??
    row.text ??
    (typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 10));

  return {
    id: String(idCandidate),
    roomId,
    text: row.text != null ? String(row.text) : '',
    file: row.file ? String(row.file) : undefined,
    signature: (row as any).__txSignature,
    sender: row.sender ? String(row.sender) : (row as any).senderAddress ? String((row as any).senderAddress) : undefined,
    displayName: row.displayName ? String(row.displayName) : undefined,
    avatarHue: row.avatarHue != null ? Number(row.avatarHue) : undefined,
    timestamp: row.timestamp != null ? Number(row.timestamp) : undefined,
    status: row.status ? (String(row.status) as any) : 'confirmed',
    room: row.room ? String(row.room) : undefined,
  };
}

/**
 * Convert CachedMessage back to Row
 */
function cachedToRow(cached: CachedMessage): Row {
  const row: Row = {
    id: cached.id,
    text: cached.text,
  };

  if (cached.file) row.file = cached.file;
  if (cached.sender) row.sender = cached.sender;
  if (cached.displayName) row.displayName = cached.displayName;
  if (cached.avatarHue != null) row.avatarHue = cached.avatarHue;
  if (cached.timestamp != null) row.timestamp = cached.timestamp;
  if (cached.status) row.status = cached.status;
  if (cached.room) row.room = cached.room;
  if (cached.signature) {
    // Store signature as hidden property
    Object.defineProperty(row, '__txSignature', {
      value: cached.signature,
      enumerable: false,
      configurable: true,
      writable: true,
    });
  }

  return row;
}

// ============================================================================
// Deduplication Utilities
// ============================================================================

/**
 * Deduplicate messages by ID (keeps the latest version)
 */
export function deduplicateMessages(messages: Row[]): Row[] {
  const seen = new Map<string, Row>();

  for (const msg of messages) {
    const id = String(msg.id ?? (msg as any).__rowId ?? msg.text ?? Math.random());

    const existing = seen.get(id);
    if (!existing) {
      seen.set(id, msg);
      continue;
    }

    // Keep the message with the later timestamp
    const existingTime = existing.timestamp ?? 0;
    const currentTime = msg.timestamp ?? 0;

    if (currentTime > existingTime) {
      seen.set(id, msg);
    }
  }

  return Array.from(seen.values());
}

/**
 * Merge cached and fresh messages, removing duplicates
 */
export function mergeMessages(cached: Row[], fresh: Row[]): Row[] {
  const all = [...cached, ...fresh];
  return deduplicateMessages(all);
}

/**
 * Sort messages by timestamp (ascending)
 */
export function sortMessages(messages: Row[]): Row[] {
  return messages.sort((a, b) => {
    const tsA = a.timestamp ?? 0;
    const tsB = b.timestamp ?? 0;
    return tsA - tsB;
  });
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Load messages for multiple rooms in parallel with caching
 */
export async function loadMultipleRooms(
  rooms: Array<{ roomId: string; fetchFn: () => Promise<Row[]> }>,
  options: MessageCacheOptions = {}
): Promise<Map<string, LoadMessagesResult>> {
  console.log(`[MessageCache] Loading ${rooms.length} rooms in parallel...`);

  const results = await Promise.allSettled(
    rooms.map(async ({ roomId, fetchFn }) => ({
      roomId,
      result: await loadMessagesWithCache(roomId, fetchFn, options),
    }))
  );

  const resultMap = new Map<string, LoadMessagesResult>();

  for (const result of results) {
    if (result.status === 'fulfilled') {
      resultMap.set(result.value.roomId, result.value.result);
    } else {
      console.error('[MessageCache] Failed to load room:', result.reason);
    }
  }

  console.log(`[MessageCache] Loaded ${resultMap.size}/${rooms.length} rooms successfully`);

  return resultMap;
}

/**
 * Invalidate cache for multiple rooms
 */
export async function invalidateMultiple(roomIds: string[]): Promise<void> {
  console.log(`[MessageCache] Invalidating ${roomIds.length} rooms...`);

  await Promise.allSettled(roomIds.map((roomId) => invalidateCache(roomId)));

  console.log('[MessageCache] Invalidation completed');
}

// ============================================================================
// Cache Statistics
// ============================================================================

/**
 * Get cache statistics for debugging
 */
export async function getCacheStats(): Promise<{
  totalMessages: number;
  totalRooms: number;
  oldestMessage?: number;
  newestMessage?: number;
}> {
  try {
    const db = getCacheDB();
    const stats = await db.getStats();

    // Get all cached messages to analyze
    // This is inefficient for large caches, but useful for debugging
    const allMessages: CachedMessage[] = [];
    // We'd need to iterate through all rooms to get this
    // For now, return basic stats

    return {
      totalMessages: stats.messages,
      totalRooms: 0, // Would need to track this separately
    };
  } catch (error) {
    console.error('[MessageCache] Failed to get cache stats:', error);
    return {
      totalMessages: 0,
      totalRooms: 0,
    };
  }
}
