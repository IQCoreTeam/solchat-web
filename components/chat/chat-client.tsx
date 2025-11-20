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
  createDmTableWeb,
  writeRowWeb,
  writeDmRowWeb,
  type WriterCtx,
} from '@/lib/onchainDB/web/writer';
import { readRowsByDmSeed, readRowsByTable } from '@/lib/onchainDB/web/cached-reader-integration';
import { pdaDmInstructionTable, pdaDmTable, pdaInstructionTable, pdaRoot, pdaTable } from '@/lib/onchainDB';
import { useUserInit } from '@/lib/onchainDB/hooks/use-user-init';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';
import { normalizeFileUrl } from '@/lib/utils/message-utils';
import {
  bytesToHex,
  normalizeBytes,
  decodeBytes,
  deriveDmSeedPair,
  rowToMessage,
  type MessageRow,
} from '@/lib/onchainDB/utils/message-helpers';
import { ROOT_ID, MESSAGE_COLUMNS } from '@/lib/onchainDB/constants';

// Import new components
import { ChatHeader } from './chat-header';
import { RoomSidebar } from './room-sidebar';
import { MessageList } from './message-list';
import { MessageInputForm } from './message-input-form';
import { DmModal } from './dm-modal';

type RoomMeta = {
  seedHex: string;
  seedBytes: Uint8Array;
  name: string;
  tableAddress: string;
  instructionAddress: string;
  columns: string[];
};

type DmMeta = {
  peerAddress: string;
  seedBytes: Uint8Array;
  seedHex: string;
  tableAddress: string;
  instructionAddress: string;
  partyA: string;
  partyB: string;
};

type ChatClientProps = {
  dmModalOpen?: boolean;
  onCloseDm?: () => void;
};

export function ChatClient({ dmModalOpen = false, onCloseDm }: ChatClientProps) {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const {
    isInitialized: isUserInitialized,
    isInitializing: isUserInitializing,
    error: userInitError,
    retry: retryUserInit,
  } = useUserInit();
  const { logout } = usePrivy();

  const coder = useMemo(() => new BorshAccountsCoder(idl as Idl), []);
  const rootPubkey = useMemo(() => pdaRoot(ROOT_ID), []);

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
  const [pendingMessages, setPendingMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [showLoadingSpinner, setShowLoadingSpinner] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

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

  // DM state
  const [isDmModalOpen, setIsDmModalOpen] = useState(dmModalOpen);
  const [dmPeerInput, setDmPeerInput] = useState('');
  const [dmStatus, setDmStatus] = useState<'idle' | 'checking' | 'creating' | 'ready'>('idle');
  const [dmError, setDmError] = useState<string | null>(null);
  const [activeDm, setActiveDm] = useState<DmMeta | null>(null);
  const [dmMessages, setDmMessages] = useState<MessageRow[]>([]);
  const [dmPendingMessages, setDmPendingMessages] = useState<MessageRow[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [dmMessageInput, setDmMessageInput] = useState('');

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dmMessagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<MessageRow[]>([]);
  const dmMessagesRef = useRef<MessageRow[]>([]);

  // Writer context
  const writerWallet = useMemo<WalletAdapterLike | null>(() => {
    if (!wallet.publicKey) return null;
    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction as any,
      signAllTransactions: wallet.signAllTransactions as any,
    };
  }, [wallet]);

  const writerCtx = useMemo<WriterCtx | null>(() => {
    if (!writerWallet) return null;
    return {
      connection,
      wallet: writerWallet,
      idl: idl as Idl,
      programId: (idl as any)?.address,
    };
  }, [connection, writerWallet]);

  // Computed values
  const selectedRoom = useMemo(() => {
    return rooms.find((r) => r.seedHex === selectedSeed) || null;
  }, [rooms, selectedSeed]);

  const allMessages = useMemo(() => {
    // Deduplicate: prefer confirmed messages (with signatures) over pending ones
    const messageMap = new Map<string, MessageRow>();

    console.log('[ChatClient] Deduplicating:', {
      pendingCount: pendingMessages.length,
      confirmedCount: messages.length,
      pendingIds: pendingMessages.map(m => ({ id: m.id.slice(0, 8), sig: !!m.signature, status: m.status })),
      confirmedIds: messages.map(m => ({ id: m.id.slice(0, 8), sig: !!m.signature, status: m.status })),
    });

    // Add pending messages first
    pendingMessages.forEach(msg => messageMap.set(msg.id, msg));

    // Confirmed messages override pending ones with same ID
    messages.forEach(msg => messageMap.set(msg.id, msg));

    const result = Array.from(messageMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    console.log('[ChatClient] Deduplicated result:', result.length, 'messages');
    return result;
  }, [messages, pendingMessages]);

  const allDmMessages = useMemo(() => {
    // Deduplicate: prefer confirmed messages (with signatures) over pending ones
    const messageMap = new Map<string, MessageRow>();

    // Add pending messages first
    dmPendingMessages.forEach(msg => messageMap.set(msg.id, msg));

    // Confirmed messages override pending ones with same ID
    dmMessages.forEach(msg => messageMap.set(msg.id, msg));

    return Array.from(messageMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  }, [dmMessages, dmPendingMessages]);

  const canWrite = Boolean(writerCtx && isUserInitialized);

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
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = writerCtx.wallet.publicKey;
      const signed = await writerCtx.wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
      const acc = await connection.getAccountInfo(rootPubkey);
      setRootAccount(acc);
      setRootStatus('ready');
    } catch (err) {
      console.error('[ChatClient]Create root error:', err);
      setRootStatus('error');
      setRootError(err instanceof Error ? err.message : 'Failed to create root');
    }
  }, [writerCtx, connection, rootPubkey]);

  // Load rooms
  const loadRooms = useCallback(async () => {
    if (rootStatus !== 'ready' || !rootAccount) return;
    setRoomsLoading(true);
    setRoomsError(null);
    try {
      const decoded = coder.decode('Root', rootAccount.data);
      if (!decoded) throw new Error('Failed to decode root account');

      // Use global_table_seeds for global rooms visible to everyone
      const seedsRaw: any[] =
        (decoded as any).global_table_seeds ??
        (decoded as any).globalTableSeeds ??
        [];

      const uniqueSeeds: Uint8Array[] = [];
      const seen = new Set<string>();

      for (const entry of seedsRaw) {
        const seed = normalizeBytes(entry);
        if (!seed.length) continue;
        const hex = bytesToHex(seed);
        if (seen.has(hex)) continue;
        seen.add(hex);
        uniqueSeeds.push(seed);
      }

      const roomList: RoomMeta[] = [];
      for (const seed of uniqueSeeds) {
        const tablePda = pdaTable(rootPubkey, seed);
        const instrPda = pdaInstructionTable(rootPubkey, seed);
        const tableAcc = await connection.getAccountInfo(tablePda);
        if (!tableAcc) continue;
        const tableDecoded = coder.decode('Table', tableAcc.data);
        if (!tableDecoded) continue;
        const name = decodeBytes((tableDecoded as any).name);
        const columns = (((tableDecoded as any).columnNames || (tableDecoded as any).column_names || []) as any[]).map(decodeBytes);
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

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // Extract stable wallet address
  const walletAddress = wallet.publicKey?.toBase58() || '';

  // Load messages for selected room
  const loadMessages = useCallback(async () => {
    if (!selectedSeed) return;
    const room = rooms.find((r) => r.seedHex === selectedSeed);
    if (!room) return;

    setMessagesLoading(true);
    setMessagesError(null);
    setShowLoadingSpinner(true);

    setTimeout(() => setShowLoadingSpinner(false), 800);

    try {
      const rows = await readRowsByTable({
        connection,
        rootId: ROOT_ID,
        userPublicKey: walletAddress,
        tableName: room.seedHex,
        idl: idl as any,
      });
      const mapped = rows.map((row: any) => rowToMessage(row)).filter((message: any) => message.text || message.file);
      messagesRef.current = mapped;
      setMessages(mapped);
      // Auto-cleanup: remove pending messages that now exist on-chain
      const confirmedIds = new Set(mapped.map(m => m.id));
      console.log('[ChatClient] Auto-cleanup - confirmed IDs:', Array.from(confirmedIds).slice(0, 5).map(id => id.slice(0, 8)));
      setPendingMessages((prev) => {
        const before = prev.length;
        const pendingIds = prev.map(m => m.id.slice(0, 8));
        console.log('[ChatClient] Auto-cleanup - pending IDs:', pendingIds);
        const after = prev.filter((m) => !confirmedIds.has(m.id));
        console.log('[ChatClient] Auto-cleanup - pending before:', before, 'after:', after.length, 'removed:', before - after.length);
        return after;
      });
    } catch (err) {
      console.error('[ChatClient] Load messages error:', err);
      setMessagesError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setMessagesLoading(false);
    }
  }, [selectedSeed, rooms, connection, walletAddress]);

  // Load DM messages
  const loadDmMessages = useCallback(async () => {
    if (!activeDm) return;
    setDmLoading(true);
    try {
      const rows = await readRowsByDmSeed({
        connection,
        rootId: ROOT_ID,
        userPublicKey: walletAddress,
        dmSeed: activeDm.seedBytes,
        idl: idl as any,
      });
      const mapped = rows.map((row: any) => rowToMessage(row)).filter((message: any) => message.text || message.file);
      dmMessagesRef.current = mapped;
      setDmMessages(mapped);
      // Auto-cleanup: remove pending messages that now exist on-chain
      const confirmedIds = new Set(mapped.map(m => m.id));
      setDmPendingMessages((prev) => prev.filter((m) => !confirmedIds.has(m.id)));
    } catch (err) {
      console.error('[ChatClient] Load DM messages error:', err);
      setDmError(err instanceof Error ? err.message : 'Failed to load DM messages');
    } finally {
      setDmLoading(false);
    }
  }, [activeDm, connection, walletAddress]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    loadDmMessages();
  }, [loadDmMessages]);

  // Real-time subscriptions would go here (simplified for brevity)

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [allMessages]);

  useEffect(() => {
    dmMessagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
  }, [allDmMessages]);

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

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = writerCtx.wallet.publicKey;
      const signed = await writerCtx.wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');

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

    const payload: any = {
      id: messageId,
      text: messageInput.trim(),
      sender: userAddr,
      timestamp,
      status: 'sent',
      room: selectedRoom.name,
    };

    if (fileUrl) {
      payload.file = fileUrl;
    }

    const tempMessage: MessageRow = {
      id: messageId,
      text: messageInput.trim(),
      file: fileUrl || undefined,
      sender: userAddr,
      timestamp,
      status: 'pending',
      room: selectedRoom.name,
    };

    setPendingMessages((prev) => [...prev, tempMessage]);
    setMessageInput('');
    setAttachmentUrl('');
    setAttachmentError(null);
    setShowAttachmentInput(false);

    try {
      const { tx } = await writeRowWeb(writerCtx, ROOT_ID, selectedRoom.seedHex, JSON.stringify(payload));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = writerCtx.wallet.publicKey;
      const signed = await writerCtx.wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
      // Retry loading until message appears (max 3 attempts with 3s delay each)
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await loadMessages();
        // Check if message was loaded
        if (messagesRef.current.some(m => m.id === messageId)) {
          console.log('[ChatClient] Message found after', attempt + 1, 'attempts');
          break;
        }
        console.log('[ChatClient] Message not found, attempt', attempt + 1, 'of 3');
      }
    } catch (err) {
      console.error('[ChatClient] Send message error:', err);
      setPendingMessages((prev) => prev.filter((m) => m.id !== messageId));
      setMessagesError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [writerCtx, selectedRoom, messageInput, attachmentUrl, connection, loadMessages]);

  // Handle start DM
  const handleStartDm = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!writerCtx || !writerCtx.wallet.publicKey) return;

    const peerAddr = dmPeerInput.trim();
    if (!peerAddr) return;

    setDmStatus('checking');
    setDmError(null);

    try {
      const { userA, userB, seedBytes, seedHex } = deriveDmSeedPair(
        writerCtx.wallet.publicKey.toBase58(),
        peerAddr
      );

      const dmTablePda = pdaDmTable(rootPubkey, seedBytes);
      const dmInstrPda = pdaDmInstructionTable(rootPubkey, seedBytes);

      const existingTable = await connection.getAccountInfo(dmTablePda);

      if (!existingTable) {
        setDmStatus('creating');
        const { tx } = await createDmTableWeb(
          writerCtx,
          ROOT_ID,
          seedBytes,
          'dm',
          [...MESSAGE_COLUMNS],
          { idColumn: 'id', partyA: userA, partyB: userB }
        );
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = writerCtx.wallet.publicKey;
        const signed = await writerCtx.wallet.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize());
        await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
      }

      setActiveDm({
        peerAddress: peerAddr,
        seedBytes,
        seedHex,
        tableAddress: dmTablePda.toBase58(),
        instructionAddress: dmInstrPda.toBase58(),
        partyA: userA,
        partyB: userB,
      });

      setDmStatus('ready');
    } catch (err) {
      console.error('[ChatClient] Start DM error:', err);
      setDmError(err instanceof Error ? err.message : 'Failed to start DM');
      setDmStatus('idle');
    }
  }, [writerCtx, dmPeerInput, connection, rootPubkey]);

  // Handle send DM
  const handleSendDmMessage = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    if (!writerCtx || !activeDm || !dmMessageInput.trim() || !writerCtx.wallet.publicKey) return;

    const messageId = crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now();
    const userAddr = writerCtx.wallet.publicKey.toBase58();

    const payload: any = {
      id: messageId,
      text: dmMessageInput.trim(),
      sender: userAddr,
      timestamp,
      status: 'sent',
    };

    const tempMessage: MessageRow = {
      id: messageId,
      text: dmMessageInput.trim(),
      sender: userAddr,
      timestamp,
      status: 'pending',
    };

    setDmPendingMessages((prev) => [...prev, tempMessage]);
    setDmMessageInput('');

    try {
      const { tx } = await writeDmRowWeb(writerCtx, ROOT_ID, activeDm.seedHex, JSON.stringify(payload));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = writerCtx.wallet.publicKey;
      const signed = await writerCtx.wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
      // Retry loading until message appears (max 3 attempts with 3s delay each)
      for (let attempt = 0; attempt < 3; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await loadDmMessages();
        // Check if message was loaded
        if (dmMessagesRef.current.some(m => m.id === messageId)) {
          console.log('[ChatClient] DM message found after', attempt + 1, 'attempts');
          break;
        }
        console.log('[ChatClient] DM message not found, attempt', attempt + 1, 'of 3');
      }
    } catch (err) {
      console.error('[ChatClient] Send DM error:', err);
      setDmPendingMessages((prev) => prev.filter((m) => m.id !== messageId));
      setDmError(err instanceof Error ? err.message : 'Failed to send DM');
    }
  }, [writerCtx, activeDm, dmMessageInput, connection, loadDmMessages]);

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
        isUserInitializing={isUserInitializing}
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
                error={messagesError}
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

      <DmModal
        isOpen={isDmModalOpen}
        onClose={() => {
          setIsDmModalOpen(false);
          onCloseDm?.();
        }}
        dmPeerInput={dmPeerInput}
        setDmPeerInput={setDmPeerInput}
        dmStatus={dmStatus}
        dmError={dmError}
        activeDm={activeDm}
        onStartDm={handleStartDm}
        dmMessages={allDmMessages}
        dmLoading={dmLoading}
        dmMessageInput={dmMessageInput}
        setDmMessageInput={setDmMessageInput}
        onSendDmMessage={handleSendDmMessage}
        dmMessagesEndRef={dmMessagesEndRef}
        canWrite={canWrite}
        walletAddress={wallet.publicKey?.toBase58() || null}
        viewerAddress={wallet.publicKey?.toBase58() || ''}
      />
    </div>
  );
}
