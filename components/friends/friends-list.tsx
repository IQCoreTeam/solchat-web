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
import { GlobalStyles, darkGreenTheme } from './theme';
import { ROOT_ID, MESSAGE_COLUMNS } from '@/lib/onchainDB/constants';
import { sendAndConfirmTx } from '@/lib/onchainDB/utils/transaction-helpers';
import { rowToMessage, type MessageRow } from '@/lib/onchainDB/utils/message-helpers';
import { mergeMessages, type MessagePayload } from '@/lib/onchainDB/shared/message';
import { usePendingMessages } from '@/lib/onchainDB/shared/use-pending-messages';
import { useMessageLoader, type LoaderOptions } from '@/lib/onchainDB/shared/useMessageLoader';
import {useOnAccountChange} from "@/lib/onchainDB/shared/useOnAccountChange";
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
    const { connection } = useAppConnection();
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

    // Modal/UI state
    const [addFriendModalOpen, setAddFriendModalOpen] = useState(false);
    const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
    const [friendToBlock, setFriendToBlock] = useState<Friend | null>(null);
    const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

    // Refs
    const chatMessagesEndRef = useRef<HTMLDivElement>(null);
    const chatInputRef = useRef<HTMLInputElement>(null);

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
    const filteredFriends = useMemo(() => {
        if (activeTab === 'all') {
            return friends.filter((f) => f.status === 'approved');
        }
        if (activeTab === 'pending') {
            return friends.filter((f) => f.status === 'pending');
        }
        if (activeTab === 'blocked') {
            return friends.filter((f) => f.status === 'blocked');
        }
        return friends;
    }, [friends, activeTab]);

    const orderedChatMessages = useMemo(
        () => mergeMessages(chatMessages, chatPendingMessages),
        [chatMessages, chatPendingMessages]
    );

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
        const rows = await readRowsByDmSeed({
            connection,
            rootId: ROOT_ID,
            userPublicKey: userAddress,
            idl: FRIENDS_IDL,
            dmSeed: friend.dmSeed,
            maxTx: 20,
        });
        return rows
            .map((row) => rowToMessage(row))
            .filter((message) => message.text || message.file);
    }, [connection, userAddress]);

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
            try {
                const rows = await loadDmMessages(friend, options);
                setChatMessages(rows);
            } catch (err) {
                console.error('[FriendsList] Failed to load DM conversation', err);
            }
        },
        [loadDmMessages]
    );

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
                await invalidateDmCache(chatFriend.dmSeed);
                await loadChatHistory(chatFriend, { skipLoadingState: true });
            } catch (error) {
                console.error('[FriendsList] Failed to refresh messages after logs:', error);
            }
        }, 2000);
    }, [chatFriend, loadChatHistory]);

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
    });

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

        addChatPendingMessage(payload);

        try {
            const { tx } = await writeDmRowWeb(writerCtx, ROOT_ID, chatFriend.dmSeed, JSON.stringify(payload));
            await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] DM sent:');
            await loadChatHistory(chatFriend, { skipLoadingState: true });
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
                            <Button onClick={closeChatModal} size="sm" style={{ fontSize: '11px' }}>
                                X
                            </Button>
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
