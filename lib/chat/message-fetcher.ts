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

    const decodeRowsFromSignatures = async (
      signatures: string[],
      onProgress?: (rows: MessageRow[]) => void
    ) => {
      const messages: MessageRow[] = [];
      for (const signature of signatures) {
        let result: { data: string | null; metadata: string };
        try {
          result = await iqlabs.reader.readCodeIn(signature);
        } catch (err) {
          if (err instanceof Error && err.message.includes('user_inventory_code_in instruction not found')) {
            continue;
          }
          throw err;
        }
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
