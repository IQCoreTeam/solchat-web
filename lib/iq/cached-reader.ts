/**
 * Cached IQ Reader
 *
 * Adds transaction caching to IQ reader functions for better performance.
 */

'use client';

import { getCacheManager } from '@/lib/cache/cache-manager';
import { reconstructMessageFromChain } from './reader';
import type { Connection, ConfirmedSignatureInfo, PublicKey } from '@solana/web3.js';

export interface ChatMessage {
  handle: string;
  message: string;
  timestamp: number;
  signature: string;
}

/**
 * Read chat message with caching
 */
export async function readChatCached(
  signature: string,
  connection: Connection
): Promise<string | null> {
  try {
    const shortSig = signature.substring(0, 20);
    console.log(`[readChatCached] ${shortSig}... - loading with cache`);

    const manager = getCacheManager();

    if (!manager.isReady()) {
      console.log('[readChatCached] Cache not ready, falling back to direct read');
      return await reconstructMessageFromChain(connection, signature);
    }

    // Try to load from cache with network fallback
    const result = await manager.loadTransaction(
      signature,
      'iq-chat',
      () => reconstructMessageFromChain(connection, signature)
    );

    if (result.fromCache) {
      console.log(`[readChatCached] ${shortSig}... - cache hit`);
    } else {
      console.log(`[readChatCached] ${shortSig}... - fetched from network`);
    }

    return result.data;
  } catch (error) {
    console.error('[readChatCached] Failed to read chat:', error);
    // Fallback to direct read
    return await reconstructMessageFromChain(connection, signature);
  }
}

/**
 * Get signatures with caching
 */
export async function fetchDataSignaturesCached(
  connection: Connection,
  accountPubkey: PublicKey,
  limit: number = 10
): Promise<ConfirmedSignatureInfo[]> {
  try {
    const accountAddress = accountPubkey.toBase58();
    console.log(`[fetchDataSignaturesCached] Loading signatures for ${accountAddress.slice(0, 8)}...`);

    const manager = getCacheManager();

    if (!manager.isReady()) {
      console.log('[fetchDataSignaturesCached] Cache not ready, falling back to direct fetch');
      return await connection.getSignaturesForAddress(accountPubkey, { limit }, 'confirmed');
    }

    // Try to load from cache with network fallback
    const result = await manager.loadSignatures(
      accountAddress,
      () => connection.getSignaturesForAddress(accountPubkey, { limit }, 'confirmed'),
      limit
    );

    if (result.fromCache) {
      console.log(`[fetchDataSignaturesCached] Cache hit: ${result.signatures.length} signatures`);
    } else {
      console.log(`[fetchDataSignaturesCached] Fetched ${result.signatures.length} signatures from network`);
    }

    return result.signatures;
  } catch (error) {
    console.error('[fetchDataSignaturesCached] Failed to fetch signatures:', error);
    // Fallback to direct fetch
    return await connection.getSignaturesForAddress(accountPubkey, { limit }, 'confirmed');
  }
}

/**
 * Get chat history with caching
 */
export async function getChatRecordsCached(
  connection: Connection,
  pdaString: string,
  limit: number = 10
): Promise<ChatMessage[]> {
  try {
    const pda = new (await import('@solana/web3.js')).PublicKey(pdaString);
    const signatures = await fetchDataSignaturesCached(connection, pda, limit);

    console.log(`[getChatRecordsCached] Found ${signatures.length} signatures`);

    const messages: ChatMessage[] = [];

    // Process messages in parallel with timeout
    const messagePromises = signatures.reverse().map(async (sig) => {
      try {
        // Add 10 second timeout per message
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );

        const messagePromise = readChatCached(sig.signature, connection);

        const message = await Promise.race([messagePromise, timeoutPromise]) as string | null;

        if (message) {
          return {
            handle: 'User',
            message,
            timestamp: sig.blockTime || Date.now() / 1000,
            signature: sig.signature,
          };
        }
        return null;
      } catch (error) {
        console.error('[getChatRecordsCached] Failed to read message:', sig.signature.substring(0, 20), error);
        return null;
      }
    });

    const results = await Promise.all(messagePromises);

    // Filter out nulls
    for (const result of results) {
      if (result) {
        messages.push(result);
      }
    }

    console.log(`[getChatRecordsCached] Successfully loaded ${messages.length} messages`);
    return messages;
  } catch (error) {
    console.error('[getChatRecordsCached] Failed to get chat records:', error);
    return [];
  }
}

/**
 * Invalidate transaction cache
 */
export async function invalidateTransactionCache(signature: string): Promise<void> {
  const manager = getCacheManager();
  // Transactions are stored with their signature as key
  // We don't have a direct invalidate method for single transactions yet
  // but this is a placeholder for future implementation
  console.log(`[CachedIQ] Would invalidate transaction cache for: ${signature.slice(0, 8)}...`);
}
