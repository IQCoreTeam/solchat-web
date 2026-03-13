/**
 * Message Bubble Component
 * Unified message display component used across chat rooms, DMs, and friend chats
 */

'use client';

import { useState, useMemo } from 'react';
import dayjs from 'dayjs';
import { shorten, formatTimestamp, formatFullTimestamp } from '@/lib/utils/message-utils';
import { AttachmentPreview } from '@/components/ui/attachment-preview';
import { useUserProfile } from '@/components/users/use-user-profile';
import { ProfileModal } from '@/components/users/profile-modal';
import { DefaultProfileAvatar } from '@/components/ui/default-profile-avatar';

export interface MessageBubbleProps {
    // Message data
    id: string;
    text: string;
    sender?: string;
    senderAddress?: string;
    displayName?: string;
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
    senderAddress,
    displayName,
    timestamp,
    status = 'confirmed',
    signature,
    file,
    isOwn,
    mode = 'chat',
    showFullTimestamp = false,
    onCopyAddress,
    onDownloadAttachment,
    copiedMessageId,
    className = '',
}: MessageBubbleProps) {
    const [isAttachmentOpen, setIsAttachmentOpen] = useState(true);
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [imageError, setImageError] = useState(false);

    // Fetch user profile for all senders (including own messages)
    const modalAddress = (senderAddress || sender)?.trim() || '';
    const { profile } = useUserProfile(modalAddress || undefined);

    // Derive values
    const profileName = profile?.name || displayName;
    const rawName = profileName || (sender ? sender : senderAddress ? shorten(senderAddress) : 'Unknown');
    const bubbleName = rawName.length > 10 ? `${rawName.slice(0, 5)}…${rawName.slice(-5)}` : rawName;
    // Messages with signatures are always confirmed, regardless of status field
    // This handles old messages in blockchain that have status: 'pending'
    const isPending = !signature && status === 'pending';
    const formattedTime = showFullTimestamp ? formatFullTimestamp(timestamp) : formatTimestamp(timestamp);
    const localizedTime = useMemo(() => {
        if (!timestamp) return '';
        const dateTime = dayjs(timestamp);
        const today = dayjs();
        const yesterday = dayjs().subtract(1, 'day');
        const timeString = dateTime.format('hh:mm A');
        if (dateTime.isSame(today, 'day')) {
            return timeString;
        }
        if (dateTime.isSame(yesterday, 'day')) {
            return `Yesterday · ${timeString}`;
        }
        return `${dateTime.format('YYYY. MM. DD. ') }${timeString}`;
    }, [timestamp]);
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
                <button
                    onClick={() => modalAddress && setShowProfileModal(true)}
                    className={`flex h-8 w-8 md:h-9 md:w-9 flex-shrink-0 items-center justify-center rounded-full text-xs md:text-sm font-semibold text-white shadow-lg ${
                        modalAddress ? 'cursor-pointer hover:ring-2 hover:ring-green-400 transition' : 'cursor-default'
                    }`}
                    disabled={!modalAddress}
                    title={modalAddress ? 'View profile' : ''}
                >
                    {profile?.profilePicture && !imageError ? (
                        <img
                            src={profile.profilePicture}
                            alt={bubbleName}
                            className="w-full h-full rounded-full object-cover"
                            onError={() => setImageError(true)}
                        />
                    ) : (
                        <DefaultProfileAvatar
                            seed={senderAddress || sender || bubbleName}
                            className="w-full h-full rounded-full overflow-hidden"
                        />
                    )}
                </button>

                {/* Message content */}
                <div
                    className="rounded-2xl border px-3 py-2 md:px-4 md:py-3 text-white"
                    style={bubbleStyle}
                >
                    {/* Sender info */}
                    <div className="mb-1 flex items-center gap-2 text-xs md:text-[11px] uppercase tracking-wide text-white/70">
                        <span title={rawName}>{bubbleName}</span>

                        {/* Copy address button (chat mode only) */}
                        {modalAddress && onCopyAddress && mode === 'chat' && (
                            <button
                                type="button"
                                onClick={() => onCopyAddress(modalAddress, id)}
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
                        <div className="mt-2 flex items-center gap-4 justify-between text-[11px] text-white/50">
                            {isPending ? (
                                <span>Processing…</span>
                            ) : signature ? (
                                <a
                                    href={`https://solscan.io/tx/${signature}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER && process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== 'mainnet-beta'
                                        ? `?cluster=${process.env.NEXT_PUBLIC_SOLANA_CLUSTER}`
                                        : ''}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline decoration-dotted underline-offset-2 hover:text-white/80 transition"
                                    title="View on Solscan"
                                >
                                    Confirmed
                                </a>
                            ) : (
                                <span>Confirmed</span>
                            )}
                            {localizedTime && <span> {localizedTime}</span>}
                        </div>
                    )}

                    {/* Status + timestamp for DM/friend modes */}
                    {(mode === 'dm' || mode === 'friend') && (
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
                            {isPending ? (
                                <span>Pending</span>
                            ) : signature ? (
                                <a
                                    href={`https://solscan.io/tx/${signature}${process.env.NEXT_PUBLIC_SOLANA_CLUSTER && process.env.NEXT_PUBLIC_SOLANA_CLUSTER !== 'mainnet-beta'
                                        ? `?cluster=${process.env.NEXT_PUBLIC_SOLANA_CLUSTER}`
                                        : ''}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline decoration-dotted underline-offset-2 hover:text-white/80 transition"
                                    title="View on Solscan"
                                >
                                    Confirmed
                                </a>
                            ) : (
                                <span>Confirmed</span>
                            )}
                            {localizedTime && (
                                <>
                                    <span>·</span>
                                    <span>{localizedTime}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Profile Modal */}
            {showProfileModal && modalAddress && (
                <ProfileModal
                    walletAddress={modalAddress}
                    onClose={() => setShowProfileModal(false)}
                />
            )}
        </div>
    );
}
