import { useCallback } from 'react';
import type { FormEvent } from 'react';
import { normalizeFileUrl } from '@/lib/utils/message-utils';
import type { MessagePayload } from '@/lib/shared/message';

type CanSendResult = {
  ok: boolean;
  errorMessage?: string;
};

export type UseMessageSenderOptions = {
  messageInput: string;
  attachmentUrl: string;
  setMessageInput: (value: string) => void;
  setAttachmentUrl: (value: string) => void;
  setAttachmentError: (value: string | null) => void;
  setShowAttachmentInput: (value: boolean) => void;
  setActionError?: (value: string | null) => void;
  getSender: () => string;
  getMessageId: () => string;
  canSend?: () => CanSendResult;
  addPendingMessage: (payload: MessagePayload) => void;
  writeMessage: (payload: MessagePayload) => Promise<string | undefined>;
  onBeforeSend?: (payload: MessagePayload, timestamp: number) => void;
  onAfterSuccess?: (payload: MessagePayload, signature?: string) => void;
  onAfterError?: (error: unknown, payload: MessagePayload) => void;
  onAfterAttempt?: (payload: MessagePayload) => void;
};

export function useMessageSender({
  messageInput,
  attachmentUrl,
  setMessageInput,
  setAttachmentUrl,
  setAttachmentError,
  setShowAttachmentInput,
  setActionError,
  getSender,
  getMessageId,
  canSend,
  addPendingMessage,
  writeMessage,
  onBeforeSend,
  onAfterSuccess,
  onAfterError,
  onAfterAttempt,
}: UseMessageSenderOptions) {
  const sendMessage = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();

      const text = messageInput.trim();
      if (!text) return;

      if (canSend) {
        const result = canSend();
        if (!result.ok) {
          if (result.errorMessage && setActionError) {
            setActionError(result.errorMessage);
          }
          return;
        }
      }

      const fileUrl = normalizeFileUrl(attachmentUrl);
      if (attachmentUrl.trim() && !fileUrl) {
        setAttachmentError('Invalid attachment URL. Must be a valid https:// link.');
        return;
      }

      const messageId = getMessageId();
      const timestamp = Date.now();
      const sender = getSender();
      const payload: MessagePayload = {
        id: messageId,
        text,
        sender,
        timestamp,
      };

      if (fileUrl) {
        payload.file = fileUrl;
      }

      setMessageInput('');
      setAttachmentUrl('');
      setAttachmentError(null);
      setShowAttachmentInput(false);
      if (setActionError) {
        setActionError(null);
      }

      onBeforeSend?.(payload, timestamp);
      addPendingMessage(payload);

      try {
        const signature = await writeMessage(payload);
        onAfterSuccess?.(payload, signature);
      } catch (error) {
        onAfterError?.(error, payload);
      } finally {
        onAfterAttempt?.(payload);
      }
    },
    [
      addPendingMessage,
      attachmentUrl,
      canSend,
      getMessageId,
      getSender,
      messageInput,
      onAfterAttempt,
      onAfterError,
      onAfterSuccess,
      onBeforeSend,
      setActionError,
      setAttachmentError,
      setAttachmentUrl,
      setMessageInput,
      setShowAttachmentInput,
      writeMessage,
    ]
  );

  return sendMessage;
}
