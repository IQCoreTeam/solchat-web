/**
 * Message Input Form Component
 * Form for sending messages with attachment support
 */

'use client';

import { FormEvent, RefObject } from 'react';
import { shorten } from '@/lib/utils/message-utils';

interface MessageInputFormProps {
    messageInput: string;
    setMessageInput: (value: string) => void;
    attachmentUrl: string;
    setAttachmentUrl: (value: string) => void;
    showAttachmentInput: boolean;
    setShowAttachmentInput: (show: boolean) => void;
    attachmentError: string | null;
    setAttachmentError: (error: string | null) => void;
    onSubmit: (e: FormEvent) => void;
    canWrite: boolean;
    canSubmit: boolean;
    writerCtx: any;
    isUserInitialized: boolean;
    userInitError: Error | null;
    inputRef: RefObject<HTMLInputElement | null>;
}

export function MessageInputForm({
    messageInput,
    setMessageInput,
    attachmentUrl,
    setAttachmentUrl,
    showAttachmentInput,
    setShowAttachmentInput,
    attachmentError,
    setAttachmentError,
    onSubmit,
    canWrite,
    canSubmit,
    writerCtx,
    isUserInitialized,
    userInitError,
    inputRef,
}: MessageInputFormProps) {
    return (
        <form onSubmit={onSubmit} className="border-t border-white/10 bg-black/40 px-3 py-3 md:px-6 md:py-4">
            <div className="flex flex-col gap-2 md:gap-3">
                <div className="flex gap-2 md:gap-3">
                    <input
                        ref={inputRef}
                        type="text"
                        value={messageInput}
                        onChange={(event) => setMessageInput(event.target.value)}
                        placeholder="Type your message"
                        className="flex-1 rounded bg-white/10 px-4 py-2 text-sm text-white placeholder-white/50 outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                        disabled={!canWrite}
                    />
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="rounded px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60 whitespace-nowrap"
                        style={{
                            backgroundColor: canSubmit ? 'rgb(65, 255, 0)' : undefined,
                            color: canSubmit ? 'rgb(0, 33, 0)' : undefined,
                        }}
                        onMouseEnter={(e) => {
                            if (canSubmit) {
                                e.currentTarget.style.opacity = '0.85';
                            }
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.opacity = '1';
                        }}
                    >
                        <span className="hidden sm:inline">Send</span>
                        <span className="sm:hidden">
                            <svg className="w-5 h-5 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </span>
                    </button>
                </div>
                <div className="flex flex-wrap items-center justify-between text-xs text-white/60">
                    <button
                        type="button"
                        onClick={() => setShowAttachmentInput((prev) => !prev)}
                        className="uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                        disabled={!canWrite}
                    >
                        {showAttachmentInput ? '[HIDE ATTACHMENT]' : '[ADD ATTACHMENT]'}
                    </button>
                    {attachmentUrl.trim() && !attachmentError && (
                        <span className="text-green-300">Attached: {shorten(attachmentUrl.trim(), 6)}</span>
                    )}
                </div>
                {showAttachmentInput && (
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <input
                                type="url"
                                value={attachmentUrl}
                                onChange={(event) => {
                                    setAttachmentUrl(event.target.value);
                                    setAttachmentError(null);
                                }}
                                placeholder="https://example.com/asset.png"
                                className="flex-1 rounded bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                                disabled={!canWrite}
                            />
                            {attachmentUrl && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAttachmentUrl('');
                                        setAttachmentError(null);
                                    }}
                                    className="rounded border border-white/20 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:border-white/40"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] text-white/40">
                            Paste a publicly accessible https:// link to media or files. Recipients load attachments on demand.
                        </p>
                    </div>
                )}
                {attachmentError && <p className="text-xs text-red-400">{attachmentError}</p>}
            </div>
            {!writerCtx && (
                <p className="mt-2 text-xs text-orange-300">Connect your wallet to send messages.</p>
            )}
            {writerCtx && !isUserInitialized && !userInitError && (
                <p className="mt-2 text-xs text-yellow-300">
                    Waiting for your on-chain account initialization…
                </p>
            )}
            {userInitError && (
                <p className="mt-2 text-xs text-red-400">
                    Account initialization failed. Please retry above.
                </p>
            )}
        </form>
    );
}
