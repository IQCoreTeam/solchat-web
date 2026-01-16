import iqlabs from 'iqlabs-sdk/src';
import { rowToMessage, type MessageRow } from '@/lib/shared/message-helpers';
import { channelKeyToSeed } from '@/lib/shared/channel-utils';
import { getCacheManager } from '@/lib/cache';
import type { FetchConfig } from '@/lib/shared/useMessageIndexLoader';

type RoomLookup = {
  seedHex: string;
  tableAddress: string;
};

type MessageFetcherOptions = {
  walletAddress: string;
  endpointSource: string;
  rooms: RoomLookup[];
};

// In-flight promise tracking for deduplication (prevents duplicate concurrent requests)
const inFlightDecodes = new Map<string, Promise<{ data: string | null; metadata: string } | null>>();

// Fast in-memory cache layer (instant access, survives IndexedDB write race conditions)
// IndexedDB writes are async - this prevents duplicate fetches while write is pending
const memoryCache = new Map<string, { data: string | null; metadata: string } | null>();

export function createRoomFetcher({
  walletAddress,
  endpointSource,
  rooms,
}: MessageFetcherOptions) {
  return async (channelKey: string, fetchConfig?: FetchConfig): Promise<MessageRow[]> => {
    if (!walletAddress) return [];
    const seedHex = channelKeyToSeed(channelKey);
    const room = rooms.find((r) => r.seedHex === seedHex);
    if (!room) return [];
    const roomId = `room:${seedHex}`;
    const baseMaxTx = endpointSource === 'default' ? 20 : 40;
    const maxTx = fetchConfig?.maxTx ?? baseMaxTx;
    const targetSignatures = fetchConfig?.signatures?.length
      ? fetchConfig.signatures
      : (await iqlabs.reader.fetchAccountTransactions(room.tableAddress, { limit: maxTx }))
          .map((sig) => sig.signature);

    const cacheManager = getCacheManager();

    // Decode a single signature using multi-layer cache (memory -> IndexedDB -> network)
    const decodeSingleSignature = async (signature: string): Promise<{ data: string | null; metadata: string } | null> => {
      // L1: Fast memory cache (instant, synchronous)
      if (memoryCache.has(signature)) {
        return memoryCache.get(signature) ?? null;
      }

      // Check if request is already in-flight (deduplication)
      const inFlight = inFlightDecodes.get(signature);
      if (inFlight) {
        return inFlight;
      }

      // Create the decode promise
      const decodePromise = (async () => {
        try {
          // L2: IndexedDB cache, L3: Network fetch
          const { data: cachedData, fromCache } = await cacheManager.loadTransaction(
            signature,
            roomId,
            async () => {
              try {
                const result = await iqlabs.reader.readCodeIn(signature);
                return result;
              } catch (err) {
                if (err instanceof Error && err.message.includes('user_inventory_code_in instruction not found')) {
                  return null;
                }
                throw err;
              }
            }
          );

          const result = cachedData as { data: string | null; metadata: string } | null;

          // Populate memory cache immediately (before async IndexedDB write completes)
          memoryCache.set(signature, result);

          return result;
        } catch (err) {
          if (err instanceof Error && err.message.includes('user_inventory_code_in instruction not found')) {
            memoryCache.set(signature, null);
            return null;
          }
          throw err;
        }
      })();

      // Track in-flight request
      inFlightDecodes.set(signature, decodePromise);

      try {
        return await decodePromise;
      } finally {
        inFlightDecodes.delete(signature);
      }
    };

    const decodeRowsFromSignatures = async (
      signatures: string[],
      onProgress?: (rows: MessageRow[]) => void
    ) => {
      // Filter out already-known signatures to avoid redundant decodes
      const knownSet = fetchConfig?.knownSignatures instanceof Set
        ? fetchConfig.knownSignatures
        : new Set(fetchConfig?.knownSignatures ?? []);

      const toProcess = signatures.filter(sig => !knownSet.has(sig));

      const messages: MessageRow[] = [];
      for (const signature of toProcess) {
        const result = await decodeSingleSignature(signature);

        if (!result) continue;

        const { data, metadata } = result;
        let row: Record<string, unknown>;
        if (!data) {
          row = { signature, metadata, data: null };
        } else {
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              row = { ...parsed, __txSignature: signature };
            } else {
              row = { signature, metadata, data };
            }
          } catch {
            row = { signature, metadata, data };
          }
        }
        const message = rowToMessage(row);
        if (message.text || message.file) {
          messages.push(message);
          onProgress?.([...messages]);
        }
      }
      return messages;
    };

    const messages = await decodeRowsFromSignatures(targetSignatures, (partial) => {
      fetchConfig?.onProgress?.(partial);
    });
    return messages;
  };
}
