import { readCodeIn, getSignaturesForTable } from '@/lib/gateway/reader';
import type { Friend } from '@/lib/friends/types';
import { dmChannelKeyToSeed } from '@/lib/shared/channel-utils';
import { rowToMessage, type MessageRow } from '@/lib/shared/message-helpers';
import type { FetchConfig } from '@/lib/shared/useMessageIndexLoader';
import { decryptDmPayload, isEncryptedDm, getOrDeriveKeypair } from '@/lib/crypto/dm-encryption';

type DmFetcherOptions = {
  userAddress: string | null;
  endpointSource: string;
  friendMapBySeedHex: Record<string, Friend>;
  setChatSlowRpcMode: (value: boolean) => void;
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>;
};

export function createDmFetcher({
  userAddress,
  endpointSource,
  friendMapBySeedHex,
  setChatSlowRpcMode,
  signMessage,
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
      : await getSignaturesForTable(friend.tableAddress, maxTx);

    const decodeRowsFromSignatures = async (
      signatures: string[],
      onProgress?: (rows: MessageRow[]) => void
    ) => {
      const messages: MessageRow[] = [];
      for (const signature of signatures) {
        let result: { data: string | null; metadata: string };
        try {
          result = await readCodeIn(signature);
        } catch (err) {
          if (err instanceof Error && (
            err.message.includes('instruction not found') ||
            err.message.includes('429') ||
            err.message.includes('Too Many Requests')
          )) {
            continue;
          }
          throw err;
        }
        const { data, metadata } = result;
        let row: Record<string, unknown>;
        if (!data) {
          row = { __txSignature: signature, metadata, data: null };
        } else if (isEncryptedDm(data)) {
          // Decrypt encrypted DM
          try {
            if (!signMessage) {
              row = { __txSignature: signature, metadata, text: '[encrypted — key not available]' };
            } else {
              const kp = await getOrDeriveKeypair(signMessage);
              const decrypted = await decryptDmPayload(kp.privKey, kp.pubHex, data);
              if (decrypted) {
                row = { ...decrypted, __txSignature: signature };
              } else {
                row = { __txSignature: signature, metadata, text: '[unable to decrypt]' };
              }
            }
          } catch (err) {
            console.warn('[dm-fetcher] Decryption failed for', signature, err);
            row = { __txSignature: signature, metadata, text: '[decryption failed]' };
          }
        } else {
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              row = { ...parsed, __txSignature: signature };
            } else {
              row = { __txSignature: signature, metadata, data };
            }
          } catch {
            row = { __txSignature: signature, metadata, data };
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
