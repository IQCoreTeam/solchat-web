/**
 * Message Bubble Component
 * Unified message display component used across chat rooms, DMs, and friend chats
 */

'use client';

import { useState } from 'react';
import { getInitials, shorten, formatTimestamp, formatFullTimestamp, deriveAvatarHue } from '@/lib/utils/message-utils';
import { AttachmentPreview } from '@/components/ui/attachment-preview';

export interface MessageBubbleProps {
    // Message data
    id: string;
    text: string;
    sender?: string;
    displayName?: string;
    avatarHue?: number;
    timestamp?: number;
    status?: 'pending' | 'sent' | 'confirmed' | 'failed';
    signature?: string;
    file?: string;

    // Display options
    isOwn: boolean;
    viewerAddress?: string;
    mode?: 'chat' | 'dm' | 'friend';
    showFullTimestamp?: boolean;

    // Callbacks
    onCopyAddress?: (address: string, messageId: string) => void;
    onDownloadAttachment?: (url: string) => void;

    // State
    copiedMessageId?: string | null;
    className?: string;
}

export function MessageBubble({
    id,
    text,
    sender,
    displayName,
    avatarHue: propAvatarHue,
    timestamp,
    status = 'confirmed',
    signature,
    file,
    isOwn,
    viewerAddress,
    mode = 'chat',
    showFullTimestamp = false,
    onCopyAddress,
    onDownloadAttachment,
    copiedMessageId,
    className = '',
}: MessageBubbleProps) {
    const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);

    // Derive values
    const bubbleName = isOwn ? 'You' : displayName || (sender ? shorten(sender) : 'Unknown');
    const avatarHue = propAvatarHue ?? deriveAvatarHue(sender || bubbleName);
    const isPending = status === 'pending';
    const avatarStyle = { backgroundColor: `hsl(${avatarHue}, 65%, 48%)` };
    const formattedTime = showFullTimestamp ? formatFullTimestamp(timestamp) : formatTimestamp(timestamp);

    // Message bubble styling based on mode and state
    const bubbleStyle = isOwn
        ? isPending
            ? { backgroundColor: 'rgba(65, 255, 0, 0.15)', borderColor: 'rgba(255, 255, 0, 0.6)' }
            : mode === 'dm'
                ? { backgroundColor: 'rgba(65, 255, 0, 0.15)', borderColor: 'rgba(65, 255, 0, 0.4)' }
                : { backgroundColor: 'rgba(65, 255, 0, 0.2)', borderColor: 'rgba(65, 255, 0, 0.6)' }
        : { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' };

    const handleToggleAttachment = () => {
        setIsAttachmentOpen(!isAttachmentOpen);

        // Scroll to message bubble after opening attachment
        if (!isAttachmentOpen) {
            setTimeout(() => {
                const element = document.getElementById(`message-${id}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'end' });
                }
            }, 100);
        }
    };

    return (
        <div
            id={`message-${id}`}
            className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'} ${className}`}
        >
            <div
                className={`flex max-w-[90%] md:max-w-[80%] min-w-0 items-end gap-2 md:gap-3 ${isOwn ? 'flex-row-reverse text-right' : 'text-left'
                    }`}
            >
                {/* Avatar */}
                <div
                    className="flex h-8 w-8 md:h-9 md:w-9 flex-shrink-0 items-center justify-center rounded-full text-xs md:text-sm font-semibold text-white shadow-lg"
                    style={avatarStyle}
                >
                    {getInitials(bubbleName)}
                </div>

                {/* Message content */}
                <div
                    className="rounded-2xl border px-3 py-2 md:px-4 md:py-3 text-white"
                    style={bubbleStyle}
                >
                    {/* Sender info */}
                    <div className="mb-1 flex items-center gap-2 text-xs md:text-[11px] uppercase tracking-wide text-white/70">
                        <span>{bubbleName}</span>

                        {/* Copy address button (chat mode only) */}
                        {sender && onCopyAddress && mode === 'chat' && (
                            <button
                                type="button"
                                onClick={() => onCopyAddress(sender, id)}
                                className="group relative flex items-center justify-center w-4 h-4 hover:bg-white/10 transition-colors border border-white/10 rounded"
                                title="Copy wallet address"
                            >
                                <svg
                                    className={`w-2.5 h-2.5 transition-all duration-300 ${copiedMessageId === id
                                            ? 'scale-0 opacity-0'
                                            : 'scale-100 opacity-100 text-white/50 group-hover:text-white/70'
                                        }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                </svg>
                                <svg
                                    className={`absolute w-2.5 h-2.5 transition-all duration-300 text-white/70 ${copiedMessageId === id ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                                        }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M5 13l4 4L19 7"
                                    />
                                </svg>
                            </button>
                        )}

                        {/* Sender address (DM mode) */}
                        {sender && mode === 'dm' && (
                            <span className="text-white/40">{shorten(sender)}</span>
                        )}

                        {/* Timestamp */}
                        {formattedTime && <span className="text-white/40">· {formattedTime}</span>}

                        {/* Pending indicator */}
                        {isPending && mode === 'friend' && (
                            <span className="text-yellow-500">· {status === 'pending' ? 'Pending' : 'Sent'}</span>
                        )}
                    </div>

                    {/* Message text */}
                    <div className="text-sm leading-relaxed break-all whitespace-pre-wrap">
                        {text || '[empty]'}
                    </div>

                    {/* Attachment section (chat and friend modes) */}
                    {file && (mode === 'chat' || mode === 'friend') && (
                        <div className="mt-3 space-y-2 text-left">
                            {!isAttachmentOpen && (
                                <button
                                    type="button"
                                    onClick={handleToggleAttachment}
                                    className="text-[11px] uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                                >
                                    Load attachment
                                </button>
                            )}
                            {isAttachmentOpen && (
                                <div id={`attachment-${id}`}>
                                    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                                        <AttachmentPreview url={file} />
                                    </div>
                                    <div className="flex gap-4 items-center">
                                        <button
                                            type="button"
                                            onClick={handleToggleAttachment}
                                            className="text-[11px] uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                                        >
                                            Hide attachment
                                        </button>
                                        {onDownloadAttachment && (
                                            <button
                                                type="button"
                                                onClick={() => onDownloadAttachment(file)}
                                                className="text-[11px] uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                                            >
                                                Download
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Message metadata (chat mode only) */}
                    {mode === 'chat' && (
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-white/50">
                            <span>#{id.slice(0, 6)}</span>
                            <span>·</span>
                            <span>
                                {isPending
                                    ? 'Processing…'
                                    : signature
                                        ? `Confirmed · ${shorten(signature)}`
                                        : 'Confirmed'}
                            </span>
                        </div>
                    )}

                    {/* Simple status for DM/friend modes */}
                    {(mode === 'dm' || mode === 'friend') && (
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
                            {mode === 'dm' && formattedTime && <span>{formattedTime}</span>}
                            {mode === 'dm' && formattedTime && <span>·</span>}
                            <span>{isPending ? 'Pending' : 'Confirmed'}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
