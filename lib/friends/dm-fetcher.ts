import iqlabs from 'iqlabs-sdk';
import { readTableRows } from '@/lib/gateway/reader';
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

async function decryptIfNeeded(
  raw: Record<string, unknown>,
  walletAddress: string,
  signMessage?: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<Record<string, unknown>> {
  const text = typeof raw.text === 'string' ? raw.text : null;
  if (!text || !isEncryptedDm(text)) return raw;

  if (!signMessage) {
    return { ...raw, text: '[encrypted — key not available]' };
  }
  try {
    const kp = await getOrDeriveKeypair(walletAddress, signMessage);
    const decrypted = await decryptDmPayload(kp.privKey, kp.pubHex, text);
    if (decrypted && typeof decrypted === 'object') {
      return { ...raw, ...decrypted };
    }
    return { ...raw, text: '[unable to decrypt]' };
  } catch (err) {
    console.warn('[dm-fetcher] Decryption failed', err);
    return { ...raw, text: '[decryption failed]' };
  }
}

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

    let rawRows: Array<Record<string, unknown>>;
    if (fetchConfig?.signatures?.length) {
      // Targeted decode (realtime new messages): only fetch the specified signatures.
      rawRows = await iqlabs.reader.readTableRows(friend.tableAddress, {
        signatures: fetchConfig.signatures,
      });
    } else {
      // Bulk initial/refresh load via gateway /rows (SDK fallback when unavailable).
      rawRows = await readTableRows(friend.tableAddress, maxTx);
    }

    const messages: MessageRow[] = [];
    for (const raw of rawRows) {
      const signature =
        (raw as any).__txSignature ??
        (raw as any).txSignature ??
        (raw as any).signature;
      const withSig = signature ? { ...raw, __txSignature: signature } : raw;
      const decoded = await decryptIfNeeded(withSig as Record<string, unknown>, userAddress, signMessage);
      const message = rowToMessage(decoded);
      if (message.text || message.file) messages.push(message);
    }
    fetchConfig?.onProgress?.(messages);
    if (endpointSource === 'default') setChatSlowRpcMode(true);
    return messages;
  };
}
