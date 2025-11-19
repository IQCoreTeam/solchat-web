/**
 * Friend Chat Modal Component
 * Modal for viewing and sending DM messages to friends
 */

'use client';

import { FormEvent, useRef, useEffect } from 'react';
import { Button } from 'react95';
import type { Friend } from '@/lib/friends/types';
import type { Row } from '@/lib/onchainDB/web/cached-reader-integration';
import { shorten, formatFullTimestamp } from '@/lib/utils/message-utils';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

interface FriendChatModalProps {
    isOpen: boolean;
    friend: Friend;
    userAddress: string;
    messages: Row[];
    messageInput: string;
    isLoading: boolean;
    isSending: boolean;
    error: string | null;
    canSend: boolean;
    isRequester: boolean;
    writerCtx: any;
    onClose: () => void;
    onSendMessage: (e: FormEvent) => void;
    onInputChange: (value: string) => void;
}

export function FriendChatModal({
    isOpen,
    friend,
    userAddress,
    messages,
    messageInput,
    isLoading,
    isSending,
    error,
    canSend,
    isRequester,
    writerCtx,
    onClose,
    onSendMessage,
    onInputChange,
}: FriendChatModalProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when messages change
    useEffect(() => {
        if (isOpen && messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'instant' });
        }
    }, [messages, isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
            <div className="bg-black border-2 border-green-700 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col">
                {/* Header */}
                <div className="border-b border-green-700/50 px-4 py-3 flex items-center justify-between flex-shrink-0">
                    <h3 className="text-green-400 font-bold">
                        DM with {shorten(friend.address)}
                    </h3>
                    <Button onClick={onClose} size="sm" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                        X
                    </Button>
                </div>

                {/* Info banner */}
                <div className="border-b border-green-700/30 bg-black/60 px-4 py-2 text-xs text-green-600 flex-shrink-0">
                    <div className="mb-1">
                        <span className="text-green-500">Table:</span> {shorten(friend.tableAddress)}
                    </div>
                    <div className="mb-1 break-all">
                        <span className="text-green-500">Seed:</span> {friend.dmSeedHex}
                    </div>
                    <div>
                        <span className="text-green-500">Status:</span>{' '}
                        <span className="uppercase">{friend.status}</span>
                        {friend.status === 'pending' &&
                            (isRequester
                                ? ' (waiting for approval)'
                                : ' (approve to reply)')}
                        {friend.status === 'blocked' && ' (unblock to continue)'}
                    </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
                    {isLoading && messages.length === 0 ? (
                        <LoadingSpinner variant="progress-bar" message="Loading messages" />
                    ) : error ? (
                        <p className="text-red-400 text-sm">Error: {error}</p>
                    ) : !isLoading && messages.length === 0 && !error ? (
                        <p className="text-green-600 text-sm">No messages yet. Start the conversation!</p>
                    ) : null}
                    {messages.map((row, index) => {
                        const meta = row as Record<string, any>;
                        const key = meta.__rowId ?? meta.id ?? meta.signature ?? index;
                        const sender = meta.sender ?? meta.author ?? 'Unknown';
                        const textContent =
                            typeof meta.text === 'string'
                                ? meta.text
                                : typeof meta.message === 'string'
                                    ? meta.message
                                    : JSON.stringify(meta);
                        const tsValue = meta.timestamp ?? meta.createdAt ?? meta.time;
                        const formattedTime = formatFullTimestamp(
                            typeof tsValue === 'number'
                                ? tsValue
                                : typeof tsValue === 'string' && tsValue
                                    ? Number(tsValue)
                                    : undefined
                        );
                        const isSender = sender === userAddress;
                        const messageStatus = meta.status === 'pending' ? 'Pending' : 'Sent';
                        const isPending = meta.status === 'pending';
                        return (
                            <div
                                key={key}
                                className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}
                            >
                                <div
                                    className={`max-w-[80%] rounded-lg px-3 py-2 ${isSender
                                        ? isPending
                                            ? 'bg-green-900/30 border border-yellow-600'
                                            : 'bg-green-900/50 border border-green-700'
                                        : 'bg-green-900/20 border border-green-800'
                                        }`}
                                >
                                    <div className="flex items-center gap-2 mb-1 text-xs text-green-600">
                                        <span>{shorten(sender, 6)}</span>
                                        {formattedTime && <span>• {formattedTime}</span>}
                                        {isPending && <span className="text-yellow-500">• {messageStatus}</span>}
                                    </div>
                                    <p className="text-green-300 text-sm whitespace-pre-wrap break-words">
                                        {textContent}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input form */}
                <form onSubmit={onSendMessage} className="border-t border-green-700/50 bg-black/70 px-4 py-3 flex flex-col gap-2 rounded-b-xl flex-shrink-0">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={messageInput}
                            onChange={(e) => onInputChange(e.target.value)}
                            placeholder="Type your message..."
                            disabled={!writerCtx || !canSend}
                            className="flex-1 bg-black border-2 border-green-700 text-green-400 px-3 py-2 rounded text-sm focus:border-green-500 focus:outline-none placeholder:text-green-900 disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={
                                !writerCtx ||
                                !messageInput.trim() ||
                                !canSend ||
                                isSending
                            }
                            className="bg-green-700 hover:bg-green-600 disabled:bg-green-900 disabled:opacity-50 text-green-100 px-4 py-2 rounded text-sm transition-colors"
                        >
                            {isSending ? 'Sending...' : 'Send'}
                        </button>
                    </div>
                    {!writerCtx && (
                        <p className="text-yellow-500 text-xs">
                            Connect your wallet to send messages
                        </p>
                    )}
                    {!canSend && writerCtx && (
                        <p className="text-yellow-500 text-xs">
                            {friend.status === 'pending'
                                ? isRequester
                                    ? 'Request pending. Waiting for approval from the recipient.'
                                    : 'Approve this request before replying.'
                                : 'Unblock this DM to continue the conversation.'}
                        </p>
                    )}
                </form>
            </div>
        </div>
    );
}
