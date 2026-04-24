import { readCodeIn, readTableRows } from '@/lib/gateway/reader';
import { rowToMessage, type MessageRow } from '@/lib/shared/message-helpers';
import { channelKeyToSeed } from '@/lib/shared/channel-utils';
import type { FetchConfig } from '@/lib/shared/useMessageIndexLoader';

type RoomLookup = {
  seedHex: string;
  tableAddress: string;
};

type MessageFetcherOptions = {
  endpointSource: string;
  rooms: RoomLookup[];
};

const inFlightDecodes = new Map<string, Promise<{ data: string | null; metadata: string } | null>>();
const memoryCache = new Map<string, { data: string | null; metadata: string } | null>();

function rowsToMessages(rows: Record<string, unknown>[]): MessageRow[] {
  const out: MessageRow[] = [];
  for (const raw of rows) {
    const signature =
      (raw as any).__txSignature ??
      (raw as any).txSignature ??
      (raw as any).signature;
    const row = signature ? { ...raw, __txSignature: signature } : raw;
    const message = rowToMessage(row);
    if (message.text || message.file) out.push(message);
  }
  return out;
}

export function createRoomFetcher({
  endpointSource,
  rooms,
}: MessageFetcherOptions) {
  return async (channelKey: string, fetchConfig?: FetchConfig): Promise<MessageRow[]> => {
    const seedHex = channelKeyToSeed(channelKey);
    const room = rooms.find((r) => r.seedHex === seedHex);
    if (!room) return [];
    const baseMaxTx = endpointSource === 'default' ? 20 : 40;
    const maxTx = fetchConfig?.maxTx ?? baseMaxTx;

    // Bulk initial/refresh load — CLI parity: one /rows call.
    if (!fetchConfig?.signatures?.length) {
      const rows = await readTableRows(room.tableAddress, maxTx);
      const messages = rowsToMessages(rows);
      fetchConfig?.onProgress?.(messages);
      return messages;
    }

    // Targeted per-signature decode — used for realtime new-message pushes and backfill.
    const knownSet = fetchConfig.knownSignatures instanceof Set
      ? fetchConfig.knownSignatures
      : new Set(fetchConfig.knownSignatures ?? []);
    const toProcess = fetchConfig.signatures.filter(sig => !knownSet.has(sig));

    const decodeSingleSignature = async (signature: string) => {
      if (memoryCache.has(signature)) return memoryCache.get(signature) ?? null;
      const inFlight = inFlightDecodes.get(signature);
      if (inFlight) return inFlight;

      const decodePromise = (async () => {
        try {
          const result = await readCodeIn(signature);
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
      inFlightDecodes.set(signature, decodePromise);
      try {
        return await decodePromise;
      } finally {
        inFlightDecodes.delete(signature);
      }
    };

    const messages: MessageRow[] = [];
    for (const signature of toProcess) {
      const result = await decodeSingleSignature(signature);
      if (!result) continue;
      const { data, metadata } = result;
      let row: Record<string, unknown>;
      if (!data) {
        row = { signature, metadata, data: null, __txSignature: signature };
      } else {
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          row = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? { ...parsed, __txSignature: signature }
            : { signature, metadata, data, __txSignature: signature };
        } catch {
          row = { signature, metadata, data, __txSignature: signature };
        }
      }
      const message = rowToMessage(row);
      if (message.text || message.file) {
        messages.push(message);
        fetchConfig.onProgress?.([...messages]);
      }
    }
    return messages;
  };
}
