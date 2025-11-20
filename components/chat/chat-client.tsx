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
import { readRowsByDmSeed, readRowsByTable, invalidateRoomCache, invalidateDmCache } from '@/lib/onchainDB/web/cached-reader-integration';
import { pdaDmInstructionTable, pdaDmTable, pdaInstructionTable, pdaRoot, pdaTable, pdaTxRef } from '@/lib/onchainDB';
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

// Helper function to parse txRef account data
function parseTxRefAccount(data: Buffer | Uint8Array | null): any | null {
  if (!data) return null;
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length < 12) return null;
  const len = buffer.readUInt32LE(8);
  if (len <= 0 || 12 + len > buffer.length) return null;
  const payload = buffer.slice(12, 12 + len);
  try {
    return JSON.parse(payload.toString('utf8'));
  } catch {
    return null;
  }
}

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
  const logSubscriptionsRef = useRef<number[]>([]);
  const dmLogSubscriptionsRef = useRef<number[]>([]);
  const selectedRoomRef = useRef<string | null>(null);

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

    // Add pending messages first
    pendingMessages.forEach(msg => messageMap.set(msg.id, msg));

    // Confirmed messages override pending ones with same ID
    messages.forEach(msg => messageMap.set(msg.id, msg));

    return Array.from(messageMap.values()).sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
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

  // Load messages for selected room (stable version for subscriptions)
  const loadMessagesForRoom = useCallback(async (room: RoomMeta, options?: { skipLoadingState?: boolean }) => {
    if (!options?.skipLoadingState) {
      setMessagesLoading(true);
      setMessagesError(null);
      setShowLoadingSpinner(true);
      setTimeout(() => setShowLoadingSpinner(false), 800);
    }

    try {
      const rows = await readRowsByTable({
        connection,
        rootId: ROOT_ID,
        userPublicKey: walletAddress,
        tableName: room.seedHex,
        idl: idl as any,
      });
      const mapped = rows.map((row: any) => rowToMessage(row)).filter((message: any) => message.text || message.file);
      console.log('[loadMessages] Loaded', mapped.length, 'messages, IDs:', mapped.map(m => m.id.slice(0, 8)));
      messagesRef.current = mapped;
      setMessages(mapped);
    } catch (err) {
      console.error('[ChatClient] Load messages error:', err);
      if (!options?.skipLoadingState) {
        setMessagesError(err instanceof Error ? err.message : 'Failed to load messages');
      }
    } finally {
      if (!options?.skipLoadingState) {
        setMessagesLoading(false);
      }
    }
  }, [connection, walletAddress]);

  // Wrapper for current room
  const loadMessages = useCallback(async (options?: { skipLoadingState?: boolean }) => {
    if (!selectedSeed) return;
    const room = rooms.find((r) => r.seedHex === selectedSeed);
    if (!room) return;
    await loadMessagesForRoom(room, options);
  }, [selectedSeed, rooms, loadMessagesForRoom]);

  // Load DM messages
  const loadDmMessages = useCallback(async (options?: { skipLoadingState?: boolean }) => {
    if (!activeDm) return;
    if (!options?.skipLoadingState) {
      setDmLoading(true);
    }
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
    } catch (err) {
      console.error('[ChatClient] Load DM messages error:', err);
      if (!options?.skipLoadingState) {
        setDmError(err instanceof Error ? err.message : 'Failed to load DM messages');
      }
    } finally {
      if (!options?.skipLoadingState) {
        setDmLoading(false);
      }
    }
  }, [activeDm, connection, walletAddress]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    loadDmMessages();
  }, [loadDmMessages]);

  // Sync refs with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    dmMessagesRef.current = dmMessages;
  }, [dmMessages]);

  useEffect(() => {
    selectedRoomRef.current = selectedRoom?.name || null;
  }, [selectedRoom]);

  // Auto-cleanup: remove pending messages when they appear in confirmed
  useEffect(() => {
    if (!pendingMessages.length) return;
    console.log('[auto-cleanup] Checking pending messages:', pendingMessages.map(m => m.id.slice(0, 8)));
    console.log('[auto-cleanup] Against confirmed messages:', messages.map(m => m.id.slice(0, 8)));
    setPendingMessages((prev) => {
      const filtered = prev.filter((pending) => !messages.some((message) => message.id === pending.id));
      if (filtered.length !== prev.length) {
        console.log('[auto-cleanup] Removed', prev.length - filtered.length, 'pending messages');
      }
      return filtered;
    });
  }, [messages, pendingMessages.length]);

  useEffect(() => {
    if (!dmPendingMessages.length) return;
    setDmPendingMessages((prev) =>
      prev.filter((pending) => !dmMessages.some((message) => message.id === pending.id))
    );
  }, [dmMessages, dmPendingMessages.length]);

  // WebSocket subscriptions for table and instruction addresses
  useEffect(() => {
    logSubscriptionsRef.current.forEach((subId) => {
      connection.removeOnLogsListener(subId).catch(() => undefined);
    });
    logSubscriptionsRef.current = [];

    if (!selectedRoom) return;

    let cancelled = false;
    const subscriptions: number[] = [];
    const room = selectedRoom; // Capture for closure

    const subscribe = async () => {
      const tablePk = new PublicKey(room.tableAddress);
      const instructionPk = new PublicKey(room.instructionAddress);

      const register = async (pubkey: PublicKey, commitment: 'processed' | 'confirmed', handler: () => void) => {
        try {
          const id = await connection.onLogs(pubkey, handler, commitment);
          if (cancelled) {
            connection.removeOnLogsListener(id).catch(() => undefined);
            return;
          }
          subscriptions.push(id);
        } catch (error) {
          console.warn('Failed to subscribe to logs', error);
        }
      };

      await register(tablePk, 'confirmed', () => {
        loadMessagesForRoom(room, { skipLoadingState: true });
      });
      await register(instructionPk, 'confirmed', () => {
        loadMessagesForRoom(room, { skipLoadingState: true });
      });

      logSubscriptionsRef.current = subscriptions;
    };

    subscribe();

    return () => {
      cancelled = true;
      subscriptions.forEach((subId) => {
        connection.removeOnLogsListener(subId).catch(() => undefined);
      });
      logSubscriptionsRef.current = [];
    };
  }, [connection, loadMessagesForRoom, selectedRoom]);

  // WebSocket subscription for txRef (processing state detection)
  useEffect(() => {
    if (!selectedRoom) return;

    let cancelled = false;
    const txRefPk = pdaTxRef(ROOT_ID);
    const subscriptions: number[] = [];
    const room = selectedRoom; // Capture for closure

    const subscribe = async () => {
      try {
        const processedId = await connection.onLogs(
          txRefPk,
          async () => {
            try {
              const info = await connection.getAccountInfo(txRefPk, { commitment: 'processed' });
              if (!info) return;
              const parsed = parseTxRefAccount(info.data);
              if (!parsed) return;
              const message = rowToMessage(parsed);
              message.status = 'pending';
              console.log('[txRef] Detected message:', message.id.slice(0, 8), 'text:', message.text.slice(0, 20));
              setPendingMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) return prev;
                if (messagesRef.current.some((m) => m.id === message.id)) return prev;
                console.log('[txRef] Adding to pending:', message.id.slice(0, 8));
                return [...prev, message];
              });
            } catch (error) {
              console.error('[txRef] Error:', error);
            }
          },
          'processed'
        );
        subscriptions.push(processedId);

        const confirmedId = await connection.onLogs(
          txRefPk,
          () => {
            console.log('[txRef confirmed] Triggering loadMessages for room:', room.name);
            loadMessagesForRoom(room, { skipLoadingState: true });
          },
          'confirmed'
        );
        subscriptions.push(confirmedId);
      } catch (error) {
        console.warn('Failed to subscribe to tx_ref logs', error);
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      subscriptions.forEach((subId) => {
        connection.removeOnLogsListener(subId).catch(() => undefined);
      });
    };
  }, [connection, loadMessagesForRoom, selectedRoom]);

  // WebSocket subscriptions for DMs
  useEffect(() => {
    dmLogSubscriptionsRef.current.forEach((subId) => {
      connection.removeOnLogsListener(subId).catch(() => undefined);
    });
    dmLogSubscriptionsRef.current = [];

    if (!activeDm) return;

    let cancelled = false;
    const subscriptions: number[] = [];
    const txRefPk = pdaTxRef(ROOT_ID);

    const subscribe = async () => {
      const tablePk = new PublicKey(activeDm.tableAddress);

      const register = async (pubkey: PublicKey, commitment: 'processed' | 'confirmed', handler: () => void) => {
        try {
          const id = await connection.onLogs(pubkey, handler, commitment);
          if (cancelled) {
            connection.removeOnLogsListener(id).catch(() => undefined);
            return;
          }
          subscriptions.push(id);
        } catch (error) {
          console.warn('Failed to subscribe to DM logs', error);
        }
      };

      await register(tablePk, 'confirmed', () => {
        loadDmMessages({ skipLoadingState: true });
      });
      await register(txRefPk, 'confirmed', () => {
        loadDmMessages({ skipLoadingState: true });
      });

      dmLogSubscriptionsRef.current = subscriptions;
    };

    subscribe();

    return () => {
      cancelled = true;
      subscriptions.forEach((subId) => {
        connection.removeOnLogsListener(subId).catch(() => undefined);
      });
      dmLogSubscriptionsRef.current = [];
    };
  }, [activeDm, connection, loadDmMessages]);

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
      // Invalidate cache so WebSocket listeners get fresh data
      await invalidateRoomCache(selectedRoom.seedHex);
      console.log('[handleSendMessage] Cache invalidated for room:', selectedRoom.seedHex.slice(0, 8));
    } catch (err) {
      console.error('[ChatClient] Send message error:', err);
      setMessagesError(err instanceof Error ? err.message : 'Failed to send message');
    }
  }, [writerCtx, selectedRoom, messageInput, attachmentUrl, connection]);

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

    setDmMessageInput('');

    try {
      const { tx } = await writeDmRowWeb(writerCtx, ROOT_ID, activeDm.seedHex, JSON.stringify(payload));
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = writerCtx.wallet.publicKey;
      const signed = await writerCtx.wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'processed');
      // Invalidate cache so WebSocket listeners get fresh data
      await invalidateDmCache(activeDm.seedBytes);
      console.log('[handleSendDmMessage] Cache invalidated for DM:', activeDm.seedHex.slice(0, 8));
    } catch (err) {
      console.error('[ChatClient] Send DM error:', err);
      setDmError(err instanceof Error ? err.message : 'Failed to send DM');
    }
  }, [writerCtx, activeDm, dmMessageInput, connection]);

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
