/**
 * FriendsList Component
 * - Main friends list UI with tabs and actions
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PublicKey, type Signer } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { useRouter } from 'next/navigation';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useFriends } from '@/lib/friends/use-friends';
import { FriendsListView } from './friends-list-view';
import { DmChatModal } from './dm-chat-modal';
import { AddFriendModal } from './add-friend-modal';
import { BlockConfirmModal } from './block-confirm-modal';
import iqlabs from 'iqlabs-sdk';
import idl from 'iqlabs-sdk/idl/code_in.json';
import type { SignerInput } from 'iqlabs-sdk/dist/sdk/utils/wallet';
import { sendTx } from 'iqlabs-sdk/dist/sdk/writer/writer_utils';
import { shortenAddress } from '@/lib/friends/utils';
import { buildRequestConnectionInstruction } from '@/lib/friends/request-connection';
import { DM_STATUS } from '@/lib/friends/types';
import type { Friend } from '@/lib/friends/types';
import { useFriendAlerts } from '@/lib/friends/use-friend-alerts';
import { Idl } from '@coral-xyz/anchor';
import { GlobalStyles } from './theme';
import { ROOT_ID, MESSAGE_COLUMNS, DM_TABLE_NAME } from '@/lib/iqlabs/constants';
import { usePendingMessages } from '@/lib/shared/use-pending-messages';
import { useMessageChannel } from '@/lib/shared/use-message-channel';
import { useOnAccountChange } from '@/lib/shared/useOnAccountChange';
import { makeDmTimestampKey, setLastMessageTimestamp } from '@/lib/cache/message-timestamp-cache';
import { RpcConfigPrompt } from '@/components/ui/rpc-config-prompt';
import { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';
import { invalidateSignatureCache } from '@/lib/rpc/cache';
import { useUserInit } from '@/lib/iqlabs/use-user-init';
import { makeDmChannelKey, dmChannelKeyToSeed, dmRoomIdToChannelKey } from '@/lib/shared/channel-utils';
import { extractErrorLogs } from '@/lib/utils/error-utils';
import { createDmFetcher } from '@/lib/friends/dm-fetcher';
import { useWebSocketChannel } from '@/lib/shared/use-websocket-channel';
import { useScrollTracker } from '@/lib/shared/use-scroll-tracker';
type Tab = 'all' | 'pending' | 'blocked';

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
    const userAddress = wallet?.publicKey?.toBase58() ?? null;
    const {
        isInitialized: isUserInitialized,
        error: userInitError,
    } = useUserInit();
    const programId = useMemo(() => iqlabs.contract.getProgramId(), []);
    const dbRootId = useMemo(() => Buffer.from(ROOT_ID, 'utf8'), []);
    const dbRoot = useMemo(
        () => iqlabs.contract.getDbRootPda(dbRootId, programId),
        [dbRootId, programId]
    );
    const builder = useMemo(
        () => iqlabs.contract.createInstructionBuilder(idl as Idl, programId),
        [programId]
    );
    const { friends, loading, error: friendsError, refetch } = useFriends({
        userAddress: userAddress || '',
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
    const chatPendingState = usePendingMessages();
    const {
        pendingMessages: chatPendingMessages,
        pruneConfirmedMessages: pruneChatPendingMessages,
        removePendingMessage: removeChatPendingMessage,
        resetPendingMessages: resetChatPendingMessages,
    } = chatPendingState;
    const [chatActionError, setChatActionError] = useState<string | null>(null);
    const [chatMessageInput, setChatMessageInput] = useState('');

    // Attachment state
    const [showAttachmentInput, setShowAttachmentInput] = useState(false);
    const [attachmentUrl, setAttachmentUrl] = useState('');
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [dmNotificationsEnabled, setDmNotificationsEnabled] = useState(true);
    const DM_RATE_LIMIT = 3;
    const [chatSlowRpcMode, setChatSlowRpcMode] = useState(endpointSource === 'default');
    const [dmHasNewMessages, setDmHasNewMessages] = useState(false);
    const [dmNewMarkerId, setDmNewMarkerId] = useState<string | null>(null);
    const [dmUiIsAtBottom, setDmUiIsAtBottom] = useState(true);
    const dmMarkerByChannelRef = useRef<Record<string, string | null>>({});
    const prevDmCountRef = useRef<number>(0);
    const dmInitialScrollRef = useRef<boolean>(false);

    // Modal/UI state
    const [addFriendModalOpen, setAddFriendModalOpen] = useState(false);
    const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
    const [friendToBlock, setFriendToBlock] = useState<Friend | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

    // Refs
    const chatMessagesEndRef = useRef<HTMLDivElement>(null);
    const chatListRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);
    const dmIsAtBottomRef = useRef(true);
    const dmMarkerElRef = useRef<HTMLDivElement | null>(null);
    const dmMarkerClearTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const signer = useMemo<SignerInput | null>(() => {
        if (!wallet?.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
            return null;
        }
        return {
            publicKey: wallet.publicKey,
            signTransaction: wallet.signTransaction.bind(wallet),
            signAllTransactions: wallet.signAllTransactions.bind(wallet),
        };
    }, [wallet]);
    const hasWallet = Boolean(wallet?.publicKey);

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

    const selectedDmChannelKey = useMemo(
        () => (chatFriend?.dmSeedHex ? makeDmChannelKey(chatFriend.dmSeedHex) : null),
        [chatFriend?.dmSeedHex]
    );

    const {
        friendTimestamps,
        setFriendTimestamps,
        dmAlerts,
        setDmAlerts,
        toastMessage,
        showToast,
    } = useFriendAlerts({
        friends,
        chatOpen,
        activeChatSeedHex: chatFriend?.dmSeedHex ?? null,
    });

    const setDmMarker = useCallback((channelKey: string, markerId: string | null) => {
        dmMarkerByChannelRef.current[channelKey] = markerId;
        if (selectedDmChannelKey === channelKey) {
            setDmNewMarkerId(markerId);
            setDmHasNewMessages(Boolean(markerId));
        }
    }, [selectedDmChannelKey]);

    const clearDmMarker = useCallback((channelKey: string | null) => {
        if (!channelKey) return;
        setDmMarker(channelKey, null);
    }, [setDmMarker]);

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

    useEffect(() => {
        resetChatPendingMessages();
    }, [chatFriend?.dmSeedHex, resetChatPendingMessages]);

    const { updateIsAtBottom: updateDmIsAtBottom } = useScrollTracker({
        listRef: chatListRef,
        isAtBottomRef: dmIsAtBottomRef,
        setUiIsAtBottom: setDmUiIsAtBottom,
        selectedChannelKey: selectedDmChannelKey,
        clearMarker: clearDmMarker,
        markerClearTimeoutRef: dmMarkerClearTimeoutRef,
        markerElRef: dmMarkerElRef,
    });

    /* --------------------------------------------------------------------------
     * Data Loading Helpers (DM)
     * -------------------------------------------------------------------------- */
    const resolveChannelMeta = useCallback((channelKey: string) => {
        const seedHex = dmChannelKeyToSeed(channelKey);
        const friend = friendMapBySeedHex[seedHex];
        if (!friend) return null;
        return {
            channelKey,
            seedHex,
            tableAddress: friend.tableAddress,
        };
    }, [friendMapBySeedHex]);

    const fetcher = useMemo(
        () =>
            createDmFetcher({
                userAddress,
                endpointSource,
                friendMapBySeedHex,
                setChatSlowRpcMode,
            }),
        [userAddress, endpointSource, friendMapBySeedHex, setChatSlowRpcMode]
    );

    const {
        messages: dmMessages,
        messagesLoading: chatLoading,
        messagesError: chatLoaderError,
        showLoadingSpinner: showChatLoadingSpinner,
        triggerLiveLatest,
        targetedDecode,
        applyLocalRows,
        resetChannelState,
        lastInsertModeRef,
        mergedMessages: orderedChatMessages,
        sendMessage: handleSendChatMessage,
    } = useMessageChannel({
        reader: {
            channelKey: selectedDmChannelKey,
            resolveChannelMeta,
            fetcher,
            connection,
            endpointSource,
            roomRateLimit: DM_RATE_LIMIT,
            onRowsApplied: ({ channelKey, seedHex, rows }) => {
                const latestTimestamp = rows.reduce((max, msg) => Math.max(max, msg.timestamp ?? 0), 0);
                if (latestTimestamp) {
                    setLastMessageTimestamp(makeDmTimestampKey(seedHex), latestTimestamp);
                    setFriendTimestamps((prev) => ({ ...prev, [seedHex]: latestTimestamp }));
                    setDmAlerts((prev) => ({ ...prev, [channelKey]: false, [seedHex]: false }));
                }
            },
            runWithRpcRateLimit,
        },
        pending: chatPendingState,
        sender: {
            messageInput: chatMessageInput,
            attachmentUrl,
            setMessageInput: setChatMessageInput,
            setAttachmentUrl,
            setAttachmentError,
            setShowAttachmentInput,
            setActionError: setChatActionError,
            getSender: () => userAddress ?? '',
            getMessageId: () =>
                typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID().slice(0, 12)
                    : Math.random().toString(36).slice(2, 10),
            canSend: () => {
                if (!chatFriend || !signer || !userAddress) {
                    return { ok: false };
                }
                if (!canSendChatToFriend(chatFriend)) {
                    return { ok: false, errorMessage: 'Approve the request to continue this conversation.' };
                }
                return { ok: true };
            },
            writeMessage: (payload) =>
                iqlabs.writer.writeConnectionRow(
                    connection,
                    signer! as Signer,
                    dbRootId,
                    chatFriend!.dmSeed,
                    JSON.stringify(payload)
                ),
            onBeforeSend: (_payload, timestamp) => {
                if (chatFriend?.dmSeedHex) {
                    const dmKey = chatFriend.dmSeedHex;
                    setLastMessageTimestamp(makeDmTimestampKey(dmKey), timestamp);
                    setFriendTimestamps((prev) => ({ ...prev, [dmKey]: timestamp }));
                    setDmAlerts((prev) => ({ ...prev, [dmKey]: false }));
                }
            },
            onAfterSuccess: (payload, signature) => {
                if (chatFriend?.dmSeedHex) {
                    const timestamp = payload.timestamp ?? 0;
                    notifyDmMessageSent(chatFriend.dmSeedHex, timestamp, signature);
                    const channelKey = makeDmChannelKey(chatFriend.dmSeedHex);
                    applyLocalRows(channelKey, [
                        {
                            ...payload,
                            status: 'confirmed',
                            room: chatFriend.dmSeedHex,
                        },
                    ]);
                    removeChatPendingMessage(payload.id);
                }
            },
            onAfterError: (err, payload) => {
                removeChatPendingMessage(payload.id);
                const message = err instanceof Error ? err.message : 'Failed to send DM';
                setChatActionError(message);
            },
        },
    });

    useEffect(() => {
        if (!selectedDmChannelKey) {
            setDmNewMarkerId(null);
            setDmHasNewMessages(false);
            return;
        }
        setDmNewMarkerId(dmMarkerByChannelRef.current[selectedDmChannelKey] ?? null);
        setDmHasNewMessages(Boolean(dmMarkerByChannelRef.current[selectedDmChannelKey]));
    }, [selectedDmChannelKey]);

    useEffect(() => {
        if (!selectedDmChannelKey) return;
        const current = dmMessages.length;
        const prev = prevDmCountRef.current;
        const mode = lastInsertModeRef.current[selectedDmChannelKey] ?? null;
        if (mode === 'prepend') {
            lastInsertModeRef.current[selectedDmChannelKey] = null;
            prevDmCountRef.current = current;
            return;
        }
        if (current > prev && !dmIsAtBottomRef.current && mode !== 'append') {
            const latest = dmMessages[dmMessages.length - 1];
            const latestSender = latest?.sender;
            const viewer = userAddress;
            const isOwn = viewer && latestSender && viewer === latestSender;
            if (latest?.id && !dmMarkerByChannelRef.current[selectedDmChannelKey] && !isOwn) {
                setDmMarker(selectedDmChannelKey, latest.id);
            }
            setDmHasNewMessages(true);
        }
        lastInsertModeRef.current[selectedDmChannelKey] = null;
        prevDmCountRef.current = current;
    }, [dmMessages, lastInsertModeRef, selectedDmChannelKey, setDmMarker, userAddress]);

    const chatError = chatActionError ?? chatLoaderError;

    const scrollChatToBottom = useCallback(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
        setDmUiIsAtBottom(true);
    }, []);

    const loadChatHistory = useCallback(
        async (friend: Friend | null) => {
            if (!friend?.dmSeedHex) return;
            const channelKey = makeDmChannelKey(friend.dmSeedHex);
            await triggerLiveLatest(channelKey);
        },
        [triggerLiveLatest]
    );

    const handleDmSocketPayload = useCallback(async (data: unknown) => {
        const payload = data as { type?: string; roomId?: string; lastTimestamp?: number; timestamp?: number; signature?: string };
        const roomId = payload?.roomId;
        if (!roomId || !roomId.startsWith('dm:')) {
            return;
        }
        const channelKey = dmRoomIdToChannelKey(roomId);
        const dmSeedHex = dmChannelKeyToSeed(channelKey);
        const incomingTimestamp = typeof payload.lastTimestamp === 'number'
            ? payload.lastTimestamp
            : typeof payload.timestamp === 'number'
                ? payload.timestamp
                : Number(payload.lastTimestamp || payload.timestamp || 0);

        const targetFriend = friendMapBySeedHex[dmSeedHex];
        if (targetFriend) {
            try {
                if (targetFriend.tableAddress) {
                    invalidateSignatureCache(targetFriend.tableAddress);
                }
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
                if (payload?.signature) {
                    await targetedDecode(channelKey, payload.signature);
                } else {
                    await triggerLiveLatest(channelKey, { skipLoadingState: true });
                }
            } catch (error) {
                console.error('[FriendsList] Failed to refresh DM after notification', error);
            }
        } else {
            setDmAlerts((prev) => ({ ...prev, [dmSeedHex]: true, [channelKey]: true }));
            const targetFriend = friendMapBySeedHex[dmSeedHex];
            if (targetFriend) {
                const label = shortenAddress(targetFriend.address, 6);
                showToast(`New message from ${label}`);
            }
        }
    }, [chatFriend, chatOpen, friendMapBySeedHex, showToast, targetedDecode, triggerLiveLatest]);

    const dmWs = useWebSocketChannel({
        onMessage: handleDmSocketPayload,
        logPrefix: 'FriendsList DM',
    });

    const dmSocketRef = dmWs.socketRef;
    const dmSubscribedIdsRef = dmWs.subscribedIdsRef;
    const dmWsConnected = dmWs.isConnected;

    const handleOpenChat = useCallback(async (friend: Friend) => {
        setChatFriend(friend);
        setChatActionError(null);
        setChatMessageInput('');
        setChatOpen(true);
        await loadChatHistory(friend);
        dmInitialScrollRef.current = true;
        setTimeout(() => {
            scrollChatToBottom();
        }, 0);
    }, [loadChatHistory, scrollChatToBottom]);

    const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleDmLogs = useCallback(() => {
        if (!chatFriend?.dmSeedHex) return;

        if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
        }

        refreshTimeoutRef.current = setTimeout(() => {
            const channelKey = makeDmChannelKey(chatFriend.dmSeedHex);
            void triggerLiveLatest(channelKey, { skipLoadingState: true });
        }, 500);
    }, [chatFriend, triggerLiveLatest]);

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
        if (chatOpen && (dmIsAtBottomRef.current || dmInitialScrollRef.current)) {
            scrollChatToBottom();
            dmIsAtBottomRef.current = true;
            dmInitialScrollRef.current = false;
        }
        updateDmIsAtBottom();
        const el = chatListRef.current;
        if (!el) return;
        el.addEventListener('scroll', updateDmIsAtBottom, { passive: true });
        return () => {
            el.removeEventListener('scroll', updateDmIsAtBottom);
        };
    }, [orderedChatMessages, chatPendingMessages, chatOpen, scrollChatToBottom, updateDmIsAtBottom]);

    useEffect(() => {
        if (!chatPendingMessages.length) return;
        pruneChatPendingMessages(dmMessages);
    }, [dmMessages, chatPendingMessages.length, pruneChatPendingMessages]);

    // Account change subscription for chat friend table
    const getChatFriendTableAccount = () => {
        if (!chatFriend) return null;
        try {
            return new PublicKey(chatFriend.tableAddress);
        } catch (error) {
            console.warn('[FriendsList] Invalid chat table address:', error);
            return null;
        }
    };

    useOnAccountChange({
        connection,
        account: getChatFriendTableAccount(),
        handler: () => {
            void handleDmLogs();
        },
        commitment: 'processed',
        enabled: !dmWsConnected,
    });

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
        if (!userAddress || !wallet || !signer) {
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

        try {
            const receiver = new PublicKey(friendAddress.trim());
            const { ix } = buildRequestConnectionInstruction({
                builder,
                dbRootId,
                programId,
                requester: signer.publicKey,
                receiver,
                tableName: DM_TABLE_NAME,
                columns: MESSAGE_COLUMNS,
                idCol: 'id',
            });
            await sendTx(connection, signer, ix);
            await refetch();
            setAddFriendModalOpen(false);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to send request';
            setError(message);

            const maybeLogs = extractErrorLogs(err);
            if (maybeLogs) {
                console.error('[FriendsList] requestConnection logs', maybeLogs);
            }
            console.error('[FriendsList] requestConnection error', err);

            throw err;
        }
    };

    const handleApproveFriend = async (friend: Friend) => {
        if (!wallet || !signer) throw new Error('Wallet not connected');

        console.log('[FriendsList] Approving friend:', {
            friendAddress: friend.address,
            dmSeedHex: friend.dmSeedHex,
            tableAddress: friend.tableAddress,
            partyA: friend.partyA,
            partyB: friend.partyB,
        });

        setError(null);

        try {
            const connectionTable = iqlabs.contract.getConnectionTablePda(
                dbRoot,
                friend.dmSeed,
                programId
            );
            const ix = iqlabs.contract.manageConnectionInstruction(
                builder,
                {
                    db_root: dbRoot,
                    connection_table: connectionTable,
                    signer: signer.publicKey,
                },
                {
                    db_root_id: dbRootId,
                    connection_seed: Buffer.from(friend.dmSeed),
                    new_status: DM_STATUS.APPROVED,
                }
            );
            await sendTx(connection, signer, ix);
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
        if (!signer || !friendToBlock) return;

        setError(null);
        setBlockConfirmOpen(false);

        try {
            const connectionTable = iqlabs.contract.getConnectionTablePda(
                dbRoot,
                friendToBlock.dmSeed,
                programId
            );
            const ix = iqlabs.contract.manageConnectionInstruction(
                builder,
                {
                    db_root: dbRoot,
                    connection_table: connectionTable,
                    signer: signer.publicKey,
                },
                {
                    db_root_id: dbRootId,
                    connection_seed: Buffer.from(friendToBlock.dmSeed),
                    new_status: DM_STATUS.BLOCKED,
                }
            );
            await sendTx(connection, signer, ix);
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
        if (!signer) throw new Error('Wallet not connected');

        setError(null);

        try {
            const connectionTable = iqlabs.contract.getConnectionTablePda(
                dbRoot,
                friend.dmSeed,
                programId
            );
            const ix = iqlabs.contract.manageConnectionInstruction(
                builder,
                {
                    db_root: dbRoot,
                    connection_table: connectionTable,
                    signer: signer.publicKey,
                },
                {
                    db_root_id: dbRootId,
                    connection_seed: Buffer.from(friend.dmSeed),
                    new_status: DM_STATUS.APPROVED,
                }
            );
            await sendTx(connection, signer, ix);
            await refetch();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to unblock friend';
            setError(message);
            console.error('[FriendsList] Failed to unblock friend', err);
        }
    };

    const notifyDmMessageSent = useCallback((dmSeedHex: string, ts: number, signature?: string) => {
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
                    signature,
                })
            );
            console.log('[FriendsList] DM notify sent for', dmSeedHex.slice(0, 8), 'ts', ts, 'sig', signature?.slice(0, 8));
        } catch (error) {
            console.warn('[FriendsList] Failed to emit DM notification', error);
        }
    }, []);

    const closeChatModal = () => {
        setChatOpen(false);
        setChatFriend(null);
        resetChannelState(null, { resetMessages: true });
        resetChatPendingMessages();
        setChatActionError(null);
        setChatMessageInput('');
        setAttachmentUrl('');
        setAttachmentError(null);
        setShowAttachmentInput(false);
        setDmHasNewMessages(false);
        setDmNewMarkerId(null);
    };

    const handleCopyAddress = useCallback((address: string, messageId: string) => {
        navigator.clipboard?.writeText(address);
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
    }, []);

    const handleDownloadAttachment = useCallback((url: string) => {
        window.open(url, '_blank');
    }, []);

    const handleDmScrollToBottom = useCallback(() => {
        chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        dmIsAtBottomRef.current = true;
        setDmUiIsAtBottom(true);
        setDmHasNewMessages(false);
        clearDmMarker(selectedDmChannelKey);
    }, [clearDmMarker, selectedDmChannelKey]);

    const canWriteDm = !!signer && isUserInitialized && !!chatFriend && canSendChatToFriend(chatFriend);
    const canSubmitDm = !!signer && isUserInitialized && !!chatMessageInput.trim() && !!chatFriend && canSendChatToFriend(chatFriend);

    return (
        <div>
            <RpcConfigPrompt
                endpointSource={endpointSource}
                setCustomRpcEndpoint={setCustomRpcEndpoint}
            />
            <GlobalStyles />
            <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
                <FriendsListView
                    error={error}
                    friendsError={friendsError}
                    activeTab={activeTab}
                    setActiveTab={setActiveTab}
                    onOpenAddFriend={() => setAddFriendModalOpen(true)}
                    userAddress={userAddress}
                    loading={loading}
                    filteredFriends={filteredFriends}
                    dmAlerts={dmAlerts}
                    onApprove={handleApproveFriend}
                    onBlock={showBlockConfirm}
                    onUnblock={handleUnblockFriend}
                    onOpenChat={handleOpenChat}
                />
            </div>
            <DmChatModal
                open={chatOpen}
                chatFriend={chatFriend}
                dmNotificationsEnabled={dmNotificationsEnabled}
                onToggleNotifications={() => setDmNotificationsEnabled((prev) => !prev)}
                onClose={closeChatModal}
                isRequesterForFriend={isRequesterForFriend}
                chatSlowRpcMode={chatSlowRpcMode}
                chatListRef={chatListRef}
                chatMessagesEndRef={chatMessagesEndRef}
                dmMarkerElRef={dmMarkerElRef}
                orderedChatMessages={orderedChatMessages}
                showChatLoadingSpinner={showChatLoadingSpinner}
                chatError={chatError}
                chatLoading={chatLoading}
                dmNewMarkerId={dmNewMarkerId}
                userAddress={userAddress}
                copiedMessageId={copiedMessageId}
                onCopyAddress={handleCopyAddress}
                onDownloadAttachment={handleDownloadAttachment}
                dmUiIsAtBottom={dmUiIsAtBottom}
                dmHasNewMessages={dmHasNewMessages}
                onScrollToBottomClick={handleDmScrollToBottom}
                chatMessageInput={chatMessageInput}
                setChatMessageInput={setChatMessageInput}
                attachmentUrl={attachmentUrl}
                setAttachmentUrl={setAttachmentUrl}
                showAttachmentInput={showAttachmentInput}
                setShowAttachmentInput={setShowAttachmentInput}
                attachmentError={attachmentError}
                setAttachmentError={setAttachmentError}
                onSubmitMessage={handleSendChatMessage}
                hasWallet={hasWallet}
                canWrite={canWriteDm}
                canSubmit={canSubmitDm}
                isUserInitialized={isUserInitialized}
                userInitError={userInitError}
                inputRef={chatInputRef}
            />

            <AddFriendModal
                open={addFriendModalOpen}
                onClose={() => setAddFriendModalOpen(false)}
                onSubmit={handleAddFriend}
                disabled={!userAddress}
            />

            <BlockConfirmModal
                open={blockConfirmOpen}
                friend={friendToBlock}
                onCancel={() => {
                    setBlockConfirmOpen(false);
                    setFriendToBlock(null);
                }}
                onConfirm={handleBlockFriend}
            />
            {toastMessage && (
                <div className="fixed bottom-4 right-4 z-50 rounded bg-black/80 px-4 py-2 text-xs text-amber-200 border border-amber-400/60 shadow-lg">
                    {toastMessage}
                </div>
            )}
        </div>
    );
}
