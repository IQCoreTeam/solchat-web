/**
 * DM Modal Component
 * Modal for direct messaging with another user
 */

'use client';

import { FormEvent, RefObject } from 'react';
import { shorten, formatTimestamp } from '@/lib/utils/message-utils';
import { DefaultProfileAvatar } from '@/components/ui/default-profile-avatar';

interface DmMeta {
    peerAddress: string;
    seedBytes: Uint8Array;
    seedHex: string;
    tableAddress: string;
    instructionAddress: string;
    partyA: string;
    partyB: string;
}

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

interface DmModalProps {
    isOpen: boolean;
    onClose: () => void;

    // DM setup
    dmPeerInput: string;
    setDmPeerInput: (value: string) => void;
    dmStatus: 'idle' | 'checking' | 'creating' | 'ready';
    dmError: string | null;
    activeDm: DmMeta | null;
    onStartDm: (e?: FormEvent) => void;

    // Messages
    dmMessages: MessageRow[];
    dmLoading: boolean;
    dmMessageInput: string;
    setDmMessageInput: (value: string) => void;
    onSendDmMessage: (e?: FormEvent) => void;
    dmMessagesEndRef: RefObject<HTMLDivElement | null>;

    // Auth
    canWrite: boolean;
    walletAddress: string | null;
    viewerAddress: string;
}

export function DmModal({
    isOpen,
    onClose,
    dmPeerInput,
    setDmPeerInput,
    dmStatus,
    dmError,
    activeDm,
    onStartDm,
    dmMessages,
    dmLoading,
    dmMessageInput,
    setDmMessageInput,
    onSendDmMessage,
    dmMessagesEndRef,
    canWrite,
    walletAddress,
    viewerAddress,
}: DmModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-3">
            <div className="w-full max-w-3xl overflow-hidden rounded-lg border-2 border-green-500 bg-black shadow-2xl shadow-green-500/20">
                <div className="flex items-center justify-between border-b border-green-500/40 px-4 py-3">
                    <div>
                        <p className="text-xs uppercase tracking-[0.25em] text-green-300">Direct Message</p>
                        <p className="text-[11px] text-white/60">
                            {activeDm
                                ? `DM with ${shorten(activeDm.peerAddress, 6)} · table ${shorten(activeDm.tableAddress, 5)}`
                                : 'Enter a public key to open a private channel'}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onStartDm}
                            disabled={!canWrite || !dmPeerInput.trim()}
                            className="rounded border border-green-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-green-200 transition hover:bg-green-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {dmStatus === 'creating' ? 'Creating…' : dmStatus === 'checking' ? 'Checking…' : 'Start/Load'}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/10"
                        >
                            Close
                        </button>
                    </div>
                </div>

                <form onSubmit={onStartDm} className="border-b border-white/10 bg-black/60 px-4 py-3 space-y-2">
                    <label className="text-[11px] uppercase tracking-[0.2em] text-white/60">Recipient public key</label>
                    <input
                        type="text"
                        value={dmPeerInput}
                        onChange={(event) => setDmPeerInput(event.target.value)}
                        placeholder="Enter the other participant's wallet address"
                        className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                        style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                        disabled={!canWrite || dmStatus === 'creating'}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/60">
                        <span>Status:</span>
                        <span className="rounded border border-white/10 px-2 py-1 text-green-200">
                            {dmStatus === 'idle' && 'Idle'}
                            {dmStatus === 'checking' && 'Checking table…'}
                            {dmStatus === 'creating' && 'Creating table…'}
                            {dmStatus === 'ready' && 'Ready'}
                        </span>
                        {activeDm && (
                            <span className="text-green-300">
                                Seed {activeDm.seedHex.slice(0, 8)}… · PDA {shorten(activeDm.tableAddress, 4)}
                            </span>
                        )}
                    </div>
                    {dmError && <p className="text-xs text-red-400">{dmError}</p>}
                    {!walletAddress && <p className="text-xs text-orange-300">Connect your wallet to start a DM.</p>}
                </form>

                <div className="max-h-[50vh] overflow-y-auto bg-black/40 px-4 py-3 space-y-3">
                    {dmLoading && <div className="text-white/60">Loading DM messages…</div>}
                    {dmStatus === 'idle' && !activeDm && <div className="text-white/50">Enter a recipient to start a DM.</div>}
                    {!dmLoading && activeDm && dmMessages.length === 0 && (
                        <div className="text-white/50">No DM messages yet. Say hi!</div>
                    )}
                    {dmMessages.map((message) => {
                        const isOwn = message.sender && viewerAddress && message.sender === viewerAddress;
                        const bubbleName = isOwn ? 'You' : message.displayName || (message.sender ? shorten(message.sender) : 'Unknown');
                        // Messages with signatures are confirmed, regardless of status field
                        const isPending = !message.signature && message.status === 'pending';
                        return (
                            <div key={message.id} className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
                                <div
                                    className={`flex max-w-[90%] items-end gap-3 ${isOwn ? 'flex-row-reverse text-right' : 'text-left'}`}
                                >
                                    <DefaultProfileAvatar
                                        seed={message.sender || bubbleName}
                                        className="h-8 w-8 flex-shrink-0 rounded-full"
                                    />
                                    <div
                                        className="rounded-2xl border px-3 py-2 text-white"
                                        style={
                                            isOwn
                                                ? { backgroundColor: 'rgba(65, 255, 0, 0.15)', borderColor: 'rgba(65, 255, 0, 0.4)' }
                                                : { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' }
                                        }
                                    >
                                        <div className="mb-1 flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/70">
                                            <span>{bubbleName}</span>
                                            {message.sender && (
                                                <span className="text-white/40">{shorten(message.sender)}</span>
                                            )}
                                        </div>
                                        <div className="whitespace-pre-wrap text-sm leading-relaxed break-all">{message.text}</div>
                                        <div className="mt-1 flex items-center gap-2 text-[11px] text-white/50">
                                            <span>{formatTimestamp(message.timestamp)}</span>
                                            <span>·</span>
                                            <span>{isPending ? 'Pending' : 'Confirmed'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    <div ref={dmMessagesEndRef} />
                </div>

                {activeDm && (
                    <form onSubmit={onSendDmMessage} className="border-t border-white/10 bg-black/60 px-4 py-3">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={dmMessageInput}
                                onChange={(event) => setDmMessageInput(event.target.value)}
                                placeholder="Send a private message"
                                className="flex-1 rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 outline-none focus:ring-2"
                                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                                disabled={!canWrite || dmStatus !== 'ready'}
                            />
                            <button
                                type="submit"
                                disabled={!canWrite || !dmMessageInput.trim() || dmStatus !== 'ready'}
                                className="rounded px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
                                style={{
                                    backgroundColor: canWrite && dmMessageInput.trim() && dmStatus === 'ready' ? 'rgb(65, 255, 0)' : undefined,
                                    color: canWrite && dmMessageInput.trim() && dmStatus === 'ready' ? 'rgb(0, 33, 0)' : undefined,
                                }}
                            >
                                Send DM
                            </button>
                        </div>
                        {!canWrite && (
                            <p className="mt-1 text-xs text-orange-300">
                                Connect your wallet and initialize your account to send messages.
                            </p>
                        )}
                        {dmStatus !== 'ready' && (
                            <p className="mt-1 text-xs text-white/60">DM channel must be ready to send.</p>
                        )}
                    </form>
                )}
            </div>
        </div>
    );
}
