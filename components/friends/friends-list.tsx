/**
 * FriendsList Component
 * - Main friends list UI with tabs and actions
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useFriends } from '@/lib/friends/use-friends';
import { FriendCard } from './friend-card';
import { AddFriendForm } from './add-friend-form';
import { configs, requestDmWeb, manageDmWeb, writeDmRowWeb, type WriterCtx } from '@/lib/onchainDB';
import { readRowsByDmSeed, invalidateDmCache } from '@/lib/onchainDB/web/cached-reader-integration';
import { deriveDmSeed, shortenAddress } from '@/lib/friends/utils';
import { DM_STATUS } from '@/lib/friends/types';
import type { Friend } from '@/lib/friends/types';
import idl from '@/lib/onchainDB/idl.json';
import { Idl } from '@coral-xyz/anchor';
import type { WalletAdapterLike } from '@/lib/onchainDB/web/provider';
import { Window, WindowHeader, WindowContent, Button, Cutout } from 'react95';
import { MessageBubble } from '@/components/ui/message-bubble';
import { MessageInputForm } from '@/components/chat/message-input-form';
import { normalizeFileUrl } from '@/lib/utils/message-utils';
import { GlobalStyles } from './theme';
import { ROOT_ID, MESSAGE_COLUMNS } from '@/lib/onchainDB/constants';
import { sendAndConfirmTx } from '@/lib/onchainDB/utils/transaction-helpers';
import { rowToMessage, type MessageRow } from '@/lib/onchainDB/utils/message-helpers';
import { mergeMessages, type MessagePayload } from '@/lib/onchainDB/shared/message';
import { usePendingMessages } from '@/lib/onchainDB/shared/use-pending-messages';
import { useMessageLoader, type LoaderOptions } from '@/lib/onchainDB/shared/useMessageLoader';
import { useOnAccountChange } from '@/lib/onchainDB/shared/useOnAccountChange';
import { makeDmTimestampKey, setLastMessageTimestamp, getLastMessageTimestamp } from '@/lib/cache/message-timestamp-cache';
import { NotificationToggle } from '@/components/ui/notification-toggle';
import { RpcConfigPrompt } from '@/components/ui/rpc-config-prompt';
import { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';
type Tab = 'all' | 'pending' | 'blocked';
type ProgramIdl = Idl & { address?: string };
const FRIENDS_IDL = idl as ProgramIdl;

type FriendsListProps = {
    dmQueryAddress?: string;
};

export function FriendsList({ dmQueryAddress }: FriendsListProps) {
    /* --------------------------------------------------------------------------
     * Context & External Hooks
     * -------------------------------------------------------------------------- */
    const { connection, endpointSource, setCustomRpcEndpoint } = useAppConnection();
    const wallet = useAppWallet();
    const router = useRouter();
    const userAddress = wallet?.publicKey?.toBase58();
    const { friends, loading, error: friendsError, refetch } = useFriends({
        connection,
        userAddress: userAddress || '',
        programId: configs.programId,
        idl: FRIENDS_IDL,
    });

    /* --------------------------------------------------------------------------
     * Local State
     * -------------------------------------------------------------------------- */
    // Friend list state
    const [activeTab, setActiveTab] = useState<Tab>('all');
    const [error, setError] = useState<string | null>(null);

    // DM state
    const [chatFriend, setChatFriend] = useState<Friend | null>(null);
    const [chatOpen, setChatOpen] = useState(false);
    const [chatMessages, setChatMessages] = useState<MessageRow[]>([]);
    const {
        pendingMessages: chatPendingMessages,
        addPendingMessage: addChatPendingMessage,
        pruneConfirmedMessages: pruneChatPendingMessages,
        removePendingMessage: removeChatPendingMessage,
        resetPendingMessages: resetChatPendingMessages,
    } = usePendingMessages();
    const [chatActionError, setChatActionError] = useState<string | null>(null);
    const [chatMessageInput, setChatMessageInput] = useState('');

    // Attachment state
    const [showAttachmentInput, setShowAttachmentInput] = useState(false);
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [dmNotificationsEnabled, setDmNotificationsEnabled] = useState(true);
    const [friendTimestamps, setFriendTimestamps] = useState<Record<string, number>>({});
    const [dmAlerts, setDmAlerts] = useState<Record<string, boolean>>({});
    const [dmWsConnected, setDmWsConnected] = useState(false);
    const dmFetchInFlightRef = useRef<Set<string>>(new Set());
    const DM_RATE_LIMIT = 3;
    const [chatSlowRpcMode, setChatSlowRpcMode] = useState(endpointSource === 'default');
    const dmWsBackoffRef = useRef<number>(0);
    const dmPingIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Modal/UI state
    const [addFriendModalOpen, setAddFriendModalOpen] = useState(false);
    const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
    const [friendToBlock, setFriendToBlock] = useState<Friend | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

    // Refs
    const chatMessagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);
    const dmSocketRef = useRef<WebSocket | null>(null);
    const dmSubscribedIdsRef = useRef<Set<string>>(new Set());

    /* --------------------------------------------------------------------------
     * Writer Context
     * -------------------------------------------------------------------------- */
    const writerWallet = useMemo<WalletAdapterLike | null>(() => {
        if (!wallet?.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
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
            idl: FRIENDS_IDL,
        };
    }, [connection, writerWallet]);

    /* --------------------------------------------------------------------------
     * Derived Values
     * -------------------------------------------------------------------------- */
    const isRequesterForFriend = useCallback(
        (friend: Friend) => {
            if (!userAddress) return false;
            if (friend.requester === 0 && friend.partyA === userAddress) return true;
            if (friend.requester === 1 && friend.partyB === userAddress) return true;
            return false;
        },
        [userAddress]
    );

    const canSendChatToFriend = useCallback(
        (friend: Friend) => {
            if (!userAddress) return false;
            if (friend.status === 'approved') return true;
            if (friend.status === 'pending') {
                return isRequesterForFriend(friend);
            }
            return false;
        },
        [isRequesterForFriend, userAddress]
    );

    // Filter friends by tab
    const friendMapBySeedHex = useMemo(() => {
        const map: Record<string, Friend> = {};
        friends.forEach((friend) => {
            if (friend.dmSeedHex) {
                map[friend.dmSeedHex] = friend;
            }
        });
        return map;
    }, [friends]);

    useEffect(() => {
        setFriendTimestamps((prev) => {
            const next: Record<string, number> = { ...prev };
            friends.forEach((friend) => {
                if (!friend.dmSeedHex) return;
                const candidate = friend.lastTimestamp ?? 0;
                if (!(friend.dmSeedHex in next) || candidate > next[friend.dmSeedHex]) {
                    next[friend.dmSeedHex] = candidate;
                }
            });
            // Remove entries for friends that no longer exist
            Object.keys(next).forEach((key) => {
                if (!friends.some((friend) => friend.dmSeedHex === key)) {
                    delete next[key];
                }
            });
            return next;
        });
    }, [friends]);

    useEffect(() => {
        const alerts: Record<string, boolean> = {};
        friends.forEach((friend) => {
            if (!friend.dmSeedHex) return;
            const latest = friendTimestamps[friend.dmSeedHex] ?? friend.lastTimestamp ?? 0;
            const cached = getLastMessageTimestamp(makeDmTimestampKey(friend.dmSeedHex)) ?? 0;
            alerts[friend.dmSeedHex] = Boolean(latest && latest > cached);
        });
        setDmAlerts(alerts);
    }, [friends, friendTimestamps]);

    const showToast = useCallback((text: string) => {
        if (toastTimeoutRef.current) {
            clearTimeout(toastTimeoutRef.current);
        }
        setToastMessage(text);
        toastTimeoutRef.current = setTimeout(() => setToastMessage(null), 1000);
    }, []);

    useEffect(() => {
        for (const friend of friends) {
            if (chatOpen && chatFriend?.dmSeedHex === friend.dmSeedHex) continue;
            if (!friend.dmSeedHex) continue;
            const latest = friendTimestamps[friend.dmSeedHex] ?? friend.lastTimestamp ?? 0;
            const cached = getLastMessageTimestamp(makeDmTimestampKey(friend.dmSeedHex)) ?? 0;
            if (latest && latest > cached) {
                const label = friend.displayName || shortenAddress(friend.address, 6);
                showToast(`New message available from ${label}`);
                break;
            }
        }
    }, [friends, friendTimestamps, showToast]);

    useEffect(() => {
        setChatSlowRpcMode(endpointSource === 'default');
    }, [endpointSource]);

    const enrichedFriends = useMemo(() => {
        return friends.map((friend) => ({
            ...friend,
            lastTimestamp: friendTimestamps[friend.dmSeedHex] ?? friend.lastTimestamp ?? 0,
        }));
    }, [friends, friendTimestamps]);

    const filteredFriends = useMemo(() => {
        let list: Friend[] = [];
        if (activeTab === 'all') {
            list = enrichedFriends.filter((f) => f.status === 'approved');
        } else if (activeTab === 'pending') {
            list = enrichedFriends.filter((f) => f.status === 'pending');
        } else if (activeTab === 'blocked') {
            list = enrichedFriends.filter((f) => f.status === 'blocked');
        } else {
            list = enrichedFriends;
        }
        return [...list].sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    }, [enrichedFriends, activeTab]);

    const orderedChatMessages = useMemo(
        () => mergeMessages(chatMessages, chatPendingMessages),
        [chatMessages, chatPendingMessages]
    );

    const existingChatSignatures = useMemo(() => {
        const sigs = new Set<string>();
        chatMessages.forEach((msg) => {
            if (msg.signature) sigs.add(msg.signature);
        });
        return sigs;
    }, [chatMessages]);

    useEffect(() => {
        setChatMessages([]);
        resetChatPendingMessages();
    }, [chatFriend?.dmSeedHex, resetChatPendingMessages]);

    useEffect(() => {
        return () => {
            if (toastTimeoutRef.current) {
                clearTimeout(toastTimeoutRef.current);
            }
        };
    }, []);

    const upsertChatMessages = useCallback((incoming: MessageRow[]) => {
        if (!incoming.length) return;
        setChatMessages((prev) => {
            const map = new Map<string, MessageRow>();
            [...prev, ...incoming].forEach((msg) => {
                if (!msg) return;
                const key = msg.signature || msg.id || `${msg.timestamp ?? 0}-${msg.sender ?? ''}`;
                map.set(key, msg);
            });
            return Array.from(map.values()).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
        });
    }, []);

    const chatFriendTable = useMemo(() => {
        if (!chatFriend) return null;
        try {
            return new PublicKey(chatFriend.tableAddress);
        } catch (error) {
            console.warn('[FriendsList] Invalid chat table address:', error);
            return null;
        }
    }, [chatFriend]);

    /* --------------------------------------------------------------------------
     * Data Loading Helpers
     * -------------------------------------------------------------------------- */
    const fetcher = useCallback(async (friend: Friend) => {
        if (!userAddress) return [];
        const maxTx = endpointSource === 'default' ? 40 : 200;
        const rows = await readRowsByDmSeed({
            connection,
            rootId: ROOT_ID,
            userPublicKey: userAddress,
            idl: FRIENDS_IDL,
            dmSeed: friend.dmSeed,
            maxTx,
            onProgress: (partialRows) => {
                if (chatFriend && chatFriend.dmSeedHex !== friend.dmSeedHex) return;
                const partialMessages = partialRows
                    .map((row) => rowToMessage(row))
                    .filter((message) => message.text || message.file);
                upsertChatMessages(partialMessages);
                if (endpointSource === 'default') {
                    setChatSlowRpcMode(true);
                }
            },
            knownSignatures: existingChatSignatures,
        });
        return rows
            .map((row) => rowToMessage(row))
            .filter((message) => message.text || message.file);
    }, [connection, userAddress, endpointSource, chatFriend, upsertChatMessages, existingChatSignatures]);

    const {
        loadMessages: loadDmMessages,
        messagesLoading: chatLoading,
        messagesError: chatLoaderError,
        showLoadingSpinner: showChatLoadingSpinner,
    } = useMessageLoader<[Friend]>({
        fetcher,
    });
    const chatError = chatActionError ?? chatLoaderError;

    const scrollChatToBottom = useCallback(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }, []);

    const loadChatHistory = useCallback(
        async (friend: Friend | null, options?: LoaderOptions) => {
            if (!friend) return;
            const dmKey = friend.dmSeedHex;
            if (dmKey && dmFetchInFlightRef.current.has(dmKey)) {
                console.log('[FriendsList] Skipping DM fetch, already in-flight for', dmKey.slice(0, 8));
                return;
            }
            if (dmKey) dmFetchInFlightRef.current.add(dmKey);
            try {
                const rows = await runWithRpcRateLimit(
                    () => loadDmMessages(friend, options),
                    {
                        enabled: endpointSource === 'default',
                        maxPerSecond: DM_RATE_LIMIT,
                    }
                );
                upsertChatMessages(rows);
                const latestTimestamp = rows.reduce((max, msg) => {
                    const ts = msg.timestamp ?? 0;
                    return ts > max ? ts : max;
                }, 0);
                if (latestTimestamp && friend.dmSeedHex) {
                    setLastMessageTimestamp(makeDmTimestampKey(friend.dmSeedHex), latestTimestamp);
                    setFriendTimestamps((prev) => ({ ...prev, [friend.dmSeedHex]: latestTimestamp }));
                    setDmAlerts((prev) => ({ ...prev, [friend.dmSeedHex]: false }));
                }
            } catch (err) {
                console.error('[FriendsList] Failed to load DM conversation', err);
            } finally {
                if (dmKey) dmFetchInFlightRef.current.delete(dmKey);
            }
        },
        [loadDmMessages, endpointSource, upsertChatMessages]
    );

    const appendLatestChatMessage = useCallback(
        async (friend: Friend | null) => {
            if (!friend || !userAddress) return;
            if (friend.dmSeedHex && dmFetchInFlightRef.current.has(friend.dmSeedHex)) {
                return;
            }
            try {
                if (friend.dmSeedHex) dmFetchInFlightRef.current.add(friend.dmSeedHex);
                await invalidateDmCache(friend.dmSeed);
                const rows = await runWithRpcRateLimit(
                    () =>
                        readRowsByDmSeed({
                            connection,
                            rootId: ROOT_ID,
                            userPublicKey: userAddress,
                            idl: FRIENDS_IDL,
                            dmSeed: friend.dmSeed,
                            maxTx: 5,
                            perTableLimit: 1,
                        }),
                    {
                        enabled: endpointSource === 'default',
                        maxPerSecond: DM_RATE_LIMIT,
                    }
                );
                const latest = rows
                    .map((row) => rowToMessage(row))
                    .find((message) => message.text || message.file);
                if (!latest) return;

                setChatMessages((prev) => {
                    if (prev.some((msg) => msg.id === latest.id)) {
                        return prev;
                    }
                    const next = [...prev, latest];
                    next.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                    return next;
                });

                if (friend.dmSeedHex) {
                    setLastMessageTimestamp(
                        makeDmTimestampKey(friend.dmSeedHex),
                        latest.timestamp ?? Date.now()
                    );
                    setFriendTimestamps((prev) => ({
                        ...prev,
                        [friend.dmSeedHex]: latest.timestamp ?? Date.now(),
                    }));
                    setDmAlerts((prev) => ({ ...prev, [friend.dmSeedHex]: false }));
                }
            } catch (error) {
                console.error('[FriendsList] Failed to append latest DM message', error);
                throw error;
            } finally {
                if (friend.dmSeedHex) dmFetchInFlightRef.current.delete(friend.dmSeedHex);
            }
        },
        [connection, userAddress, endpointSource]
    );

    const handleDmSocketPayload = useCallback(async (payload: { type?: string; roomId?: string; lastTimestamp?: number }) => {
        const roomId = payload?.roomId;
        if (!roomId || !roomId.startsWith('dm:')) {
            return;
        }
        const dmSeedHex = roomId.slice(3);
        const incomingTimestamp = typeof payload.lastTimestamp === 'number'
            ? payload.lastTimestamp
            : Number(payload.lastTimestamp || 0);

        const targetFriend = friendMapBySeedHex[dmSeedHex];
        if (targetFriend) {
            try {
                await invalidateDmCache(targetFriend.dmSeed);
            } catch (error) {
                console.error('[FriendsList] Failed to invalidate DM cache', error);
            }
        }

        setFriendTimestamps((prev) => {
            const current = prev[dmSeedHex] ?? 0;
            if (incomingTimestamp <= current) {
                return prev;
            }
            return { ...prev, [dmSeedHex]: incomingTimestamp };
        });

        if (chatFriend?.dmSeedHex === dmSeedHex && chatOpen) {
            try {
                await appendLatestChatMessage(chatFriend);
            } catch (error) {
                console.error('[FriendsList] Failed to refresh DM after notification', error);
            }
        } else {
            setDmAlerts((prev) => ({ ...prev, [dmSeedHex]: true }));
            const targetFriend = friendMapBySeedHex[dmSeedHex];
            if (targetFriend) {
                const label = targetFriend.displayName || shortenAddress(targetFriend.address, 6);
                showToast(`New message from ${label}`);
            }
        }
    }, [appendLatestChatMessage, chatFriend, chatOpen, friendMapBySeedHex, showToast, shortenAddress]);

    const handleOpenChat = useCallback(async (friend: Friend) => {
        setChatFriend(friend);
        setChatActionError(null);
        setChatMessageInput('');
        setChatOpen(true);
        await loadChatHistory(friend);
        setTimeout(() => {
            scrollChatToBottom();
        }, 0);
    }, [loadChatHistory, scrollChatToBottom]);

    const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleDmLogs = useCallback(() => {
        if (!chatFriend) return;

        if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
        }

        refreshTimeoutRef.current = setTimeout(async () => {
            try {
                await appendLatestChatMessage(chatFriend);
            } catch (error) {
                console.error('[FriendsList] Failed to append latest message, reloading history:', error);
                try {
                    await loadChatHistory(chatFriend, { skipLoadingState: true });
                } catch (reloadError) {
                    console.error('[FriendsList] Failed fallback reload after append error:', reloadError);
                }
            }
        }, 500);
    }, [appendLatestChatMessage, chatFriend, loadChatHistory]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, []);

    /* --------------------------------------------------------------------------
     * Effects
     * -------------------------------------------------------------------------- */
    useEffect(() => {
        if (!dmQueryAddress) return;
        const friend = friends.find((f) => f.address === dmQueryAddress);
        if (!friend) return;

        void handleOpenChat(friend);
        router.replace('/friends', { scroll: false });
    }, [dmQueryAddress, friends, handleOpenChat, router]);

    useEffect(() => {
        if (chatOpen) {
            scrollChatToBottom();
        }
    }, [chatMessages, chatPendingMessages, chatOpen, scrollChatToBottom]);

    useEffect(() => {
        if (!chatPendingMessages.length) return;
        pruneChatPendingMessages(chatMessages);
    }, [chatMessages, chatPendingMessages.length, pruneChatPendingMessages]);

    useOnAccountChange({
        connection,
        account: chatFriendTable,
        handler: () => {
            void handleDmLogs();
        },
        commitment: 'processed',
        enabled: !dmWsConnected,
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const url = process.env.NEXT_PUBLIC_NOTI_WS_URL || 'ws://localhost:8080';
        let active = true;

        const clearPing = () => {
            if (dmPingIntervalRef.current) {
                clearInterval(dmPingIntervalRef.current);
                dmPingIntervalRef.current = null;
            }
        };

        const scheduleReconnect = () => {
            setDmWsConnected(false);
            clearPing();
            dmSubscribedIdsRef.current.clear();
            dmSocketRef.current = null;
            if (!active) return;
            dmWsBackoffRef.current = Math.min(
                dmWsBackoffRef.current ? dmWsBackoffRef.current * 2 : 2000,
                30000
            );
            setTimeout(connect, dmWsBackoffRef.current);
        };

        const connect = () => {
            if (!active) return;
            try {
                const socket = new WebSocket(url);
                dmSocketRef.current = socket;

                socket.addEventListener('open', () => {
                    if (!active) return;
                    console.log('[FriendsList] DM WS connected');
                    dmWsBackoffRef.current = 0;
                    setDmWsConnected(true);
                    clearPing();
                    dmPingIntervalRef.current = setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ type: 'ping' }));
                        }
                    }, 20000);
                });

                socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data?.type === 'pong') return;
                        console.log('[FriendsList] DM WS message:', data);
                        if (data && (data.type === 'roomUpdated' || data.type === 'roomSnapshot')) {
                            void handleDmSocketPayload(data);
                        }
                    } catch (error) {
                        console.warn('[FriendsList] Failed to parse DM notification payload', error);
                    }
                });

                socket.addEventListener('close', () => {
                    console.log('[FriendsList] DM WS closed');
                    scheduleReconnect();
                });

                socket.addEventListener('error', (error) => {
                    console.warn('[FriendsList] DM WS error', error);
                });
            } catch (error) {
                console.warn('[FriendsList] Failed to connect DM notifications', error);
                scheduleReconnect();
            }
        };

        connect();

        return () => {
            active = false;
            clearPing();
            dmSubscribedIdsRef.current.clear();
            dmSocketRef.current?.close();
            dmSocketRef.current = null;
        };
    }, [handleDmSocketPayload]);

    useEffect(() => {
        if (!dmWsConnected || !dmSocketRef.current) return;
        if (dmSocketRef.current.readyState !== WebSocket.OPEN) {
            console.warn('[FriendsList] DM WS not ready, state =', dmSocketRef.current.readyState);
            return;
        }
        const socket = dmSocketRef.current;
        const desired = new Set(
            friends
                .map((friend) => friend.dmSeedHex)
                .filter((seed): seed is string => Boolean(seed))
                .map((seed) => makeDmTimestampKey(seed))
        );
        const current = dmSubscribedIdsRef.current;

        for (const id of desired) {
            if (!current.has(id)) {
                socket.send(JSON.stringify({ type: 'subscribe', roomId: id }));
                current.add(id);
            }
        }

        for (const id of Array.from(current)) {
            if (!desired.has(id)) {
                socket.send(JSON.stringify({ type: 'unsubscribe', roomId: id }));
                current.delete(id);
            }
        }

        dmSubscribedIdsRef.current = desired;
    }, [friends, dmWsConnected]);

    /* --------------------------------------------------------------------------
     * Event Handlers
     * -------------------------------------------------------------------------- */
    const handleAddFriend = async (friendAddress: string) => {
        setError(null);
        if (!userAddress || !wallet) {
            throw new Error('Wallet not connected');
        }

        if (friendAddress === userAddress) {
            throw new Error('Cannot add yourself as a friend');
        }
        console.log('[FriendsList] Sending friend request to:', friendAddress);

        const existing = friends.find((f) => f.address === friendAddress);
        if (existing) {
            if (existing.status === 'approved') {
                throw new Error('You are already friends with this user');
            } else if (existing.status === 'pending') {
                throw new Error('Friend request already pending');
            } else if (existing.status === 'blocked') {
                throw new Error('This user is blocked. Unblock them first');
            }
        }

        const dmSeed = deriveDmSeed(userAddress, friendAddress);

        if (!writerCtx) {
            throw new Error('Wallet not connected');
        }

        try {
            const { tx } = await requestDmWeb(
                writerCtx,
                ROOT_ID,
                dmSeed,
                'dm',
                [...MESSAGE_COLUMNS],
                friendAddress,
                {},
                { idColumn: 'id' }
            );
            await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend request sent:');
            await refetch();
            setAddFriendModalOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send request';
            setError(message);

            const maybeLogs = extractErrorLogs(err);
            if (maybeLogs) {
                console.error('[FriendsList] requestDmWeb logs', maybeLogs);
            }
            console.error('[FriendsList] requestDmWeb error', err);

            throw err;
        }
    };

    const handleApproveFriend = async (friend: Friend) => {
        if (!wallet) throw new Error('Wallet not connected');

        console.log('[FriendsList] Approving friend:', {
            friendAddress: friend.address,
            dmSeedHex: friend.dmSeedHex,
            tableAddress: friend.tableAddress,
            partyA: friend.partyA,
            partyB: friend.partyB,
        });

        const writerCtx: WriterCtx = {
            connection,
            wallet,
            idl: idl as Idl,
        };

        setError(null);

        try {
            const { tx, dmTable } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.APPROVED);

            console.log('[FriendsList] DMTable PDA:', dmTable);
            console.log('[FriendsList] Expected:', friend.tableAddress);

            await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend approved:');
            await refetch();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to approve friend';
            setError(message);
            console.error('[FriendsList] Failed to approve friend', err);
        }
    };

    const showBlockConfirm = (friend: Friend) => {
        setFriendToBlock(friend);
        setBlockConfirmOpen(true);
    };

    const handleBlockFriend = async () => {
        if (!writerCtx || !friendToBlock) return;

        setError(null);
        setBlockConfirmOpen(false);

        try {
            const { tx } = await manageDmWeb(writerCtx, ROOT_ID, friendToBlock.dmSeed, DM_STATUS.BLOCKED);

            await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend blocked:');
            await refetch();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to block friend';
            setError(message);
            console.error('[FriendsList] Failed to block friend', err);
        } finally {
            setFriendToBlock(null);
        }
    };

    const handleUnblockFriend = async (friend: Friend) => {
        if (!writerCtx) throw new Error('Wallet not connected');

        setError(null);

        try {
            const { tx } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.APPROVED);

            await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend unblocked:');
            await refetch();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to unblock friend';
            setError(message);
            console.error('[FriendsList] Failed to unblock friend', err);
        }
    };

    const notifyDmMessageSent = useCallback((dmSeedHex: string, ts: number) => {
        const socket = dmSocketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            console.warn('[FriendsList] DM notify skipped, state =', socket?.readyState ?? 'no socket');
            return;
        }
        try {
            socket.send(
                JSON.stringify({
                    type: 'messageSent',
                    roomId: makeDmTimestampKey(dmSeedHex),
                    timestamp: ts,
                })
            );
            console.log('[FriendsList] DM notify sent for', dmSeedHex.slice(0, 8), 'ts', ts);
        } catch (error) {
            console.warn('[FriendsList] Failed to emit DM notification', error);
        }
    }, []);

    const handleSendChatMessage = async (event?: FormEvent) => {
        event?.preventDefault();
        if (!chatFriend || !writerCtx || !userAddress) return;
        const text = chatMessageInput.trim();
        if (!text) return;
        if (!canSendChatToFriend(chatFriend)) {
            setChatActionError('Approve the request to continue this conversation.');
            return;
        }

        const fileUrl = normalizeFileUrl(attachmentUrl);
        if (attachmentUrl.trim() && !fileUrl) {
            setAttachmentError('Invalid attachment URL. Must be a valid https:// link.');
            return;
        }

        const messageId =
            typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID().slice(0, 12)
                : Math.random().toString(36).slice(2, 10);

        const timestamp = Date.now();

        const payload: MessagePayload = {
            id: messageId,
            text,
            sender: userAddress,
            timestamp,
        };

        if (fileUrl) {
            payload.file = fileUrl;
        }

        setChatMessageInput('');
        setAttachmentUrl('');
        setAttachmentError(null);
        setShowAttachmentInput(false);
        setChatActionError(null);

        if (chatFriend?.dmSeedHex) {
            const dmKey = chatFriend.dmSeedHex;
            setLastMessageTimestamp(makeDmTimestampKey(dmKey), timestamp);
            setFriendTimestamps((prev) => ({ ...prev, [dmKey]: timestamp }));
            setDmAlerts((prev) => ({ ...prev, [dmKey]: false }));
        }

        addChatPendingMessage(payload);

        try {
            const { tx } = await writeDmRowWeb(writerCtx, ROOT_ID, chatFriend.dmSeed, JSON.stringify(payload));
            await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] DM sent:');
            if (chatFriend.dmSeedHex) {
                notifyDmMessageSent(chatFriend.dmSeedHex, timestamp);
            }
        } catch (err) {
            removeChatPendingMessage(messageId);
            const message = err instanceof Error ? err.message : 'Failed to send DM';
            setChatActionError(message);
        }
    };

    const closeChatModal = () => {
        setChatOpen(false);
        setChatFriend(null);
        setChatMessages([]);
        resetChatPendingMessages();
        setChatActionError(null);
        setChatMessageInput('');
        setAttachmentUrl('');
        setAttachmentError(null);
        setShowAttachmentInput(false);
    };

    const handleCopyAddress = useCallback((address: string, messageId: string) => {
        navigator.clipboard?.writeText(address);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
    }, []);

    const handleDownloadAttachment = useCallback((url: string) => {
        window.open(url, '_blank');
    }, []);

    return (
        <div>
            <RpcConfigPrompt
                endpointSource={endpointSource}
                setCustomRpcEndpoint={setCustomRpcEndpoint}
            />
            <GlobalStyles />
            <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
                <Window style={{ width: '100%', marginBottom: '20px' }}>
                    <WindowContent>
                        <div style={{ padding: '8px' }}>
                            {/* Error Banner */}
                            {(error || friendsError) && (
                                <Cutout style={{ padding: '8px', marginBottom: '16px', background: '#330000' }}>
                                    <p style={{ color: '#ff0000', fontSize: '12px', }}>
                                        ERROR: {error || friendsError}
                                    </p>
                                </Cutout>
                            )}

                            {/* Tabs and Add Friend Button */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                marginBottom: '16px',
                                gap: '12px',
                                flexWrap: 'wrap'
                            }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {([
                                        { value: 'all', label: '[FRIENDS]' },
                                        { value: 'pending', label: '[REQUESTS]' },
                                        { value: 'blocked', label: '[BLOCKED]' }
                                    ] as const).map(({ value, label }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            onClick={() => setActiveTab(value)}
                                            style={{
                                                padding: '6px 14px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                letterSpacing: '0.05em',
                                                border: '2px solid',
                                                borderColor: activeTab === value ? '#4ade80' : '#16a34a',
                                                backgroundColor: activeTab === value ? 'rgba(74, 222, 128, 0.15)' : 'rgba(0,0,0,0.6)',
                                                color: activeTab === value ? '#4ade80' : '#d1fae5',
                                                boxShadow: activeTab === value ? '0 0 10px rgba(74, 222, 128, 0.35)' : 'none',
                                                cursor: 'pointer',
                                                transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                                            }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <Button
                                    onClick={() => setAddFriendModalOpen(true)}
                                    disabled={!userAddress}
                                    primary
                                    style={{ fontSize: '11px', marginLeft: '12px' }}
                                >
                                    [ADD FRIEND]
                                </Button>
                            </div>

                            <div style={{ marginTop: '16px', minHeight: '300px' }}>
                                {/* Loading state */}
                                {loading && (
                                    <div style={{ textAlign: 'center', padding: '48px 0' }}>
                                        <p style={{ color: '#00ff00', }}>[LOADING...]</p>
                                    </div>
                                )}

                                {/* Empty state */}
                                {!loading && filteredFriends.length === 0 && (
                                    <Cutout style={{ padding: '48px 16px', textAlign: 'center' }}>
                                        <p style={{ color: '#00ff00', fontSize: '12px' }}>
                                            {activeTab === 'all' && '> NO FRIENDS YET. ADD SOMEONE ABOVE!'}
                                            {activeTab === 'pending' && '> NO PENDING REQUESTS'}
                                            {activeTab === 'blocked' && '> NO BLOCKED USERS'}
                                        </p>
                                    </Cutout>
                                )}

                                {/* Friends list */}
                                {!loading && filteredFriends.length > 0 && (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {filteredFriends.map((friend) => (
                                            <FriendCard
                                                key={friend.tableAddress}
                                                friend={friend}
                                                currentUser={userAddress || ''}
                                                onApprove={handleApproveFriend}
                                                onBlock={showBlockConfirm}
                                                onUnblock={handleUnblockFriend}
                                                onOpenChat={handleOpenChat}
                                                hasUnread={Boolean(friend.dmSeedHex && dmAlerts[friend.dmSeedHex])}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </WindowContent>
                </Window>
            </div>
            {chatOpen && chatFriend && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
                    <div
                        className="bg-black border-2 border-green-700 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col">
                        {/* Header */}
                        <div
                            className="border-b border-green-700/50 px-4 py-3 flex items-center justify-between flex-shrink-0">
                            <h3 className="text-green-400 font-bold">
                                DM with {shortenAddress(chatFriend.address)}
                            </h3>
                            <div className="flex items-center gap-3">
                                <NotificationToggle
                                    enabled={dmNotificationsEnabled}
                                    onToggle={() => setDmNotificationsEnabled((prev) => !prev)}
                                    label="NOTI"
                                    size="sm"
                                />
                                <Button onClick={closeChatModal} size="sm" style={{ fontSize: '11px' }}>
                                    X
                                </Button>
                            </div>
                        </div>

                        {/* Info banner */}
                        <div
                            className="border-b border-green-700/30 bg-black/60 px-4 py-2 text-xs text-green-600 flex-shrink-0">
                            <div className="mb-1">
                                <span className="text-green-500">Table:</span> {shortenAddress(chatFriend.tableAddress)}
                            </div>
                            <div className="mb-1 break-all">
                                <span className="text-green-500">Seed:</span> {chatFriend.dmSeedHex}
                            </div>
                            <div>
                                <span className="text-green-500">Status:</span>{' '}
                                <span className="uppercase">{chatFriend.status}</span>
                                {chatFriend.status === 'pending' &&
                                    (isRequesterForFriend(chatFriend)
                                        ? ' (waiting for approval)'
                                        : ' (approve to reply)')}
                                {chatFriend.status === 'blocked' && ' (unblock to continue)'}
                            </div>
                        </div>

                        {chatSlowRpcMode && (
                            <div className="border-b border-yellow-700/40 bg-yellow-900/20 px-4 py-2 text-xs text-amber-200 flex-shrink-0">
                                Using public RPC — slow load mode (1 tx/sec). Messages will appear as they arrive.
                            </div>
                        )}

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
                            {showChatLoadingSpinner && orderedChatMessages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full px-8">
                                    <p className="text-green-400 text-sm mb-4">Loading messages...</p>
                                    <div style={{ width: '100%', maxWidth: '400px' }}>
                                        <div style={{
                                            height: '24px',
                                            background: '#000000',
                                            border: '2px solid #00ff00',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            position: 'relative',
                                            boxShadow: '0 0 10px rgba(0, 255, 0, 0.3)'
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                height: '100%',
                                                width: '25%',
                                                background: 'linear-gradient(90deg, rgba(0, 255, 0, 0) 0%, rgba(0, 255, 0, 0.6) 50%, rgba(0, 255, 0, 0) 100%)',
                                                animation: 'slide 2s linear infinite',
                                                willChange: 'transform'
                                            }}></div>
                                        </div>
                                    </div>
                                </div>
                            ) : chatError ? (
                                <p className="text-red-400 text-sm">Error: {chatError}</p>
                            ) : !chatLoading && orderedChatMessages.length === 0 && !chatError ? (
                                <p className="text-green-600 text-sm">No messages yet. Start the conversation!</p>
                            ) : null}
                            {orderedChatMessages.map((message, index) => {
                                const senderAddress = message.sender || userAddress || '';
                                const displaySender = shortenAddress(senderAddress, 6);
                                const key = message.id || `chat-row-${index}`;
                                return (
                                    <MessageBubble
                                        key={key}
                                        id={message.id || key}
                                        text={message.text || ''}
                                        sender={displaySender}
                                        senderAddress={senderAddress}
                                        displayName={message.displayName || displaySender}
                                        timestamp={message.timestamp}
                                        status={message.status}
                                        signature={message.signature}
                                        file={message.file}
                                        isOwn={senderAddress === userAddress}
                                        viewerAddress={userAddress || ''}
                                        mode="friend"
                                        onCopyAddress={handleCopyAddress}
                                        onDownloadAttachment={handleDownloadAttachment}
                                        copiedMessageId={copiedMessageId}
                                    />
                                );
                            })}
                            <div ref={chatMessagesEndRef} />
                        </div>

                        {/* Input form */}
                        <div className="rounded-b-xl overflow-hidden">
                            <MessageInputForm
                                messageInput={chatMessageInput}
                                setMessageInput={setChatMessageInput}
                                attachmentUrl={attachmentUrl}
                                setAttachmentUrl={setAttachmentUrl}
                                showAttachmentInput={showAttachmentInput}
                                setShowAttachmentInput={setShowAttachmentInput}
                                attachmentError={attachmentError}
                                setAttachmentError={setAttachmentError}
                                onSubmit={handleSendChatMessage}
                                canWrite={!!writerCtx && !!chatFriend && canSendChatToFriend(chatFriend)}
                                canSubmit={!!writerCtx && !!chatMessageInput.trim() && !!chatFriend && canSendChatToFriend(chatFriend)}
                                writerCtx={writerCtx}
                                isUserInitialized={true}
                                userInitError={null}
                                inputRef={chatInputRef}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Add Friend Modal */}
            {addFriendModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
                    <Window style={{ width: '100%', maxWidth: '500px' }}>
                        <WindowHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>[ADD FRIEND]</span>
                            <Button onClick={() => setAddFriendModalOpen(false)} size="sm"
                                    style={{ padding: '2px 8px', fontSize: '10px' }}>
                                X
                            </Button>
                        </WindowHeader>
                        <WindowContent>
                            <AddFriendForm onSubmit={handleAddFriend} disabled={!userAddress} />
                        </WindowContent>
                    </Window>
                </div>
            )}

            {/* Block Confirmation Modal */}
            {blockConfirmOpen && friendToBlock && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
                    <Window style={{ width: '100%', maxWidth: '400px' }}>
                        <WindowHeader>
                            <span>[CONFIRM BLOCK]</span>
                        </WindowHeader>
                        <WindowContent>
                            <div style={{ padding: '16px' }}>
                                <p style={{ color: '#00ff00', fontSize: '12px', marginBottom: '16px' }}>
                                    Are you sure you want to block {shortenAddress(friendToBlock.address, 6)}?
                                </p>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                    <Button onClick={() => {
                                        setBlockConfirmOpen(false);
                                        setFriendToBlock(null);
                                    }}>
                                        Cancel
                                    </Button>
                                    <Button onClick={handleBlockFriend} primary>
                                        Block
                                    </Button>
                                </div>
                            </div>
                        </WindowContent>
                    </Window>
                </div>
            )}
            {toastMessage && (
                <div className="fixed bottom-4 right-4 z-50 rounded bg-black/80 px-4 py-2 text-xs text-amber-200 border border-amber-400/60 shadow-lg">
                    {toastMessage}
                </div>
            )}
        </div>
    );
}

function extractErrorLogs(error: unknown): string[] | undefined {
    if (typeof error !== 'object' || !error) {
        return undefined;
    }
    const candidate = error as {
        logs?: unknown;
        simulationResponse?: { logs?: unknown };
    };
    if (Array.isArray(candidate.logs)) {
        return candidate.logs as string[];
    }
    const simLogs = candidate.simulationResponse?.logs;
    if (Array.isArray(simLogs)) {
        return simLogs as string[];
    }
    return undefined;
}
