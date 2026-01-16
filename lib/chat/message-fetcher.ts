import iqlabs from 'iqlabs-sdk/src';
import { rowToMessage, type MessageRow } from '@/lib/shared/message-helpers';
import { channelKeyToSeed } from '@/lib/shared/channel-utils';
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

// Global deduplication - stores promises for in-flight decodes
type DecodeResult = { data: string | null; metadata: string } | null;
const globalDecodePromises = new Map<string, Promise<DecodeResult>>();
const globalDecodedCache = new Map<string, DecodeResult>();

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
    const baseMaxTx = endpointSource === 'default' ? 20 : 40;
    const maxTx = fetchConfig?.maxTx ?? baseMaxTx;
    const targetSignatures = fetchConfig?.signatures?.length
      ? fetchConfig.signatures
      : (await iqlabs.reader.fetchAccountTransactions(room.tableAddress, { limit: maxTx }))
          .map((sig) => sig.signature);

    // Helper to decode a single signature with deduplication
    const decodeSingleSignature = async (signature: string): Promise<DecodeResult> => {
      // Check cache first
      if (globalDecodedCache.has(signature)) {
        return globalDecodedCache.get(signature)!;
      }

      // Check if already in-flight - wait for it instead of making duplicate request
      const inFlight = globalDecodePromises.get(signature);
      if (inFlight) {
        return inFlight;
      }

      // Start new decode and track the promise
      const decodePromise = (async (): Promise<DecodeResult> => {
        try {
          const result = await iqlabs.reader.readCodeIn(signature);
          globalDecodedCache.set(signature, result);
          return result;
        } catch (err) {
          if (err instanceof Error && err.message.includes('user_inventory_code_in instruction not found')) {
            globalDecodedCache.set(signature, null);
            return null;
          }
          throw err;
        } finally {
          globalDecodePromises.delete(signature);
        }
      })();

      globalDecodePromises.set(signature, decodePromise);
      return decodePromise;
    };

    const decodeRowsFromSignatures = async (
      signatures: string[],
      onProgress?: (rows: MessageRow[]) => void
    ) => {
      // Filter out already-known signatures to avoid redundant RPC calls
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
      // slowRpcMode is derived from endpointSource in the component, no need to set
    });
    return messages;
  };
}
