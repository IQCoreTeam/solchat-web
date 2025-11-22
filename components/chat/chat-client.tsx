'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useOnLogs } from '@/lib/onchainDB/shared/useOnLogs';
import { useMessageLoader, type LoaderOptions } from '@/lib/onchainDB/shared/useMessageLoader';
import { ROOT_ID, MESSAGE_COLUMNS } from '@/lib/onchainDB/constants';

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
};

export function ChatClient() {
    /* --------------------------------------------------------------------------
     * Context & External Hooks
     * -------------------------------------------------------------------------- */
    const { connection } = useAppConnection();
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
    const [messages, setMessages] = useState<MessageRow[]>([]);
    const {
        pendingMessages,
        addPendingMessage,
        pruneConfirmedMessages,
        removePendingMessage,
    } = usePendingMessages();
    const [messageActionError, setMessageActionError] = useState<string | null>(null);

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

    // Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

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
    const selectedRoom = useMemo(() => {
        return rooms.find((r) => r.seedHex === selectedSeed) || null;
    }, [rooms, selectedSeed]);
    const tableAccount = useMemo(() => (selectedRoom ? new PublicKey(selectedRoom.tableAddress) : null), [selectedRoom]);
    const instructionAccount = useMemo(() => (selectedRoom ? new PublicKey(selectedRoom.instructionAddress) : null), [selectedRoom]);

    const allMessages = useMemo(() => mergeMessages(messages, pendingMessages), [messages, pendingMessages]);
    const walletAddress = useMemo(() => wallet.publicKey?.toBase58() || '', [wallet.publicKey]);

    const canWrite = Boolean(writerCtx && isUserInitialized);

    const fetcher = useCallback(async (room: RoomMeta) => {
        if (!walletAddress) return [];
        const rows = await readRowsByTable({
            connection,
            rootId: ROOT_ID,
            userPublicKey: walletAddress,
            tableName: room.seedHex,
            idl: PROGRAM_IDL,
        });
        return rows
            .map((row: Row) => rowToMessage(row))
            .filter((message: MessageRow) => message.text || message.file);
    }, [walletAddress, connection]);

    const {
        loadMessages: loadRoomMessages,
        messagesLoading,
        messagesError,
        showLoadingSpinner,
    } = useMessageLoader<[RoomMeta]>({
        fetcher,
    });

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
                roomList.push({
                    seedHex: bytesToHex(seed),
                    seedBytes: seed,
                    name,
                    tableAddress: tablePda.toBase58(),
                    instructionAddress: instrPda.toBase58(),
                    columns,
                });
            }
            setRooms(roomList);


        } catch (err) {
            console.error('[ChatClient] Load rooms error:', err);
            setRoomsError(err instanceof Error ? err.message : 'Failed to load rooms');
        } finally {
            setRoomsLoading(false);
        }
    }, [rootStatus, rootAccount, coder, connection, rootPubkey]);

    /* --------------------------------------------------------------------------
     * Effects: Room & Message Loading
     * -------------------------------------------------------------------------- */
    useEffect(() => {
        loadRooms();
    }, [loadRooms]);

    // Load messages for selected room (stable version for subscriptions)
    const loadMessagesForRoom = useCallback(async (room: RoomMeta, options?: LoaderOptions) => {
        const rows = await loadRoomMessages(room, options);
        setMessages(rows);
    }, [loadRoomMessages]);

    // Wrapper for current room
    const loadMessages = useCallback(async (options?: LoaderOptions) => {
        if (!selectedSeed) return;

        const room = rooms.find((r) => r.seedHex === selectedSeed);
        if (!room) return;

        await loadMessagesForRoom(room, options);
    }, [selectedSeed, rooms, loadMessagesForRoom]);

    useEffect(() => {
        if (walletAddress) {
            loadMessages();
        }
    }, [loadMessages, walletAddress]);

    useEffect(() => {
        if (!pendingMessages.length) return;
        pruneConfirmedMessages(messages);
    }, [messages, pendingMessages.length, pruneConfirmedMessages]);

    /* --------------------------------------------------------------------------
     * Effects: WebSocket Subscriptions
     * -------------------------------------------------------------------------- */
    const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const refreshMessagesFromLogs = useCallback(() => {
        if (!selectedRoom) return;

        if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
            if (refreshTimeoutRef.current) {
                clearTimeout(refreshTimeoutRef.current);
            }
        };
    }, []);

    useOnLogs({
        connection,
        account: tableAccount,
        handler: refreshMessagesFromLogs,
        commitment: 'processed',
    });

    useOnLogs({
        connection,
        account: instructionAccount,
        handler: refreshMessagesFromLogs,
        commitment: 'processed',
    });

    /* --------------------------------------------------------------------------
     * Effects: UI Sync
     * -------------------------------------------------------------------------- */
    // Scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
    }, [allMessages]);

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

        setMessageActionError(null);
        addPendingMessage(payload);

        try {
            const { tx } = await writeRowWeb(writerCtx, ROOT_ID, selectedRoom.seedHex, JSON.stringify(payload));
            await sendAndConfirmTx(connection, writerCtx.wallet, tx, '[ChatClient] Message submitted:');
            // Invalidate cache so WebSocket listeners get fresh data
            await invalidateRoomCache(selectedRoom.seedHex);
            console.log('[handleSendMessage] Cache invalidated for room:', selectedRoom.seedHex.slice(0, 8));
        } catch (err) {
            console.error('[ChatClient] Send message error:', err);
            setMessageActionError(err instanceof Error ? err.message : 'Failed to send message');
            removePendingMessage(messageId);
        }
    }, [writerCtx, selectedRoom, messageInput, attachmentUrl, connection, addPendingMessage, removePendingMessage]);

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
        <div className="flex h-full flex-col bg-black text-white">
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
                    canWrite={canWrite}
                    writerCtx={writerCtx}
                    isUserInitialized={isUserInitialized}
                    userInitError={userInitError}
                    isSidebarOpen={isSidebarOpen}
                    onCloseSidebar={() => setIsSidebarOpen(false)}
                />

                <div className="flex flex-1 flex-col overflow-hidden">
                    {selectedRoom ? (
                        <>
                            <MessageList
                                messages={allMessages}
                                isLoading={messagesLoading}
                                showLoadingSpinner={showLoadingSpinner}
                                error={messageActionError ?? messagesError}
                                viewerAddress={wallet.publicKey?.toBase58() || ''}
                                messagesEndRef={messagesEndRef}
                                onCopyAddress={handleCopyAddress}
                                onDownloadAttachment={handleDownloadAttachment}
                                copiedMessageId={copiedMessageId}
                            />
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
        </div>
    );
}
