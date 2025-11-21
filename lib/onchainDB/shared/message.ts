import type { MessageRow } from '@/lib/onchainDB/utils/message-helpers';

export type MessagePayload = {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  file?: string;
};

export function mergeMessages(
  confirmed: MessageRow[],
  pending: MessageRow[]
): MessageRow[] {
  const byId = new Map<string, MessageRow>();
  pending.forEach((msg) => {
    byId.set(msg.id, msg);
  });
  confirmed.forEach((msg) => {
    byId.set(msg.id, msg);
  });
  return Array.from(byId.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

export function createPendingMessage(payload: MessagePayload): MessageRow {
  return {
    id: payload.id,
    text: payload.text,
    sender: payload.sender,
    timestamp: payload.timestamp,
    file: payload.file,
    status: 'pending',
  };
}

export function prunePendingMessages(
  pending: MessageRow[],
  confirmed: MessageRow[]
): MessageRow[] {
  const confirmedIds = new Set(confirmed.map((msg) => msg.id));
  if (!confirmedIds.size) return pending;
  return pending.filter((msg) => !confirmedIds.has(msg.id));
}
