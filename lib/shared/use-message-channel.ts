import { useMemo } from 'react';
import type { usePendingMessages } from '@/lib/shared/use-pending-messages';
import { mergeMessages } from '@/lib/shared/message';
import { useMessageIndexLoader } from '@/lib/shared/useMessageIndexLoader';
import { useMessageSender, type UseMessageSenderOptions } from '@/lib/shared/use-message-sender';

type PendingState = ReturnType<typeof usePendingMessages>;

type UseMessageChannelOptions = {
  reader: Parameters<typeof useMessageIndexLoader>[0];
  pending: PendingState;
  sender: Omit<UseMessageSenderOptions, 'addPendingMessage'>;
};

export function useMessageChannel({ reader, pending, sender }: UseMessageChannelOptions) {
  const readerState = useMessageIndexLoader(reader);
  const mergedMessages = useMemo(
    () => mergeMessages(readerState.messages, pending.pendingMessages),
    [readerState.messages, pending.pendingMessages]
  );

  const sendMessage = useMessageSender({
    ...sender,
    addPendingMessage: pending.addPendingMessage,
  });

  return {
    ...readerState,
    ...pending,
    mergedMessages,
    sendMessage,
  };
}
