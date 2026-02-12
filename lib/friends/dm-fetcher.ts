import iqlabs from 'iqlabs-sdk';
import type { Friend } from '@/lib/friends/types';
import { dmChannelKeyToSeed } from '@/lib/shared/channel-utils';
import { rowToMessage, type MessageRow } from '@/lib/shared/message-helpers';
import type { FetchConfig } from '@/lib/shared/useMessageIndexLoader';

type DmFetcherOptions = {
  userAddress: string | null;
  endpointSource: string;
  friendMapBySeedHex: Record<string, Friend>;
  setChatSlowRpcMode: (value: boolean) => void;
};

export function createDmFetcher({
  userAddress,
  endpointSource,
  friendMapBySeedHex,
  setChatSlowRpcMode,
}: DmFetcherOptions) {
  return async (channelKey: string, fetchConfig?: FetchConfig): Promise<MessageRow[]> => {
    if (!userAddress) return [];
    const seedHex = dmChannelKeyToSeed(channelKey);
    const friend = friendMapBySeedHex[seedHex];
    if (!friend) return [];

    const baseMaxTx = endpointSource === 'default' ? 40 : 200;
    const maxTx = fetchConfig?.maxTx ?? baseMaxTx;
    const targetSignatures = fetchConfig?.signatures?.length
      ? fetchConfig.signatures
      : await iqlabs.reader.collectSignatures(friend.tableAddress, maxTx);

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
      if (endpointSource === 'default') {
        setChatSlowRpcMode(true);
      }
    });

    return messages;
  };
}
