/**
 * IndexedDB Wrapper for SolChat
 *
 * Provides typed, versioned access to IndexedDB for caching messages,
 * signatures, and transaction data with proper error handling and fallbacks.
 *
 * Features:
 * - Typed interfaces for all data structures
 * - Automatic schema migrations
 * - Error handling with fallback to network
 * - Batch operations support
 * - TTL (time-to-live) for cache entries
 */

'use client';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface CachedMessage {
  id: string;
  roomId: string; // Room seed hex or DM seed hex
  text: string;
  file?: string;
  signature?: string;
  sender?: string;
  displayName?: string;
  avatarHue?: number;
  timestamp?: number;
  status?: 'pending' | 'sent' | 'confirmed' | 'failed';
  room?: string;
  cachedAt: number; // When this was cached
  expiresAt?: number; // Optional expiration
}

export interface CachedTransaction {
  signature: string;
  roomId: string;
  data: any; // The full transaction data
  cachedAt: number;
  expiresAt?: number;
}

export interface CachedSignature {
  signature: string;
  accountAddress: string;
  blockTime?: number;
  slot: number;
  cachedAt: number;
}

export interface CacheMetadata {
  key: string; // e.g., 'room-version', 'dm-version'
  value: string | number;
  updatedAt: number;
}

// ============================================================================
// Database Configuration
// ============================================================================

const DB_NAME = 'solchat-cache';
const DB_VERSION = 1;

// Store names
const STORE_MESSAGES = 'messages';
const STORE_TRANSACTIONS = 'transactions';
const STORE_SIGNATURES = 'signatures';
const STORE_METADATA = 'metadata';

// Default TTL values (in milliseconds)
export const DEFAULT_MESSAGE_TTL = 24 * 60 * 60 * 1000; // 24 hours
export const DEFAULT_TRANSACTION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_SIGNATURE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// ============================================================================
// Database Class
// ============================================================================

class CacheDB {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private isInitialized = false;

  /**
   * Initialize the database connection
   */
  async init(): Promise<void> {
    if (this.isInitialized && this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise<void>((resolve, reject) => {
      if (typeof window === 'undefined' || !window.indexedDB) {
        console.warn('[CacheDB] IndexedDB not available, cache disabled');
        reject(new Error('IndexedDB not available'));
        return;
      }

      console.log('[CacheDB] Initializing database...');

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[CacheDB] Failed to open database:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('[CacheDB] Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        console.log('[CacheDB] Upgrading database schema...');

        // Create messages store
        if (!db.objectStoreNames.contains(STORE_MESSAGES)) {
          const messagesStore = db.createObjectStore(STORE_MESSAGES, { keyPath: 'id' });
          messagesStore.createIndex('roomId', 'roomId', { unique: false });
          messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
          messagesStore.createIndex('signature', 'signature', { unique: false });
          messagesStore.createIndex('expiresAt', 'expiresAt', { unique: false });
          console.log('[CacheDB] Created messages store');
        }

        // Create transactions store
        if (!db.objectStoreNames.contains(STORE_TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORE_TRANSACTIONS, { keyPath: 'signature' });
          txStore.createIndex('roomId', 'roomId', { unique: false });
          txStore.createIndex('expiresAt', 'expiresAt', { unique: false });
          console.log('[CacheDB] Created transactions store');
        }

        // Create signatures store
        if (!db.objectStoreNames.contains(STORE_SIGNATURES)) {
          const sigStore = db.createObjectStore(STORE_SIGNATURES, { keyPath: 'signature' });
          sigStore.createIndex('accountAddress', 'accountAddress', { unique: false });
          sigStore.createIndex('slot', 'slot', { unique: false });
          console.log('[CacheDB] Created signatures store');
        }

        // Create metadata store
        if (!db.objectStoreNames.contains(STORE_METADATA)) {
          db.createObjectStore(STORE_METADATA, { keyPath: 'key' });
          console.log('[CacheDB] Created metadata store');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInit(): Promise<IDBDatabase> {
    if (!this.isInitialized || !this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  // ==========================================================================
  // Message Operations
  // ==========================================================================

  /**
   * Get all messages for a room (sorted by timestamp)
   */
  async getMessages(roomId: string): Promise<CachedMessage[]> {
    try {
      const db = await this.ensureInit();
      const now = Date.now();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readonly');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('roomId');
        const request = index.getAll(IDBKeyRange.only(roomId));

        request.onsuccess = () => {
          const allMessages = request.result as CachedMessage[];
          const messages = allMessages
            .filter((msg) => !msg.expiresAt || msg.expiresAt > now)
            .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

          resolve(messages);
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to get messages:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error getting messages:', error);
      return [];
    }
  }

  /**
   * Cache messages for a room (batch operation)
   */
  async cacheMessages(roomId: string, messages: Omit<CachedMessage, 'cachedAt' | 'expiresAt'>[], ttl?: number): Promise<void> {
    try {
      const db = await this.ensureInit();
      const now = Date.now();
      const expiresAt = ttl ? now + ttl : undefined;

      // Handle empty array case
      if (messages.length === 0) {
        return;
      }

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);

        // Wait for transaction to complete (data committed to disk)
        transaction.oncomplete = () => {
          resolve();
        };

        transaction.onerror = () => {
          console.error('[CacheDB] Transaction failed:', transaction.error);
          reject(transaction.error);
        };

        transaction.onabort = () => {
          console.error('[CacheDB] Transaction aborted:', transaction.error);
          reject(transaction.error);
        };

        // Put all messages
        for (const msg of messages) {
          const cachedMsg: CachedMessage = {
            ...msg,
            roomId,
            cachedAt: now,
            expiresAt,
          };
          store.put(cachedMsg);
        }
      });
    } catch (error) {
      console.error('[CacheDB] Error caching messages:', error);
      // Don't throw - caching is optional
    }
  }

  /**
   * Add a single message to cache
   */
  async addMessage(message: Omit<CachedMessage, 'cachedAt' | 'expiresAt'>, ttl?: number): Promise<void> {
    return this.cacheMessages(message.roomId, [message], ttl);
  }

  /**
   * Clear all messages for a room
   */
  async clearMessages(roomId: string): Promise<void> {
    try {
      const db = await this.ensureInit();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('roomId');
        const request = index.openCursor(IDBKeyRange.only(roomId));

        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            cursor.continue();
          } else {
            console.log(`[CacheDB] Cleared messages for room: ${roomId.slice(0, 8)}...`);
            resolve();
          }
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to clear messages:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error clearing messages:', error);
    }
  }

  // ==========================================================================
  // Transaction Operations
  // ==========================================================================

  /**
   * Get cached transaction by signature
   */
  async getTransaction(signature: string): Promise<CachedTransaction | null> {
    try {
      const db = await this.ensureInit();
      const now = Date.now();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_TRANSACTIONS, 'readonly');
        const store = transaction.objectStore(STORE_TRANSACTIONS);
        const request = store.get(signature);

        request.onsuccess = () => {
          const tx = request.result as CachedTransaction | undefined;
          if (tx && (!tx.expiresAt || tx.expiresAt > now)) {
            console.log(`[CacheDB] Cache hit for transaction: ${signature.slice(0, 8)}...`);
            resolve(tx);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to get transaction:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error getting transaction:', error);
      return null;
    }
  }

  /**
   * Cache a transaction
   */
  async cacheTransaction(signature: string, roomId: string, data: any, ttl?: number): Promise<void> {
    try {
      const db = await this.ensureInit();
      const now = Date.now();

      const cachedTx: CachedTransaction = {
        signature,
        roomId,
        data,
        cachedAt: now,
        expiresAt: ttl ? now + ttl : undefined,
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_TRANSACTIONS, 'readwrite');
        const store = transaction.objectStore(STORE_TRANSACTIONS);
        const request = store.put(cachedTx);

        request.onsuccess = () => {
          console.log(`[CacheDB] Cached transaction: ${signature.slice(0, 8)}...`);
          resolve();
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to cache transaction:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error caching transaction:', error);
    }
  }

  // ==========================================================================
  // Signature Operations
  // ==========================================================================

  /**
   * Get cached signatures for an account
   */
  async getSignatures(accountAddress: string, limit?: number): Promise<CachedSignature[]> {
    try {
      const db = await this.ensureInit();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_SIGNATURES, 'readonly');
        const store = transaction.objectStore(STORE_SIGNATURES);
        const index = store.index('accountAddress');
        const request = index.getAll(IDBKeyRange.only(accountAddress));

        request.onsuccess = () => {
          let sigs = request.result as CachedSignature[];

          // Sort by slot (newest first)
          sigs.sort((a, b) => b.slot - a.slot);

          if (limit) {
            sigs = sigs.slice(0, limit);
          }

          console.log(`[CacheDB] Retrieved ${sigs.length} cached signatures for account: ${accountAddress.slice(0, 8)}...`);
          resolve(sigs);
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to get signatures:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error getting signatures:', error);
      return [];
    }
  }

  /**
   * Cache signatures (batch operation)
   */
  async cacheSignatures(signatures: CachedSignature[]): Promise<void> {
    try {
      const db = await this.ensureInit();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_SIGNATURES, 'readwrite');
        const store = transaction.objectStore(STORE_SIGNATURES);

        let completed = 0;
        const total = signatures.length;

        for (const sig of signatures) {
          const request = store.put(sig);

          request.onsuccess = () => {
            completed++;
            if (completed === total) {
              console.log(`[CacheDB] Cached ${total} signatures`);
              resolve();
            }
          };

          request.onerror = () => {
            console.error('[CacheDB] Failed to cache signature:', request.error);
            completed++;
            if (completed === total) {
              resolve();
            }
          };
        }

        if (total === 0) {
          resolve();
        }
      });
    } catch (error) {
      console.error('[CacheDB] Error caching signatures:', error);
    }
  }

  // ==========================================================================
  // Metadata Operations
  // ==========================================================================

  /**
   * Get metadata value
   */
  async getMetadata(key: string): Promise<string | number | null> {
    try {
      const db = await this.ensureInit();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_METADATA, 'readonly');
        const store = transaction.objectStore(STORE_METADATA);
        const request = store.get(key);

        request.onsuccess = () => {
          const meta = request.result as CacheMetadata | undefined;
          resolve(meta?.value ?? null);
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to get metadata:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error getting metadata:', error);
      return null;
    }
  }

  /**
   * Set metadata value
   */
  async setMetadata(key: string, value: string | number): Promise<void> {
    try {
      const db = await this.ensureInit();

      const meta: CacheMetadata = {
        key,
        value,
        updatedAt: Date.now(),
      };

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_METADATA, 'readwrite');
        const store = transaction.objectStore(STORE_METADATA);
        const request = store.put(meta);

        request.onsuccess = () => {
          resolve();
        };

        request.onerror = () => {
          console.error('[CacheDB] Failed to set metadata:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error('[CacheDB] Error setting metadata:', error);
    }
  }

  // ==========================================================================
  // Maintenance Operations
  // ==========================================================================

  /**
   * Clean up expired cache entries
   */
  async cleanupExpired(): Promise<void> {
    try {
      const db = await this.ensureInit();
      const now = Date.now();

      console.log('[CacheDB] Starting cleanup of expired entries...');

      // Clean messages
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
        const store = transaction.objectStore(STORE_MESSAGES);
        const index = store.index('expiresAt');
        const request = index.openCursor(IDBKeyRange.upperBound(now));

        let deleted = 0;
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            if (deleted > 0) {
              console.log(`[CacheDB] Deleted ${deleted} expired messages`);
            }
            resolve();
          }
        };

        request.onerror = () => resolve();
      });

      // Clean transactions
      await new Promise<void>((resolve) => {
        const transaction = db.transaction(STORE_TRANSACTIONS, 'readwrite');
        const store = transaction.objectStore(STORE_TRANSACTIONS);
        const index = store.index('expiresAt');
        const request = index.openCursor(IDBKeyRange.upperBound(now));

        let deleted = 0;
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor) {
            cursor.delete();
            deleted++;
            cursor.continue();
          } else {
            if (deleted > 0) {
              console.log(`[CacheDB] Deleted ${deleted} expired transactions`);
            }
            resolve();
          }
        };

        request.onerror = () => resolve();
      });

      console.log('[CacheDB] Cleanup completed');
    } catch (error) {
      console.error('[CacheDB] Error during cleanup:', error);
    }
  }

  /**
   * Clear all cache data
   */
  async clearAll(): Promise<void> {
    try {
      const db = await this.ensureInit();

      console.log('[CacheDB] Clearing all cache data...');

      await Promise.all([
        new Promise<void>((resolve) => {
          const transaction = db.transaction(STORE_MESSAGES, 'readwrite');
          const store = transaction.objectStore(STORE_MESSAGES);
          store.clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
        }),
        new Promise<void>((resolve) => {
          const transaction = db.transaction(STORE_TRANSACTIONS, 'readwrite');
          const store = transaction.objectStore(STORE_TRANSACTIONS);
          store.clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
        }),
        new Promise<void>((resolve) => {
          const transaction = db.transaction(STORE_SIGNATURES, 'readwrite');
          const store = transaction.objectStore(STORE_SIGNATURES);
          store.clear();
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => resolve();
        }),
      ]);

      console.log('[CacheDB] All cache data cleared');
    } catch (error) {
      console.error('[CacheDB] Error clearing cache:', error);
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
    try {
      const db = await this.ensureInit();

      const [messages, transactions, signatures] = await Promise.all([
        new Promise<number>((resolve) => {
          const transaction = db.transaction(STORE_MESSAGES, 'readonly');
          const store = transaction.objectStore(STORE_MESSAGES);
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(0);
        }),
        new Promise<number>((resolve) => {
          const transaction = db.transaction(STORE_TRANSACTIONS, 'readonly');
          const store = transaction.objectStore(STORE_TRANSACTIONS);
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(0);
        }),
        new Promise<number>((resolve) => {
          const transaction = db.transaction(STORE_SIGNATURES, 'readonly');
          const store = transaction.objectStore(STORE_SIGNATURES);
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(0);
        }),
      ]);

      return { messages, transactions, signatures };
    } catch (error) {
      console.error('[CacheDB] Error getting stats:', error);
      return { messages: 0, transactions: 0, signatures: 0 };
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

let dbInstance: CacheDB | null = null;

/**
 * Get the singleton cache database instance
 */
export function getCacheDB(): CacheDB {
  if (!dbInstance) {
    dbInstance = new CacheDB();
  }
  return dbInstance;
}

/**
 * Initialize the cache database (call once on app startup)
 */
export async function initCacheDB(): Promise<void> {
  const db = getCacheDB();
  await db.init();

  // Schedule periodic cleanup (every hour)
  if (typeof window !== 'undefined') {
    setInterval(() => {
      db.cleanupExpired().catch((error) => {
        console.error('[CacheDB] Scheduled cleanup failed:', error);
      });
    }, 60 * 60 * 1000);
  }
}
