'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountInfo } from '@solana/web3.js';
import { PublicKey } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { BorshAccountsCoder, type Idl } from '@coral-xyz/anchor';
import idl from '@/lib/onchainDB/idl.json';
import type { WalletAdapterLike } from '@/lib/onchainDB/web/provider';
import {
    initializeRootWeb,
    createTableWeb,
    writeRowWeb,
    type WriterCtx,
} from '@/lib/onchainDB/web/writer';
import { readRowsByTable, invalidateRoomCache, type Row } from '@/lib/onchainDB/web/cached-reader-integration';
import { pdaInstructionTable, pdaRoot, pdaTable } from '@/lib/onchainDB';
import { useUserInit } from '@/lib/onchainDB/hooks/use-user-init';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';
import { normalizeFileUrl } from '@/lib/utils/message-utils';
import {
    bytesToHex,
    normalizeBytes,
    decodeBytes,
    rowToMessage,
    type MessageRow,
} from '@/lib/onchainDB/utils/message-helpers';
import { mergeMessages, type MessagePayload } from '@/lib/onchainDB/shared/message';
import { usePendingMessages } from '@/lib/onchainDB/shared/use-pending-messages';
import { useOnAccountChange } from '@/lib/onchainDB/shared/useOnAccountChange';
import { useMessageIndexLoader, type FetchConfig } from '@/lib/onchainDB/shared/useMessageIndexLoader';
import { ROOT_ID, MESSAGE_COLUMNS } from '@/lib/onchainDB/constants';
import { makeRoomTimestampKey, setLastMessageTimestamp, getLastMessageTimestamp } from '@/lib/cache/message-timestamp-cache';
import { RpcConfigPrompt } from '@/components/ui/rpc-config-prompt';
import { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';

// Import new components
import { ChatHeader } from './chat-header';
import { RoomSidebar } from './room-sidebar';
import { MessageList } from './message-list';
import { MessageInputForm } from './message-input-form';
import { sendAndConfirmTx } from '@/lib/onchainDB/utils/transaction-helpers';

type ProgramIdl = Idl & { address?: string };
type RootAccountData = {
    table_seeds?: unknown[];
    tableSeeds?: unknown[];
    table_names?: unknown[];
};
type TableAccountData = {
    name?: Uint8Array | string | null;
    columnNames?: Array<Uint8Array | string> | null;
    column_names?: Array<Uint8Array | string> | null;
};

const PROGRAM_IDL = idl as ProgramIdl;

type RoomMeta = {
    seedHex: string;
    seedBytes: Uint8Array;
    name: string;
    tableAddress: string;
    instructionAddress: string;
    columns: string[];
    lastTimestamp: number;
};

type ToastTone = 'info' | 'error';
type ToastState = {
    text: string;
    tone: ToastTone;
};

const DEBUG_WS = true;
const AUTO_BOTTOM_WHEN_UNDER = 5;

const makeChannelKey = (seedHex: string) => `chat:${seedHex}`;
const channelKeyToSeed = (channelKey: string) => channelKey.replace(/^chat:/, '');
const channelKeyToRoomId = (channelKey: string) => makeRoomTimestampKey(channelKeyToSeed(channelKey));
const roomIdToChannelKey = (roomId: string) => `chat:${roomId.replace(/^room:/, '')}`;

export function ChatClient() {
    /* --------------------------------------------------------------------------
     * Context & External Hooks
     * -------------------------------------------------------------------------- */
    const { connection, endpointSource, setCustomRpcEndpoint } = useAppConnection();
    const wallet = useAppWallet();
    const {
        isInitialized: isUserInitialized,
        isInitializing: isUserInitializing,
        error: userInitError,
        retry: retryUserInit,
    } = useUserInit();
    const { logout } = usePrivy();

    const coder = useMemo(() => new BorshAccountsCoder(PROGRAM_IDL), []);
    const rootPubkey = useMemo(() => pdaRoot(ROOT_ID), []);

    /* --------------------------------------------------------------------------
     * Local State
     * -------------------------------------------------------------------------- */
    // Root state
    const [rootStatus, setRootStatus] = useState<'checking' | 'missing' | 'creating' | 'ready' | 'error'>('checking');
    const [rootAccount, setRootAccount] = useState<AccountInfo<Buffer> | null>(null);
    const [, setRootError] = useState<string | null>(null);

    // Rooms state
    const [rooms, setRooms] = useState<RoomMeta[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [roomsError, setRoomsError] = useState<string | null>(null);
    const [selectedSeed, setSelectedSeed] = useState<string | null>(null);

    // Messages state
    const {
        pendingMessages,
        addPendingMessage,
        pruneConfirmedMessages,
        removePendingMessage,
    } = usePendingMessages();

    // Room creation state
    const [newRoomName, setNewRoomName] = useState('');
    const [creatingRoom, setCreatingRoom] = useState(false);
    const [newRoomGateMint, setNewRoomGateMint] = useState('');

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
    const [roomWsConnected, setRoomWsConnected] = useState(false);
    const [slowRpcMode, setSlowRpcMode] = useState(endpointSource === 'default');
    const [toast, setToast] = useState<ToastState | null>(null);
    const [hasNewMessages, setHasNewMessages] = useState(false);

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const isAtBottomRef = useRef(true);
    const roomSocketRef = useRef<WebSocket | null>(null);
    const roomSubscribedIdsRef = useRef<Set<string>>(new Set());
    const lastAccountRefreshRef = useRef<number>(0);
    const roomWsBackoffRef = useRef<number>(0);
    const roomPingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Writer context
    const writerWallet = useMemo<WalletAdapterLike | null>(() => {
        if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
            return null;
        }
        return {
            publicKey: wallet.publicKey,
            signTransaction: wallet.signTransaction.bind(wallet),
            signAllTransactions: wallet.signAllTransactions.bind(wallet),
        };
    }, [wallet]);

    const writerCtx = useMemo<WriterCtx | null>(() => {
        if (!writerWallet) return null;
        return {
            connection,
            wallet: writerWallet,
            idl: PROGRAM_IDL,
            programId: PROGRAM_IDL.address,
        };
    }, [connection, writerWallet]);

    /* --------------------------------------------------------------------------
     * Derived Values
     * -------------------------------------------------------------------------- */
    const sortRoomsByTimestamp = useCallback((list: RoomMeta[]) => {
        return [...list].sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    }, []);

    const selectedRoom = useMemo(() => {
        return rooms.find((r) => r.seedHex === selectedSeed) || null;
    }, [rooms, selectedSeed]);
    const selectedChannelKey = useMemo(() => (selectedSeed ? makeChannelKey(selectedSeed) : null), [selectedSeed]);
    const latestRoomsRef = useRef<RoomMeta[]>(rooms);
    const latestSelectedRoomRef = useRef<RoomMeta | null>(selectedRoom);
    useEffect(() => {
        latestRoomsRef.current = rooms;
    }, [rooms]);
    useEffect(() => {
        latestSelectedRoomRef.current = selectedRoom;
    }, [selectedRoom]);
    const tableAccount = useMemo(() => (selectedRoom ? new PublicKey(selectedRoom.tableAddress) : null), [selectedRoom]);

    const walletAddress = useMemo(() => wallet.publicKey?.toBase58() || '', [wallet.publicKey]);
    const canWrite = Boolean(writerCtx && isUserInitialized);

    const showToast = useCallback((text: string, tone: ToastTone = 'info') => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToast({ text, tone });
        toastTimeoutRef.current = setTimeout(() => setToast(null), 1000);
    }, []);


  const fetcher = useCallback(async (channelKey: string, fetchConfig?: FetchConfig) => {
    if (!walletAddress) return [];
    const seedHex = channelKeyToSeed(channelKey);
    const room = rooms.find((r) => r.seedHex === seedHex);
    if (!room) return [];
    const baseMaxTx = endpointSource === 'default' ? 40 : 200;
    const maxTx = fetchConfig?.maxTx ?? baseMaxTx;
    const targetSignatures = fetchConfig?.signatures;
    const rows = await readRowsByTable({
      connection,
      rootId: ROOT_ID,
      userPublicKey: walletAddress,
      tableName: room.seedHex,
      idl: PROGRAM_IDL,
      maxTx: targetSignatures?.length || maxTx,
      signatures: targetSignatures,
      onProgress: (partialRows) => {
        const partialMessages = partialRows
          .map((row: Row) => rowToMessage(row))
          .filter((message: MessageRow) => message.text || message.file);
        fetchConfig?.onProgress?.(partialMessages);
        if (endpointSource === 'default') {
          setSlowRpcMode(true);
        }
      },
      knownSignatures: fetchConfig?.knownSignatures,
    });
    return rows
      .map((row: Row) => rowToMessage(row))
      .filter((message: MessageRow) => message.text || message.file);
  }, [walletAddress, rooms, endpointSource, connection, setSlowRpcMode]);

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
    } = useMessageIndexLoader({
        channelKey: selectedChannelKey,
        resolveChannelMeta,
        fetcher,
        connection,
        endpointSource,
        onRowsApplied: ({ channelKey, seedHex, rows }) => {
            const latestTimestamp = rows.reduce((max, msg) => Math.max(max, msg.timestamp ?? 0), 0);
            if (latestTimestamp) {
                setLastMessageTimestamp(makeRoomTimestampKey(seedHex), latestTimestamp);
                setRoomAlerts((prev) => ({ ...prev, [channelKey]: false, [seedHex]: false }));
            }
        },
        runWithRpcRateLimit,
    });

    const allMessages = useMemo(() => mergeMessages(messages, pendingMessages), [messages, pendingMessages]);

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

    useEffect(() => {
        setSlowRpcMode(endpointSource === 'default');
    }, [endpointSource]);

    /* --------------------------------------------------------------------------
     * Effects: Root Lifecycle
     * -------------------------------------------------------------------------- */
    // Check root account
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const acc = await connection.getAccountInfo(rootPubkey);
                if (!mounted) return;
                if (acc) {
                    setRootStatus('ready');
                    setRootAccount(acc);
                } else {
                    setRootStatus('missing');
                }
            } catch (err) {
                if (!mounted) return;
                console.error('[ChatClient] Failed to check root:', err);
                setRootStatus('error');
                setRootError(err instanceof Error ? err.message : 'Unknown error');
            }
        })();
        return () => {
            mounted = false;
        };
    }, [connection, rootPubkey]);

    // Create root if missing
    const handleCreateRoot = useCallback(async () => {
        if (!writerCtx) return;
        setRootStatus('creating');
        try {
            const { tx } = await initializeRootWeb(writerCtx, ROOT_ID);
            await sendAndConfirmTx(connection, writerCtx.wallet, tx, '[ChatClient] Root initialized:');
            const acc = await connection.getAccountInfo(rootPubkey);
            setRootAccount(acc);
            setRootStatus('ready');
        } catch (err) {
            console.error('[ChatClient]Create root error:', err);
            setRootStatus('error');
            setRootError(err instanceof Error ? err.message : 'Failed to create root');
        }
    }, [writerCtx, connection, rootPubkey]);

    /* --------------------------------------------------------------------------
     * Data Loading Helpers
     * -------------------------------------------------------------------------- */
    // Load rooms
    const loadRooms = useCallback(async () => {
        if (rootStatus !== 'ready' || !rootAccount) return;
        setRoomsLoading(true);
        setRoomsError(null);
        try {
            const decoded = coder.decode('Root', rootAccount.data) as RootAccountData | null;
            if (!decoded) throw new Error('Failed to decode root account');

            // Use table_seeds from the root account; exclude global tables
            const seedsRaw = decoded.table_seeds ?? decoded.tableSeeds ?? decoded.table_names ?? [];

            const uniqueSeeds = Array.from(
                new Map(
                    seedsRaw
                        .map((entry) => normalizeBytes(entry))
                        .filter((seed) => seed.length)
                        .map((seed) => [bytesToHex(seed), seed] as const)
                ).values()
            );

            const roomList: RoomMeta[] = [];
            for (const seed of uniqueSeeds) {
                const tablePda = pdaTable(rootPubkey, seed);
                const instrPda = pdaInstructionTable(rootPubkey, seed);
                const tableAcc = await connection.getAccountInfo(tablePda);
                if (!tableAcc) continue;
                const tableDecoded = coder.decode('Table', tableAcc.data) as TableAccountData | null;
                if (!tableDecoded) continue;
                const name = decodeBytes(tableDecoded.name);
                const columnSource = tableDecoded.columnNames ?? tableDecoded.column_names ?? [];
                const columns = columnSource.map((value) => decodeBytes(value));
                const decodedRecord = tableDecoded as Record<string, unknown>;
                const lastTimestampRaw =
                    (decodedRecord.last_timestamp as number | string | undefined)
                    ?? (decodedRecord.lastTimestamp as number | string | undefined)
                    ?? 0;
                const lastTimestamp = typeof lastTimestampRaw === 'number'
                    ? lastTimestampRaw
                    : Number(lastTimestampRaw || 0);
                roomList.push({
                    seedHex: bytesToHex(seed),
                    seedBytes: seed,
                    name,
                    tableAddress: tablePda.toBase58(),
                    instructionAddress: instrPda.toBase58(),
                    columns,
                    lastTimestamp,
                });
            }
            setRooms(sortRoomsByTimestamp(roomList));


        } catch (err) {
            console.error('[ChatClient] Load rooms error:', err);
            setRoomsError(err instanceof Error ? err.message : 'Failed to load rooms');
        } finally {
            setRoomsLoading(false);
        }
    }, [rootStatus, rootAccount, coder, connection, rootPubkey, sortRoomsByTimestamp]);

    /* --------------------------------------------------------------------------
     * Effects: Room & Message Loading
     * -------------------------------------------------------------------------- */
    const lastRootAccountRef = useRef<AccountInfo<Buffer> | null>(null);
    useEffect(() => {
        if (rootStatus !== 'ready' || !rootAccount) {
            lastRootAccountRef.current = null;
            return;
        }
        if (lastRootAccountRef.current === rootAccount) {
            return;
        }
        lastRootAccountRef.current = rootAccount;
        loadRooms();
    }, [rootStatus, rootAccount, loadRooms]);

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

    const handleRoomSocketPayload = useCallback(async (payload: { type?: string; roomId?: string; lastTimestamp?: number; timestamp?: number; signature?: string }) => {
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

        await invalidateRoomCache(seedHex);

        // Signature-targeted refresh path
        if (signature) {
            try {
                await targetedDecode(channelKey, signature);
                if (DEBUG_WS) {
                    console.log('[WS] signature-targeted append', {
                        channelKey,
                        signature,
                    });
                }
                if (selectedChannelKey === channelKey) {
                    return;
                }
            } catch (error) {
                console.error('[ChatClient] Failed to load targeted signature', signature.slice(0, 8), error);
            }
        }

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
        if (currentRoom?.seedHex === seedHex) {
            try {
                await triggerLiveLatest(channelKey, { skipLoadingState: true });
            } catch (error) {
                console.error('[ChatClient] Failed to refresh room after notification', error);
            }
        } else {
            setRoomAlerts((prev) => ({ ...prev, [channelKey]: true, [seedHex]: true }));
        }
    }, [triggerLiveLatest, sortRoomsByTimestamp, targetedDecode, selectedChannelKey]);

    const roomSocketHandlerRef = useRef<typeof handleRoomSocketPayload | null>(null);
    useEffect(() => {
        roomSocketHandlerRef.current = handleRoomSocketPayload;
    }, [handleRoomSocketPayload]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = process.env.NEXT_PUBLIC_NOTI_WS_URL || 'ws://localhost:8080';
        let active = true;

        const clearPing = () => {
            if (roomPingIntervalRef.current) {
                clearInterval(roomPingIntervalRef.current);
                roomPingIntervalRef.current = null;
            }
        };

        const scheduleReconnect = () => {
            setRoomWsConnected(false);
            clearPing();
            roomSubscribedIdsRef.current.clear();
            roomSocketRef.current = null;
            if (!active) return;
            roomWsBackoffRef.current = Math.min(
                roomWsBackoffRef.current ? roomWsBackoffRef.current * 2 : 2000,
                30000
            );
            setTimeout(connect, roomWsBackoffRef.current);
        };

        const connect = () => {
            if (!active) return;
            try {
                const socket = new WebSocket(url);
                roomSocketRef.current = socket;

                socket.addEventListener('open', () => {
                    if (!active) return;
                    console.log('[ChatClient] WS connected');
                    roomWsBackoffRef.current = 0;
                    setRoomWsConnected(true);
                    clearPing();
                    roomPingIntervalRef.current = setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: 'ping' }));
                        }
                    }, 20000);
                });

                const handleMessage = (event: MessageEvent) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data?.type === 'pong') return;
                        console.log('[ChatClient] WS message:', data);
                        if (data && (data.type === 'roomUpdated' || data.type === 'roomSnapshot' || data.type === 'messageSent')) {
                            const handler = roomSocketHandlerRef.current;
                            if (handler) {
                                void handler(data);
                            }
                        }
                    } catch (error) {
                        console.warn('[ChatClient] Failed to parse notification payload', error);
                    }
                };

                socket.addEventListener('message', handleMessage);

                socket.addEventListener('close', () => {
                    console.log('[ChatClient] WS connection closed');
                    scheduleReconnect();
                });

                socket.addEventListener('error', (error) => {
                    console.warn('[ChatClient] WS error', error);
                });
            } catch (error) {
                console.warn('[ChatClient] Failed to connect notification socket', error);
                scheduleReconnect();
            }
        };

        connect();

        return () => {
            active = false;
            clearPing();
            roomSubscribedIdsRef.current.clear();
            roomSocketRef.current?.close();
            roomSocketRef.current = null;
        };
        // We intentionally avoid including handleRoomSocketPayload in deps to keep the socket alive.
    }, []);

    // Wrapper for current room
    const loadMessages = useCallback(async () => {
        if (!selectedChannelKey) return;
        await triggerLiveLatest(selectedChannelKey);
    }, [selectedChannelKey, triggerLiveLatest]);

    useEffect(() => {
        if (!walletAddress || !selectedChannelKey) return;
        loadMessages();
    }, [walletAddress, selectedChannelKey, loadMessages]);

    useEffect(() => {
        if (!pendingMessages.length) return;
        pruneConfirmedMessages(messages);
    }, [messages, pendingMessages.length, pruneConfirmedMessages]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    /* --------------------------------------------------------------------------
     * Effects: Account Change Subscriptions
     * -------------------------------------------------------------------------- */
    const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const refreshMessagesFromAccount = useCallback(() => {
        if (!selectedChannelKey) return;

        if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
        }

        const now = Date.now();
        if (now - lastAccountRefreshRef.current < 1000) {
            return;
        }
        lastAccountRefreshRef.current = now;

        refreshTimeoutRef.current = setTimeout(() => {
            void triggerLiveLatest(selectedChannelKey, { skipLoadingState: true });
        }, 150);
    }, [selectedChannelKey, triggerLiveLatest]);

    useOnAccountChange({
        connection,
        account: tableAccount,
        handler: refreshMessagesFromAccount,
        commitment: 'processed',
        enabled:
            !roomWsConnected &&
            (typeof document === 'undefined' || document.visibilityState === 'visible'),
    });

    /* --------------------------------------------------------------------------
     * Effects: UI Sync
     * -------------------------------------------------------------------------- */
    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
        isAtBottomRef.current = true;
        setHasNewMessages(false);
    }, []);

    const updateIsAtBottom = useCallback(() => {
        const el = listRef.current;
        if (!el) return;
        const threshold = 80;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        const atBottom = distance < threshold;
        isAtBottomRef.current = atBottom;
        if (atBottom) {
            setHasNewMessages(false);
        }

        // Trigger backfill when user scrolls near the top; runs independently of live path.
        const nearTop = el.scrollTop < 120;
        if (nearTop && selectedChannelKey) {
            void triggerBackfill(selectedChannelKey);
        }
    }, [selectedChannelKey, triggerBackfill]);

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

        if (mode === 'prepend') {
            // Keep view anchored when older messages are prepended.
            const delta = nextHeight - prevHeight;
            el.scrollTop = prevTop + delta;
            isAtBottomRef.current = false;
            setHasNewMessages(false);
        } else if (mode === 'append') {
            if (allMessages.length <= AUTO_BOTTOM_WHEN_UNDER) {
                scrollToBottom('auto');
                setHasNewMessages(false);
                isAtBottomRef.current = true;
            } else if (isAtBottomRef.current) {
                scrollToBottom('auto');
            } else {
                setHasNewMessages(true);
            }
        }

        // Reset mode for next change
        lastInsertModeRef.current[selectedChannelKey] = null;
        prevScrollHeightRef.current = nextHeight;
        prevScrollTopRef.current = el.scrollTop;
    }, [allMessages, selectedChannelKey, scrollToBottom, lastInsertModeRef]);

    // Reset scroll indicators when switching rooms
    useEffect(() => {
        isAtBottomRef.current = true;
        setHasNewMessages(false);
        scrollToBottom('auto');
    }, [selectedChannelKey, scrollToBottom]);

    /* --------------------------------------------------------------------------
     * Event Handlers
     * -------------------------------------------------------------------------- */
    // Handle create room
    const handleCreateRoom = useCallback(async (e: FormEvent) => {
        e.preventDefault();
        if (!writerCtx || !newRoomName.trim()) return;

        setCreatingRoom(true);
        setRoomsError(null);

        try {
            const gateMintPubkey = newRoomGateMint?.trim()
                ? new PublicKey(newRoomGateMint.trim())
                : undefined;

            const { tx } = await createTableWeb(
                writerCtx,
                ROOT_ID,
                newRoomName.trim(),
                [...MESSAGE_COLUMNS],
                { idColumn: 'id', gateMint: gateMintPubkey }
            );

            await sendAndConfirmTx(connection, writerCtx.wallet, tx, '[ChatClient] Room created:');

            setNewRoomName('');
            setNewRoomGateMint('');
            await loadRooms();
        } catch (err) {
            console.error('[ChatClient] Create room error:', err);
            setRoomsError(err instanceof Error ? err.message : 'Failed to create room');
        } finally {
            setCreatingRoom(false);
        }
    }, [writerCtx, newRoomName, newRoomGateMint, connection, loadRooms]);

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

    // Handle send message
    const handleSendMessage = useCallback(async (e?: FormEvent) => {
        e?.preventDefault();
        if (!writerCtx || !selectedRoom || !messageInput.trim() || !writerCtx.wallet.publicKey) return;

        const messageId = crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10);
        const timestamp = Date.now();
        const userAddr = writerCtx.wallet.publicKey.toBase58();
        const fileUrl = normalizeFileUrl(attachmentUrl);
        if (attachmentUrl.trim() && !fileUrl) {
            setAttachmentError('Invalid attachment URL. Must be a valid https:// link.');
            return;
        }

        const payload: MessagePayload = {
            id: messageId,
            text: messageInput.trim(),
            sender: userAddr,
            timestamp,
        };

        if (fileUrl) {
            payload.file = fileUrl;
        }

        setMessageInput('');
        setAttachmentUrl('');
        setAttachmentError(null);
        setShowAttachmentInput(false);

        addPendingMessage(payload);

        try {
            const { tx } = await writeRowWeb(writerCtx, ROOT_ID, selectedRoom.seedHex, JSON.stringify(payload));
            const signature = await sendAndConfirmTx(connection, writerCtx.wallet, tx, '[ChatClient] Message submitted:');
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
            removePendingMessage(messageId);
            // Invalidate cache so WebSocket listeners get fresh data
            await invalidateRoomCache(selectedRoom.seedHex);
            console.log('[handleSendMessage] Cache invalidated for room:', selectedRoom.seedHex.slice(0, 8));
            notifyRoomMessageSent(selectedRoom.seedHex, timestamp, signature);
            // Scroll after DOM updates on next frame
            requestAnimationFrame(() => scrollToBottom('smooth'));
        } catch (err) {
            console.error('[ChatClient] Send message error:', err);
            const errorMessage = err instanceof Error ? err.message : 'Failed to send message';
            showToast(errorMessage, 'error');
            removePendingMessage(messageId);
        }
        if (selectedRoom) {
            const channelKey = makeChannelKey(selectedRoom.seedHex);
            setLastMessageTimestamp(makeRoomTimestampKey(selectedRoom.seedHex), timestamp);
            setRoomAlerts((prev) => ({ ...prev, [channelKey]: false, [selectedRoom.seedHex]: false }));
        }
    }, [writerCtx, selectedRoom, messageInput, attachmentUrl, connection, addPendingMessage, removePendingMessage, notifyRoomMessageSent, showToast, applyLocalRows, scrollToBottom]);

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
                    newRoomGateMint={newRoomGateMint}
                    setNewRoomGateMint={setNewRoomGateMint}
                    creatingRoom={creatingRoom}
                    onCreateRoom={handleCreateRoom}
                    rooms={rooms}
                    selectedSeed={selectedSeed}
                    onSelectRoom={setSelectedSeed}
                    roomsLoading={roomsLoading}
                    roomsError={roomsError}
                    roomAlerts={roomAlerts}
                    canWrite={canWrite}
                    writerCtx={writerCtx}
                    isUserInitialized={isUserInitialized}
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
                                onCopyAddress={handleCopyAddress}
                                onDownloadAttachment={handleDownloadAttachment}
                                copiedMessageId={copiedMessageId}
                            />
                            {hasNewMessages && allMessages.length > AUTO_BOTTOM_WHEN_UNDER && (
                                <button
                                    type="button"
                                    onClick={() => scrollToBottom('smooth')}
                                    className="absolute bottom-20 right-4 z-10 rounded bg-green-500 px-3 py-2 text-xs font-bold text-black shadow-lg hover:bg-green-400"
                                >
                                    New messages • Tap to view
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
                                writerCtx={writerCtx}
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
                                        disabled={!writerCtx}
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
        </div>
    );
}
