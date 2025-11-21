import { useCallback, useState } from 'react';
import type { MessageRow } from '@/lib/onchainDB/utils/message-helpers';
import { createPendingMessage, prunePendingMessages, type MessagePayload } from './message';

type PendingMessagesHookReturn = {
  pendingMessages: MessageRow[];
  addPendingMessage: (payload: MessagePayload) => void;
  pruneConfirmedMessages: (confirmed: MessageRow[]) => void;
  removePendingMessage: (id: string) => void;
  resetPendingMessages: () => void;
};

export function usePendingMessages(): PendingMessagesHookReturn {
  const [pendingMessages, setPendingMessages] = useState<MessageRow[]>([]);

  const addPendingMessage = useCallback((payload: MessagePayload) => {
    setPendingMessages((prev) => [...prev, createPendingMessage(payload)]);
  }, []);

  const pruneConfirmedMessages = useCallback((confirmed: MessageRow[]) => {
    if (!confirmed.length) return;
    setPendingMessages((prev) => prunePendingMessages(prev, confirmed));
  }, []);

  const removePendingMessage = useCallback((id: string) => {
    setPendingMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  const resetPendingMessages = useCallback(() => {
    setPendingMessages([]);
  }, []);

  return {
    pendingMessages,
    addPendingMessage,
    pruneConfirmedMessages,
    removePendingMessage,
    resetPendingMessages,
  };
}
