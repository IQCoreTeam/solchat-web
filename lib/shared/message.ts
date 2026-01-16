import type { MessageRow } from './message-helpers';

export type MessagePayload = {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  file?: string;
  room?: string;
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

export function prunePendingMessages(
  pending: MessageRow[],
 confirmed: MessageRow[]
): MessageRow[] {
  const confirmedIds = new Set(confirmed.map((msg) => msg.id));
  if (!confirmedIds.size) return pending;
  return pending.filter((msg) => !confirmedIds.has(msg.id));
}
