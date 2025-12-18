/**
 * Message List Component
 * Displays a list of messages with loading states
 */

'use client';

import { RefObject, useEffect, useRef } from 'react';
import { LoadingSpinner } from '@/components/ui/loading-spinner';
import { MessageBubble } from '@/components/ui/message-bubble';
import { shorten } from '@/lib/utils/message-utils';

interface MessageRow {
    id: string;
    text: string;
    file?: string;
    signature?: string;
    sender?: string;
    senderAddress?: string;
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
    listRef?: RefObject<HTMLDivElement | null>;
    newMarkerId?: string | null;
    onMarkerVisible?: () => void;
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
    listRef,
    newMarkerId,
    onMarkerVisible,
    onCopyAddress,
    onDownloadAttachment,
    copiedMessageId,
}: MessageListProps) {
    const markerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!newMarkerId || !onMarkerVisible || !listRef?.current) return;
        const listEl = listRef.current;
        const checkPassed = () => {
            const markerEl = markerRef.current;
            if (!markerEl) return;
            const markerRect = markerEl.getBoundingClientRect();
            const listRect = listEl.getBoundingClientRect();
            const markerVisible = markerRect.top >= listRect.top && markerRect.top <= listRect.bottom;
            const markerAbove = markerRect.top < listRect.top;
            if (markerVisible || markerAbove) {
                onMarkerVisible();
            }
        };
        checkPassed();
        listEl.addEventListener('scroll', checkPassed, { passive: true });
        return () => {
            listEl.removeEventListener('scroll', checkPassed);
        };
    }, [newMarkerId, onMarkerVisible, listRef]);

    return (
        <div ref={(listRef as RefObject<HTMLDivElement>) ?? undefined} className="flex-1 overflow-y-auto px-3 py-3 md:px-6 md:py-4">
            {showLoadingSpinner && messages.length === 0 && (
                <LoadingSpinner message="Loading" />
            )}
            {error && <div>{error}</div>}
            {!isLoading && messages.length === 0 && !error && (
                <div>
                    {viewerAddress ? 'No messages yet. Be the first to say hello!' : 'Connect wallet first to see messages'}
                </div>
            )}
            <div className="space-y-4">
                {messages.map((message) => {
                    const resolvedSender = message.sender || message.senderAddress || '';
                    const displayAddress = resolvedSender ? shorten(resolvedSender) : '';
                    const isOwn = !!(resolvedSender && viewerAddress && resolvedSender === viewerAddress);
                    return (
                        <div key={message.id} className="space-y-3">
                            {newMarkerId && message.id === newMarkerId && (
                                <div className="flex items-center gap-2 text-xs text-emerald-200/80">
                                    <div className="flex-1 h-px bg-emerald-500/40" />
                                    <div ref={markerRef} className="px-3 py-1 rounded-full bg-emerald-900/60 border border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.35)]">
                                        New messages
                                    </div>
                                    <div className="flex-1 h-px bg-emerald-500/40" />
                                </div>
                            )}
                            <MessageBubble
                                {...message}
                                sender={displayAddress || resolvedSender}
                                senderAddress={resolvedSender}
                                displayName={message.displayName || displayAddress}
                                isOwn={isOwn}
                                viewerAddress={viewerAddress}
                                mode="chat"
                                onCopyAddress={onCopyAddress}
                                onDownloadAttachment={onDownloadAttachment}
                                copiedMessageId={copiedMessageId}
                            />
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
}
