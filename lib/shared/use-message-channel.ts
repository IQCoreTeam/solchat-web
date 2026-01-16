import { useMemo } from 'react';
import type { usePendingMessages } from '@/lib/shared/use-pending-messages';
import { mergeMessages } from '@/lib/shared/message';
import { useMessageReader, type UseMessageReaderOptions } from '@/lib/shared/use-message-reader';
import { useMessageSender, type UseMessageSenderOptions } from '@/lib/shared/use-message-sender';

type PendingState = ReturnType<typeof usePendingMessages>;

type UseMessageChannelOptions = {
  reader: UseMessageReaderOptions;
  pending: PendingState;
  sender: Omit<UseMessageSenderOptions, 'addPendingMessage'>;
};

export function useMessageChannel({ reader, pending, sender }: UseMessageChannelOptions) {
  const readerState = useMessageReader(reader);
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
