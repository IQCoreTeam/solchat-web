/**
 * Message List Component
 * Displays a list of messages with loading states
 */

'use client';

import { RefObject } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { MessageBubble } from '@/components/ui/message-bubble';

interface MessageRow {
    id: string;
    text: string;
    file?: string;
    signature?: string;
    sender?: string;
    displayName?: string;
    avatarHue?: number;
    timestamp?: number;
    status?: 'pending' | 'sent' | 'confirmed' | 'failed';
    room?: string;
}

interface MessageListProps {
    messages: MessageRow[];
    isLoading: boolean;
    showLoadingSpinner: boolean;
    error: string | null;
    viewerAddress: string;
    messagesEndRef: RefObject<HTMLDivElement | null>;
    onCopyAddress: (address: string, messageId: string) => void;
    onDownloadAttachment: (url: string) => void;
    copiedMessageId: string | null;
}

export function MessageList({
    messages,
    isLoading,
    showLoadingSpinner,
    error,
    viewerAddress,
    messagesEndRef,
    onCopyAddress,
    onDownloadAttachment,
    copiedMessageId,
}: MessageListProps) {
    return (
        <div className="flex-1 overflow-y-auto bg-black/20 px-3 py-3 md:px-6 md:py-4">
            {showLoadingSpinner && messages.length === 0 && (
                <LoadingSpinner message="Loading" color="rgb(65, 255, 0)" />
            )}
            {error && <div className="text-red-400">{error}</div>}
            {!isLoading && messages.length === 0 && !error && (
                <div className="text-white/50">No messages yet. Be the first to say hello!</div>
            )}
            <div className="space-y-4">
                {messages.map((message) => {
                    const isOwn = message.sender && viewerAddress && message.sender === viewerAddress;
                    return (
                        <MessageBubble
                            key={message.id}
                            {...message}
                            isOwn={isOwn}
                            viewerAddress={viewerAddress}
                            mode="chat"
                            onCopyAddress={onCopyAddress}
                            onDownloadAttachment={onDownloadAttachment}
                            copiedMessageId={copiedMessageId}
                        />
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
