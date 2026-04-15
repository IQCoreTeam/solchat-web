'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PublicKey, type Signer } from '@solana/web3.js';
import { BorshAccountsCoder } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk';
import { IQ_IDL } from 'iqlabs-sdk/contract';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { useUserInit } from '@/lib/iqlabs/use-user-init';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';
import { usePendingMessages } from '@/lib/shared/use-pending-messages';
import { useMessageChannel } from '@/lib/shared/use-message-channel';
import type { FetchConfig } from '@/lib/shared/useMessageIndexLoader';
import { useAccountSubscription } from '@/lib/shared/use-account-subscription';
import { ROOT_ID } from '@/lib/iqlabs/constants';
import { notifyGateway } from '@/lib/gateway/reader';
import { makeRoomTimestampKey, setLastMessageTimestamp, getLastMessageTimestamp } from '@/lib/cache/message-timestamp-cache';
import { RpcConfigPrompt } from '@/components/ui/rpc-config-prompt';
import { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';
import { makeChannelKey, channelKeyToSeed, roomIdToChannelKey } from '@/lib/shared/channel-utils';
import { useWebSocketChannel } from '@/lib/shared/use-websocket-channel';
import { useScrollTracker } from '@/lib/shared/use-scroll-tracker';
import { createRoomFetcher } from '@/lib/chat/message-fetcher';
import { useRootAccount } from '@/lib/chat/use-root-account';
import { useRooms, type RoomMeta } from '@/lib/chat/use-rooms';

// Import new components
import { ChatHeader } from './chat-header';
import { RoomSidebar } from './room-sidebar';
import { FundingModal } from './funding-modal';
import { MessageList } from './message-list';
import { MessageInputForm } from './message-input-form';

type ToastTone = 'info' | 'error';
type ToastState = {
    text: string;
    tone: ToastTone;
};

const DEBUG_WS = true;
const channelKeyToRoomId = (channelKey: string) => makeRoomTimestampKey(channelKeyToSeed(channelKey));

export function ChatClient() {
    /* --------------------------------------------------------------------------
     * Context & External Hooks
     * -------------------------------------------------------------------------- */
    const { connection, readConnection, endpointSource, setCustomRpcEndpoint } = useAppConnection();
    const wallet = useAppWallet();
    const {
        isInitialized: isUserInitialized,
        isInitializing: isUserInitializing,
        error: userInitError,
        retry: retryUserInit,
        needsFunding,
        balanceLamports,
        walletAddress: initWalletAddress,
    } = useUserInit();
    const [fundingModalDismissed, setFundingModalDismissed] = useState(false);
    const { logout } = usePrivy();

    const programId = useMemo(() => iqlabs.contract.PROGRAM_ID, []);
    const dbRootId = useMemo(() => iqlabs.utils.toSeedBytes(ROOT_ID), []);
    const coder = useMemo(() => new BorshAccountsCoder(IQ_IDL), []);
    const builder = useMemo(
        () => iqlabs.contract.createInstructionBuilder(IQ_IDL, programId),
        [programId]
    );
    const rootPubkey = useMemo(
        () => iqlabs.contract.getDbRootPda(dbRootId),
        [dbRootId]
    );

    /* --------------------------------------------------------------------------
     * Local State
     * -------------------------------------------------------------------------- */
    // Rooms state
    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);

    // Messages state
    const pendingState = usePendingMessages();
    const {
        pendingMessages,
        pruneConfirmedMessages,
        removePendingMessage,
    } = pendingState;

    // Room creation state (handled in useRooms)

    // Message input state
    const [messageInput, setMessageInput] = useState('');
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
    const [showAttachmentInput, setShowAttachmentInput] = useState(false);
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [attachmentError, setAttachmentError] = useState<string | null>(null);

    // UI state
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [disconnectingPrivy, setDisconnectingPrivy] = useState(false);
    const [roomNotificationsEnabled, setRoomNotificationsEnabled] = useState(true);
    const [roomAlerts, setRoomAlerts] = useState<Record<string, boolean>>({});
    const [toast, setToast] = useState<ToastState | null>(null);
    const [uiIsAtBottom, setUiIsAtBottom] = useState(true);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const newMarkerByChannelRef = useRef<Record<string, string | null>>({});
    const prevMessageCountRef = useRef<number>(0);
    const lastSeenTimestampRef = useRef<Record<string, number>>({});
    const latestMessageTimestampRef = useRef<number>(0);
    const markerClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const signer = useMemo<SignerInput | null>(() => {
        if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
            return null;
        }
        return {
            publicKey: wallet.publicKey,
            signTransaction: wallet.signTransaction.bind(wallet),
            signAllTransactions: wallet.signAllTransactions.bind(wallet),
        };
    }, [wallet]);

    /* --------------------------------------------------------------------------
     * Derived Values
     * -------------------------------------------------------------------------- */
    const sortRoomsByTimestamp = useCallback((list: RoomMeta[]) => {
        return [...list].sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    }, []);

    const { rootStatus, rootAccount, handleCreateRoot } = useRootAccount({
        connection,
        readConnection,
        rootPubkey,
        isUserInitialized,
        isUserInitializing,
        builder,
        dbRootId,
        signer,
    });

    const {
        rooms,
        setRooms,
        roomsLoading,
        roomsError,
        newRoomName,
        setNewRoomName,
        newRoomGateEnabled,
        setNewRoomGateEnabled,
        newRoomGateMint,
        setNewRoomGateMint,
        newRoomGateAmount,
        setNewRoomGateAmount,
        newRoomGateType,
        setNewRoomGateType,
        creatingRoom,
        handleCreateRoom,
    } = useRooms({
        rootStatus,
        rootAccount,
        coder,
        connection,
        readConnection,
        rootPubkey,
        sortRoomsByTimestamp,
        signer,
        builder,
        dbRootId,
    });

    const selectedRoom = useMemo(() => {
        return rooms.find((r) => r.seedHex === selectedSeed) || null;
    }, [rooms, selectedSeed]);
    const selectedChannelKey = useMemo(() => (selectedSeed ? makeChannelKey(selectedSeed) : null), [selectedSeed]);
    const latestRoomsRef = useRef<RoomMeta[]>(rooms);
    const latestSelectedRoomRef = useRef<RoomMeta | null>(selectedRoom);
    // Sync refs inline where needed instead of useEffect
    latestRoomsRef.current = rooms;
    latestSelectedRoomRef.current = selectedRoom;

    // Derived values (no useState needed)
    const walletAddress = wallet.publicKey?.toBase58() ?? '';
    const hasWallet = Boolean(wallet.publicKey);
    const canWrite = Boolean(signer && isUserInitialized);
    const slowRpcMode = endpointSource === 'default';
    const newMarkerId = selectedChannelKey ? (newMarkerByChannelRef.current[selectedChannelKey] ?? null) : null;
    const hasNewMessages = Boolean(newMarkerId);

    const showToast = useCallback((text: string, tone: ToastTone = 'info') => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToast({ text, tone });
        toastTimeoutRef.current = setTimeout(() => setToast(null), 1000);
    }, []);

    const setChannelMarker = useCallback((channelKey: string, markerId: string | null) => {
        newMarkerByChannelRef.current[channelKey] = markerId;
        // newMarkerId and hasNewMessages are derived from the ref, no need to set state
    }, []);

    const clearChannelMarker = useCallback((channelKey: string | null) => {
        if (!channelKey) return;
        setChannelMarker(channelKey, null);
    }, [setChannelMarker]);

    const markMessagesRead = useCallback((channelKey?: string, timestamp?: number | null) => {
        const channel = channelKey ?? selectedChannelKey;
        const latestTimestamp = timestamp ?? latestMessageTimestampRef.current;
        if (!channel || !latestTimestamp) return;
        const prevSeen = lastSeenTimestampRef.current[channel] ?? 0;
        if (latestTimestamp <= prevSeen) return;
        lastSeenTimestampRef.current[channel] = latestTimestamp;
        const seedHex = channelKeyToSeed(channel);
        const timestampKey = makeRoomTimestampKey(seedHex);
        setLastMessageTimestamp(timestampKey, latestTimestamp);
        setRoomAlerts((prev) => ({ ...prev, [channel]: false, [seedHex]: false }));
    }, [selectedChannelKey, setRoomAlerts]);

    const fetcher = useCallback(
        (channelKey: string, fetchConfig?: FetchConfig) =>
            createRoomFetcher({
                walletAddress,
                endpointSource,
                rooms: latestRoomsRef.current,
            })(channelKey, fetchConfig),
        [walletAddress, endpointSource]
    );

    const resolveChannelMeta = useCallback((channelKey: string) => {
        const seedHex = channelKeyToSeed(channelKey);
        const room = rooms.find((r) => r.seedHex === seedHex);
        if (!room) return null;
        return {
            channelKey,
            seedHex: room.seedHex,
            tableAddress: room.tableAddress,
        };
    }, [rooms]);

    const {
        messages,
        messagesLoading,
        messagesError,
        showLoadingSpinner,
        lastInsertModeRef,
        triggerBackfill,
        triggerLiveLatest,
        targetedDecode,
        applyLocalRows,
        mergedMessages: allMessages,
        sendMessage: handleSendMessage,
    } = useMessageChannel({
        reader: {
            channelKey: selectedChannelKey,
            resolveChannelMeta,
            fetcher,
            connection: readConnection,
            endpointSource,
            onRowsApplied: ({ channelKey, seedHex, rows }) => {
                const latestTimestamp = rows.reduce((max, msg) => Math.max(max, msg.timestamp ?? 0), 0);
                if (latestTimestamp) {
                    setLastMessageTimestamp(makeRoomTimestampKey(seedHex), latestTimestamp);
                    setRoomAlerts((prev) => ({ ...prev, [channelKey]: false, [seedHex]: false }));
                }
            },
            decodeWindow: endpointSource === 'default' ? 20 : 40,
            runWithRpcRateLimit,
        },
        pending: pendingState,
        sender: {
            messageInput,
            attachmentUrl,
            setMessageInput,
            setAttachmentUrl,
            setAttachmentError,
            setShowAttachmentInput,
            getSender: () => signer?.publicKey.toBase58() || '',
            getMessageId: () => crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10),
            canSend: () => {
                if (!signer || !selectedRoom) {
                    return { ok: false };
                }
                return { ok: true };
            },
            writeMessage: (payload) =>
                iqlabs.writer.writeRow(
                    connection,
                    signer! as Signer,
                    dbRootId,
                    selectedRoom!.seedBytes,
                    JSON.stringify(payload)
                ),
            onAfterSuccess: (payload, signature) => {
                if (!selectedRoom) return;
                // Optimistically mark this message as confirmed locally so we don't stay in "processing"
                applyLocalRows(makeChannelKey(selectedRoom.seedHex), [
                    {
                        id: payload.id,
                        text: payload.text,
                        sender: payload.sender,
                        timestamp: payload.timestamp,
                        file: payload.file,
                        status: 'confirmed',
                        room: selectedRoom.seedHex,
                    },
                ], 'append');
                removePendingMessage(payload.id);
                // Don't invalidate - signature cache has no TTL now
                // invalidateSignatureCache(selectedRoom.tableAddress);
                const timestamp = payload.timestamp ?? 0;
                notifyRoomMessageSent(selectedRoom.seedHex, timestamp, signature);
                notifyGateway(selectedRoom.tableAddress, signature, signer?.publicKey?.toBase58());
                // Scroll after DOM updates on next frame
                requestAnimationFrame(() => scrollToBottom('smooth'));
            },
            onAfterError: (err, payload) => {
                console.error('[ChatClient] Send message error:', err);
                const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
                showToast(errorMessage, 'error');
                removePendingMessage(payload.id);
            },
            onAfterAttempt: (payload) => {
                if (selectedRoom) {
                    const channelKey = makeChannelKey(selectedRoom.seedHex);
                    markMessagesRead(channelKey, payload.timestamp ?? 0);
                }
            },
        },
    });
    // Update latest message timestamp ref (pure ref update, kept for scroll/read tracking)
    useEffect(() => {
        const latestTimestamp = allMessages[allMessages.length - 1]?.timestamp ?? 0;
        latestMessageTimestampRef.current = latestTimestamp || 0;
    }, [allMessages]);

    // Sync cached timestamp to ref on channel switch
    useEffect(() => {
        if (!selectedChannelKey) return;
        const seedHex = channelKeyToSeed(selectedChannelKey);
        const cached = getLastMessageTimestamp(makeRoomTimestampKey(seedHex)) ?? 0;
        const currentSeen = lastSeenTimestampRef.current[selectedChannelKey] ?? 0;
        if (cached > currentSeen) {
            lastSeenTimestampRef.current[selectedChannelKey] = cached;
        }
    }, [selectedChannelKey]);

    const rootStatusText = useMemo(() => {
        if (rootStatus === 'checking') return 'Checking...';
        if (rootStatus === 'missing') return 'Not found';
        if (rootStatus === 'creating') return 'Creating...';
        if (rootStatus === 'ready') return 'Ready';
        return 'Error';
    }, [rootStatus]);

    const userInitStatus = useMemo(() => {
        if (isUserInitializing) return 'Initializing...';
        if (userInitError) return 'Failed';
        if (isUserInitialized) return 'Ready';
        return 'Pending';
    }, [isUserInitializing, userInitError, isUserInitialized]);

    useEffect(() => {
        const alerts: Record<string, boolean> = {};
        rooms.forEach((room) => {
            const channelKey = makeChannelKey(room.seedHex);
            const timestampKey = makeRoomTimestampKey(room.seedHex);
            const cached = getLastMessageTimestamp(timestampKey) ?? 0;
            const hasNew = Boolean(room.lastTimestamp && room.lastTimestamp > cached);
            alerts[channelKey] = hasNew;
            alerts[room.seedHex] = hasNew;
        });
        setRoomAlerts(alerts);
    }, [rooms]);

    useEffect(() => {
        for (const room of rooms) {
            if (selectedSeed && room.seedHex === selectedSeed) continue;
            const timestampKey = makeRoomTimestampKey(room.seedHex);
            const cached = getLastMessageTimestamp(timestampKey) ?? 0;
            if (room.lastTimestamp && room.lastTimestamp > cached) {
                const label = room.name || room.seedHex.slice(0, 6);
                showToast(`New message available in ${label}`);
                break;
            }
        }
    }, [rooms, showToast, selectedSeed]);

    // slowRpcMode is now a derived value, no effect needed

    /* --------------------------------------------------------------------------
     * WebSocket Connection
     * -------------------------------------------------------------------------- */
    const handleRoomSocketPayload = useCallback(async (data: unknown) => {
        const payload = data as { type?: string; roomId?: string; lastTimestamp?: number; timestamp?: number; signature?: string };
        const roomId = payload?.roomId;
        if (!roomId || !roomId.startsWith('room:')) {
            return;
        }
        const channelKey = roomIdToChannelKey(roomId);
        const seedHex = channelKeyToSeed(channelKey);
        const signature = payload.signature;
        const incomingTimestamp = typeof payload.lastTimestamp === 'number'
            ? payload.lastTimestamp
            : typeof payload.timestamp === 'number'
                ? payload.timestamp
                : Number(payload.lastTimestamp || payload.timestamp || 0);

        if (DEBUG_WS) {
            console.log('[WS] roomUpdated payload', {
                roomId,
                channelKey,
                seedHex,
                signature,
                incomingTimestamp,
            });
        }

        // Don't invalidate signature cache - it has no TTL now, and we use targeted decode with signature
        // const roomMeta = latestRoomsRef.current.find((room) => room.seedHex === seedHex);
        // if (roomMeta?.tableAddress) {
        //     invalidateSignatureCache(roomMeta.tableAddress);
        // }

        // Update room timestamps
        setRooms((prev) => {
            let changed = false;
            const updated = prev.map((room) => {
                if (room.seedHex !== seedHex) {
                    return room;
                }
                if ((room.lastTimestamp || 0) >= incomingTimestamp) {
                    return room;
                }
                changed = true;
                return { ...room, lastTimestamp: incomingTimestamp };
            });
            if (!changed) return prev;
            return sortRoomsByTimestamp(updated);
        });

        const currentRoom = latestSelectedRoomRef.current;
        const isCurrentRoom = currentRoom?.seedHex === seedHex;

        // Signature-targeted refresh path (efficient)
        if (signature) {
            try {
                await targetedDecode(channelKey, signature);
                if (DEBUG_WS) {
                    console.log('[WS] signature-targeted decode success', {
                        channelKey,
                        signature: signature.slice(0, 8),
                        isCurrentRoom,
                    });
                }
                // For non-current rooms, set alert
                if (!isCurrentRoom) {
                    setRoomAlerts((prev) => ({ ...prev, [channelKey]: true, [seedHex]: true }));
                }
                return; // Successfully handled with signature
            } catch (error) {
                console.error('[ChatClient] Targeted decode failed, falling back to full refresh', signature.slice(0, 8), error);
                // Fall through to full refresh as fallback
            }
        }

        // Fallback: full refresh (only when signature is missing or failed)
        if (isCurrentRoom) {
            try {
                await triggerLiveLatest(channelKey, { skipLoadingState: true });
                if (DEBUG_WS) {
                    console.log('[WS] full refresh completed (no signature or decode failed)');
                }
            } catch (error) {
                console.error('[ChatClient] Failed to refresh room after notification', error);
            }
        } else {
            setRoomAlerts((prev) => ({ ...prev, [channelKey]: true, [seedHex]: true }));
        }
    }, [triggerLiveLatest, sortRoomsByTimestamp, targetedDecode, selectedChannelKey]);

    const roomWs = useWebSocketChannel({
        onMessage: handleRoomSocketPayload,
        logPrefix: 'ChatClient',
    });

    const roomSocketRef = roomWs.socketRef;
    const roomSubscribedIdsRef = roomWs.subscribedIdsRef;
    const roomWsConnected = roomWs.isConnected;

    useEffect(() => {
        if (!roomWsConnected || !roomSocketRef.current) return;
        if (roomSocketRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[ChatClient] WS not ready for subscribe, state =', roomSocketRef.current.readyState);
            return;
        }
        const socket = roomSocketRef.current;
        const desired = new Set(rooms.map((room) => makeChannelKey(room.seedHex)));
        const current = roomSubscribedIdsRef.current;

        for (const id of desired) {
            if (!current.has(id)) {
                socket.send(JSON.stringify({ type: 'subscribe', roomId: channelKeyToRoomId(id) }));
                current.add(id);
            }
        }

        for (const id of Array.from(current)) {
            if (!desired.has(id)) {
                socket.send(JSON.stringify({ type: 'unsubscribe', roomId: channelKeyToRoomId(id) }));
                current.delete(id);
            }
        }

        roomSubscribedIdsRef.current = desired;
  }, [rooms, roomWsConnected]);

    // Load messages when channel or wallet changes
    useEffect(() => {
        if (!walletAddress || !selectedChannelKey) return;
        void triggerLiveLatest(selectedChannelKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [walletAddress, selectedChannelKey]);

    useEffect(() => {
        if (!pendingMessages.length) return;
        pruneConfirmedMessages(messages);
    }, [messages, pendingMessages, pruneConfirmedMessages]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    /* --------------------------------------------------------------------------
     * Effects: Account Change Subscriptions (CLI pattern - signature-based)
     * -------------------------------------------------------------------------- */
    const handleNewSignatures = useCallback(async (signatures: string[]) => {
        if (!selectedChannelKey) return;

        console.log(`[ChatClient] Processing ${signatures.length} new signatures via RPC subscription`);

        // Try to decode each signature and append to messages
        for (const signature of signatures) {
            try {
                await targetedDecode(selectedChannelKey, signature);
            } catch (error) {
                console.error('[ChatClient] Failed to decode signature', signature.slice(0, 8), error);
            }
        }
    }, [selectedChannelKey, targetedDecode]);

    useAccountSubscription({
        connection: readConnection,
        account: selectedRoom ? new PublicKey(selectedRoom.tableAddress) : null,
        onNewSignatures: handleNewSignatures,
        commitment: 'confirmed',
        enabled:
            !roomWsConnected &&
            (typeof document === 'undefined' || document.visibilityState === 'visible'),
        fetchLimit: 10,
        logPrefix: 'ChatClient',
    });

    /* --------------------------------------------------------------------------
     * Effects: UI Sync
     * -------------------------------------------------------------------------- */
    useEffect(() => {
        if (!selectedChannelKey || !isAtBottomRef.current) return;
        if (!latestMessageTimestampRef.current) return;
        markMessagesRead(selectedChannelKey, latestMessageTimestampRef.current);
    }, [allMessages, markMessagesRead, selectedChannelKey]);
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
        isAtBottomRef.current = true;
        setUiIsAtBottom(true);
        if (selectedChannelKey) {
            markMessagesRead(selectedChannelKey);
            // Clear marker when scrolling to bottom
            clearChannelMarker(selectedChannelKey);
        }
    }, [markMessagesRead, selectedChannelKey, clearChannelMarker]);

    const { updateIsAtBottom } = useScrollTracker({
        listRef,
        isAtBottomRef,
        setUiIsAtBottom,
        selectedChannelKey,
        clearMarker: clearChannelMarker,
        markerClearTimeoutRef,
        onMarkRead: markMessagesRead,
        onNearTop: triggerBackfill,
    });

    useEffect(() => {
        const el = listRef.current;
        if (!el) return;
        updateIsAtBottom();
        el.addEventListener('scroll', updateIsAtBottom, { passive: true });
        return () => {
            el.removeEventListener('scroll', updateIsAtBottom);
        };
    }, [updateIsAtBottom, selectedSeed]);

    // Auto-scroll/indicators based on structural insert mode
    const prevScrollHeightRef = useRef<number>(0);
    const prevScrollTopRef = useRef<number>(0);
    useLayoutEffect(() => {
        const el = listRef.current;
        if (!el || !selectedChannelKey) return;

        const mode = lastInsertModeRef.current[selectedChannelKey] ?? null;
        const prevHeight = prevScrollHeightRef.current ?? 0;
        const prevTop = prevScrollTopRef.current ?? 0;
        const nextHeight = el.scrollHeight;
        const prevCount = prevMessageCountRef.current ?? 0;
        const nextCount = allMessages.length;
        const latest = allMessages[allMessages.length - 1];
        const latestTimestamp = latest?.timestamp ?? 0;
        const lastSeenTimestamp = lastSeenTimestampRef.current[selectedChannelKey] ?? 0;

        if (mode === 'prepend') {
            if (prevCount < 5) {
                // Keep view anchored only when the list was short (<5 msgs) to avoid jumps on large backfills.
                const delta = nextHeight - prevHeight;
                el.scrollTop = prevTop + delta;
                isAtBottomRef.current = false;
            }
        } else if (mode === 'append') {
            if (isAtBottomRef.current) {
                scrollToBottom('auto');
                isAtBottomRef.current = true;
                if (latestTimestamp) {
                    markMessagesRead(selectedChannelKey, latestTimestamp);
                }
            } else if (latestTimestamp > lastSeenTimestamp) {
                // Set marker for new messages (hasNewMessages is derived from this)
                if (!newMarkerByChannelRef.current[selectedChannelKey]) {
                    const latestSender = latest?.sender;
                    const viewer = walletAddress;
                    const isOwn = viewer && latestSender && viewer === latestSender;
                    if (latest?.id && !isOwn) {
                        setChannelMarker(selectedChannelKey, latest.id);
                    }
                }
            }
        }

        // Reset mode for next change
        lastInsertModeRef.current[selectedChannelKey] = null;
        prevScrollHeightRef.current = nextHeight;
        prevScrollTopRef.current = el.scrollTop;
        prevMessageCountRef.current = nextCount;
    }, [allMessages, markMessagesRead, selectedChannelKey, scrollToBottom, lastInsertModeRef, setChannelMarker, walletAddress]);

    // Reset scroll position when switching rooms
    useEffect(() => {
        isAtBottomRef.current = true;
        scrollToBottom('auto');
    }, [selectedChannelKey, scrollToBottom]);

    const handleMarkerVisible = useCallback(() => {
        if (!selectedChannelKey) return;
        clearChannelMarker(selectedChannelKey);
    }, [selectedChannelKey, clearChannelMarker]);

    /* --------------------------------------------------------------------------
     * Event Handlers
     * -------------------------------------------------------------------------- */
    const notifyRoomMessageSent = useCallback((seedHex: string, ts: number, signature?: string) => {
        const socket = roomSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('[ChatClient] Room notify skipped, state =', socket?.readyState ?? 'no socket');
            return;
        }
        const channelKey = makeChannelKey(seedHex);
        try {
            socket.send(
                JSON.stringify({
                    type: 'messageSent',
                    roomId: channelKeyToRoomId(channelKey),
                    timestamp: ts,
                    signature,
                })
            );
            console.log('[ChatClient] Room notify sent for', seedHex.slice(0, 8), 'ts', ts);
        } catch (error) {
            console.warn('[ChatClient] Failed to emit room notification', error);
        }
    }, []);

    // Handle disconnect
    const handleDisconnectPrivy = useCallback(async () => {
        setDisconnectingPrivy(true);
        try {
            await logout();
        } catch (err) {
            console.error('[ChatClient] Disconnect error:', err);
        } finally {
            setDisconnectingPrivy(false);
        }
    }, [logout]);

    // Handle copy address
    const handleCopyAddress = useCallback((address: string, messageId: string) => {
        navigator.clipboard?.writeText(address);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
    }, []);

    // Handle download attachment
    const handleDownloadAttachment = useCallback((url: string) => {
        window.open(url, '_blank');
    }, []);

    const canSubmitMessage = canWrite && !!messageInput.trim() && !!selectedRoom;

    return (
        <div className="flex h-full flex-col">
            <RpcConfigPrompt
                endpointSource={endpointSource}
                setCustomRpcEndpoint={setCustomRpcEndpoint}
            />
            <ChatHeader
                walletAddress={wallet.publicKey?.toBase58() || null}
                isUserInitialized={isUserInitialized}
                needsInit={needsFunding || !!userInitError}
                userInitError={userInitError}
                rootStatus={rootStatus}
                rootStatusText={rootStatusText}
                userInitStatus={userInitStatus}
                onRetryUserInit={retryUserInit}
                onDisconnect={handleDisconnectPrivy}
                disconnecting={disconnectingPrivy}
                isSidebarOpen={isSidebarOpen}
                onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                selectedRoom={selectedRoom}
                notificationsEnabled={roomNotificationsEnabled}
                onToggleNotifications={() => setRoomNotificationsEnabled((prev) => !prev)}
            />

            <div className="flex flex-1 overflow-hidden">
                <RoomSidebar
                    newRoomName={newRoomName}
                    setNewRoomName={setNewRoomName}
                    newRoomGateEnabled={newRoomGateEnabled}
                    setNewRoomGateEnabled={setNewRoomGateEnabled}
                    newRoomGateMint={newRoomGateMint}
                    setNewRoomGateMint={setNewRoomGateMint}
                    newRoomGateAmount={newRoomGateAmount}
                    setNewRoomGateAmount={setNewRoomGateAmount}
                    newRoomGateType={newRoomGateType}
                    setNewRoomGateType={setNewRoomGateType}
                    creatingRoom={creatingRoom}
                    onCreateRoom={handleCreateRoom}
                    rooms={rooms}
                    selectedSeed={selectedSeed}
                    onSelectRoom={setSelectedSeed}
                    roomsLoading={roomsLoading}
                    roomsError={roomsError}
                    roomAlerts={roomAlerts}
                    hasWallet={hasWallet}
                    canWrite={canWrite}
                    isUserInitialized={isUserInitialized}
                    isUserInitializing={isUserInitializing}
                    userInitError={userInitError}
                    isSidebarOpen={isSidebarOpen}
                    onCloseSidebar={() => setIsSidebarOpen(false)}
                />

                <div className="flex flex-1 flex-col overflow-hidden relative">
                    {selectedRoom ? (
                        <>
                            {slowRpcMode && (
                                <div className="mx-4 mb-2 rounded border border-yellow-700/50 bg-yellow-900/30 px-3 py-1 text-xs text-amber-200">
                                    Using public RPC — slow load mode (1 tx/sec). Messages will appear as they arrive.
                                </div>
                            )}
                            <MessageList
                                messages={allMessages}
                                isLoading={messagesLoading}
                                showLoadingSpinner={showLoadingSpinner}
                                error={messagesError}
                                viewerAddress={wallet.publicKey?.toBase58() || ''}
                                messagesEndRef={messagesEndRef}
                                listRef={listRef}
                                newMarkerId={newMarkerId}
                                onMarkerVisible={handleMarkerVisible}
                                onCopyAddress={handleCopyAddress}
                                onDownloadAttachment={handleDownloadAttachment}
                                copiedMessageId={copiedMessageId}
                            />
                            {!uiIsAtBottom && allMessages.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => scrollToBottom('smooth')}
                                    className={`absolute bottom-20 right-4 z-10 group flex items-center justify-center rounded-full w-11 h-11 border transition-all duration-200 backdrop-blur-sm shadow-[0_6px_18px_rgba(0,0,0,0.35)] ${
                                        hasNewMessages
                                            ? 'border-emerald-300/70 bg-emerald-500/15 text-emerald-100 ring-1 ring-emerald-400/50 hover:bg-emerald-500/25'
                                            : 'border-slate-500/60 bg-slate-900/70 text-slate-200 hover:bg-slate-800/70'
                                    }`}
                                >
                                    <span className="text-xl leading-none font-bold group-hover:translate-y-[1px] transition-transform duration-150">▾</span>
                                    {hasNewMessages && (
                                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.55)]" />
                                    )}
                                </button>
                            )}
                            <MessageInputForm
                                messageInput={messageInput}
                                setMessageInput={setMessageInput}
                                attachmentUrl={attachmentUrl}
                                setAttachmentUrl={setAttachmentUrl}
                                showAttachmentInput={showAttachmentInput}
                                setShowAttachmentInput={setShowAttachmentInput}
                                attachmentError={attachmentError}
                                setAttachmentError={setAttachmentError}
                                onSubmit={handleSendMessage}
                                canWrite={canWrite}
                                canSubmit={canSubmitMessage}
                                hasWallet={hasWallet}
                                isUserInitialized={isUserInitialized}
                                userInitError={userInitError}
                                inputRef={inputRef}
                            />
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center text-white/50">
                            {rootStatus === 'missing' && (
                                        <div className="text-center">
                                            <p className="mb-4">Root account not found</p>
                                            <button
                                                onClick={handleCreateRoot}
                                        disabled={!signer}
                                        className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
                                    >
                                        Create Root
                                    </button>
                                </div>
                            )}
                            {rootStatus === 'ready' && rooms.length === 0 && (
                                <p>No rooms yet. Create one to get started!</p>
                            )}
                            {rootStatus === 'ready' && rooms.length > 0 && (
                                <p>Select a room to view messages</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
            {toast && (
                <div
                    className={`fixed bottom-4 right-4 z-50 rounded px-4 py-2 text-xs shadow-lg ${
                        toast.tone === 'error'
                            ? 'border border-red-500/60 bg-red-950/80 text-red-200 shadow-red-900/40'
                            : 'border border-amber-400/60 bg-black/80 text-amber-200 shadow-green-900/40'
                    }`}
                >
                    {toast.text}
                </div>
            )}
            <FundingModal
                open={needsFunding && !fundingModalDismissed}
                walletAddress={initWalletAddress}
                balanceLamports={balanceLamports}
                isChecking={isUserInitializing}
                onRetry={retryUserInit}
                onClose={() => setFundingModalDismissed(true)}
            />
        </div>
    );
}
