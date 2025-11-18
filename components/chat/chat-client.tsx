'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountInfo } from '@solana/web3.js';
import { PublicKey, Transaction } from '@solana/web3.js';
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
import { readRowsByTable, type Row } from '@/lib/onchainDB/web/reader';
import { configs, pdaInstructionTable, pdaRoot, pdaTable, pdaTxRef } from '@/lib/onchainDB';
import { useUserInit } from '@/lib/onchainDB/hooks/use-user-init';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';

const ROOT_ID = configs.defaultRootId;
const DECODER = new TextDecoder();
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;
const MESSAGE_COLUMNS = ['id', 'text', 'file', 'sender', 'displayName', 'avatarHue', 'timestamp', 'status', 'room'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a'];

type RoomMeta = {
  seedHex: string;
  seedBytes: Uint8Array;
  name: string;
  tableAddress: string;
  instructionAddress: string;
  columns: string[];
};

type MessageRow = {
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
};

function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('hex');
}

function normalizeBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === 'object' && Array.isArray(value.data)) {
    return Uint8Array.from(value.data);
  }
  return new Uint8Array();
}

function decodeBytes(value: any): string {
  try {
    const bytes = normalizeBytes(value);
    if (!bytes.length) return '';
    const decoded = DECODER.decode(bytes).replace(/\0+$/, '');
    if (decoded && PRINTABLE_ASCII.test(decoded)) {
      return decoded;
    }
    return bytesToHex(bytes);
  } catch {
    return '';
  }
}

function shorten(address: string, chars = 4) {
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

function deriveAvatarHue(address: string) {
  if (!address) return 160;
  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function formatTimestamp(ts?: number) {
  if (!ts) return '';
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name?: string) {
  if (!name) return '?';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, 1).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function normalizeFileUrl(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return url.toString();
    }
  } catch {
    return null;
  }
  return null;
}

type AttachmentType = 'image' | 'video' | 'audio' | 'other';

function detectAttachmentType(url: string): AttachmentType {
  try {
    const { pathname } = new URL(url);
    const ext = pathname.split('.').pop()?.toLowerCase() ?? '';
    if (IMAGE_EXTENSIONS.includes(ext)) return 'image';
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video';
    if (AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  } catch {
    // ignore
  }
  return 'other';
}

function AttachmentPreview({ url }: { url: string }) {
  const type = detectAttachmentType(url);
  if (type === 'image') {
    return (
      <img
        src={url}
        alt="Attachment"
        className="max-h-64 w-full rounded border border-white/10 object-contain"
        loading="lazy"
      />
    );
  }
  if (type === 'video') {
    return (
      <video controls src={url} className="max-h-64 w-full rounded border border-white/10">
        Your browser does not support the video tag.
      </video>
    );
  }
  if (type === 'audio') {
    return (
      <audio controls src={url} className="w-full">
        Your browser does not support the audio element.
      </audio>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-2 text-green-300 underline decoration-dotted underline-offset-2"
    >
      Open attachment
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 13v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6v6" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14L21 3" />
      </svg>
    </a>
  );
}

function parseTxRefAccount(data: Buffer | Uint8Array | null): Row | null {
  if (!data) return null;
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buffer.length < 12) return null;
  const len = buffer.readUInt32LE(8);
  if (len <= 0 || 12 + len > buffer.length) return null;
  const payload = buffer.slice(12, 12 + len);
  try {
    return JSON.parse(payload.toString('utf8')) as Row;
  } catch {
    return null;
  }
}

function rowToMessage(row: Row): MessageRow {
  const record = row ?? {};
  const idCandidate =
    (record as any).id ??
    (record as any).__rowId ??
    (record as any).text ??
    crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2, 10);

  return {
    id: String(idCandidate),
    text: record.text != null ? String(record.text) : '',
    file: record.file ? String(record.file) : '',
    signature: (record as any).__txSignature,
    sender: record.sender ? String(record.sender) : (record as any).senderAddress ? String((record as any).senderAddress) : undefined,
    displayName: record.displayName ? String(record.displayName) : undefined,
    avatarHue:
      record.avatarHue != null
        ? Number(record.avatarHue)
        : record.sender
        ? deriveAvatarHue(String(record.sender))
        : undefined,
    timestamp: record.timestamp != null ? Number(record.timestamp) : undefined,
    status: record.status ? (String(record.status) as MessageRow['status']) : 'confirmed',
    room: record.room ? String(record.room) : undefined,
  };
}

export function ChatClient() {
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

  const [rootStatus, setRootStatus] = useState<'checking' | 'missing' | 'creating' | 'ready' | 'error'>('checking');
  const [rootAccount, setRootAccount] = useState<AccountInfo<Buffer> | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [selectedSeed, setSelectedSeed] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [pendingMessages, setPendingMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  const [newRoomName, setNewRoomName] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [newRoomGateMint, setNewRoomGateMint] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [disconnectingPrivy, setDisconnectingPrivy] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [expandedAttachments, setExpandedAttachments] = useState<Record<string, boolean>>({});
  const [showAttachmentInput, setShowAttachmentInput] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const logSubscriptionsRef = useRef<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<MessageRow[]>([]);
  const selectedRoomRef = useRef<string | null>(null);

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

  const canWrite = Boolean(writerCtx && isUserInitialized);
  const viewerAddress = wallet.publicKey?.toBase58() ?? '';
  const orderedMessages = useMemo(() => {
    const deduped: MessageRow[] = [];
    const seen = new Set<string>();
    const addMessage = (msg: MessageRow) => {
      if (seen.has(msg.id)) return;
      seen.add(msg.id);
      deduped.push(msg);
    };
    messages.forEach(addMessage);
    pendingMessages.forEach(addMessage);
    return deduped.sort((a, b) => {
      const tsA = a.timestamp ?? 0;
      const tsB = b.timestamp ?? 0;
      return tsA - tsB;
    });
  }, [messages, pendingMessages]);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.seedHex === selectedSeed) ?? null,
    [rooms, selectedSeed]
  );

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!pendingMessages.length) return;
    setPendingMessages((prev) =>
      prev.filter((pending) => !messages.some((message) => message.id === pending.id))
    );
  }, [messages, pendingMessages.length]);

  useEffect(() => {
    selectedRoomRef.current = selectedRoom?.name ?? null;
  }, [selectedRoom]);

  const submitTransaction = useCallback(
    async (tx: Transaction) => {
      if (!wallet.publicKey) {
        throw new Error('Connect your wallet to continue');
      }
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = blockhash;
      return wallet.sendTransaction(tx, connection);
    },
    [connection, wallet]
  );

  const refreshRoot = useCallback(async () => {
    try {
      const info = await connection.getAccountInfo(rootPubkey);
      setRootAccount(info);
      setRootStatus(info ? 'ready' : 'missing');
      setRootError(null);
      return info;
    } catch (error) {
      setRootStatus('error');
      setRootError((error as Error).message);
      return null;
    }
  }, [connection, rootPubkey]);

  useEffect(() => {
    refreshRoot();
  }, [refreshRoot]);

  useEffect(() => {
    if (rootStatus !== 'missing' || !writerCtx) return;

    let cancelled = false;
    setRootError(null);

    const run = async () => {
      setRootStatus('creating');
      try {
        const { tx } = await initializeRootWeb(writerCtx, ROOT_ID);
        await submitTransaction(tx);
        if (!cancelled) {
          await refreshRoot();
        }
      } catch (error) {
        if (cancelled) return;
        // Root might have been created by another client meanwhile
        const latest = await connection.getAccountInfo(rootPubkey);
        if (latest) {
          setRootAccount(latest);
          setRootStatus('ready');
          setRootError(null);
        } else {
          setRootStatus('error');
          setRootError((error as Error).message);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [connection, writerCtx, refreshRoot, rootPubkey, rootStatus, submitTransaction]);

  useEffect(() => {
    if (!rootAccount) {
      setRooms([]);
      return;
    }

    let cancelled = false;

    const loadRooms = async () => {
      setRoomsLoading(true);
      setRoomsError(null);
      try {
        const decoded = coder.decode('Root', rootAccount.data) as any;
        const seedsRaw: any[] =
          decoded?.global_table_seeds ??
          decoded?.globalTableSeeds ??
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

        const nextRooms = (
          await Promise.all(
            uniqueSeeds.map(async (seedBytes) => {
              try {
                const tablePk = pdaTable(rootPubkey, seedBytes);
                const tableInfo = await connection.getAccountInfo(tablePk);
                if (!tableInfo) {
                  return null;
                }
                const tableDecoded = coder.decode('Table', tableInfo.data) as any;
                const name =
                  decodeBytes(tableDecoded?.name ?? tableDecoded?.table_name) ||
                  `room-${bytesToHex(seedBytes).slice(0, 6)}`;
                const columnNames: string[] = (tableDecoded?.column_names ?? tableDecoded?.columns ?? [])
                  .map((col: any) => decodeBytes(col))
                  .filter(Boolean);
                const instPk = pdaInstructionTable(rootPubkey, seedBytes);
                return {
                  seedHex: bytesToHex(seedBytes),
                  seedBytes,
                  name,
                  columns: columnNames,
                  tableAddress: tablePk.toBase58(),
                  instructionAddress: instPk.toBase58(),
                } as RoomMeta;
              } catch (error) {
                console.warn('Failed to decode table', error);
                return null;
              }
            })
          )
        ).filter((value): value is RoomMeta => Boolean(value));

        if (!cancelled) {
          setRooms(nextRooms);
          setRoomsError(null);
          if (nextRooms.length === 0) {
            setSelectedSeed(null);
          } else if (selectedSeed) {
            const stillExists = nextRooms.some((room) => room.seedHex === selectedSeed);
            if (!stillExists) {
              setSelectedSeed(nextRooms[0].seedHex);
            }
          } else {
            setSelectedSeed(nextRooms[0].seedHex);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setRoomsError((error as Error).message);
        }
      } finally {
        if (!cancelled) {
          setRoomsLoading(false);
        }
      }
    };

    loadRooms();

    return () => {
      cancelled = true;
    };
  }, [coder, connection, rootAccount, rootPubkey, selectedSeed]);

  const loadMessages = useCallback(
    async (room: RoomMeta, options?: { skipLoadingState?: boolean }) => {
      if (!options?.skipLoadingState) {
        setMessagesLoading(true);
        setMessagesError(null);
      }
      try {
        const rows = await readRowsByTable({
          connection,
          rootId: ROOT_ID,
          tableName: room.name,
          userPublicKey: (wallet.publicKey ?? PublicKey.default).toBase58(),
          idl: idl as Idl,
          maxTx: 50,
        });

        const normalized = rows.map((row) => rowToMessage(row)).reverse();
        setMessages(normalized);
        setPendingMessages((prev) =>
          prev.filter((pending) => !normalized.some((message) => message.id === pending.id))
        );
      } catch (error) {
        setMessagesError((error as Error).message);
      } finally {
        if (!options?.skipLoadingState) {
          setMessagesLoading(false);
        }
      }
    },
    [connection, wallet.publicKey]
  );

  useEffect(() => {
    if (!selectedRoom) {
      setMessages([]);
      setPendingMessages([]);
      return;
    }
    // Clear old messages immediately when switching rooms for better UX
    setMessages([]);
    setPendingMessages([]);
    loadMessages(selectedRoom);
  }, [selectedRoom, loadMessages]);

  useEffect(() => {
    logSubscriptionsRef.current.forEach((subId) => {
      connection.removeOnLogsListener(subId).catch(() => undefined);
    });
    logSubscriptionsRef.current = [];

    if (!selectedRoom) return;

    let cancelled = false;
    const subscriptions: number[] = [];

    const subscribe = async () => {
      const tablePk = new PublicKey(selectedRoom.tableAddress);
      const instructionPk = new PublicKey(selectedRoom.instructionAddress);

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
        loadMessages(selectedRoom, { skipLoadingState: true });
      });
      await register(instructionPk, 'confirmed', () => {
        loadMessages(selectedRoom, { skipLoadingState: true });
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
  }, [connection, loadMessages, selectedRoom]);

  useEffect(() => {
    if (!selectedRoom) return;

    let cancelled = false;
    const txRefPk = pdaTxRef(ROOT_ID);
    const subscriptions: number[] = [];

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
              const activeRoom = selectedRoomRef.current;
              if (!activeRoom || message.room !== activeRoom) {
                return;
              }
              if (message.file) {
                return;
              }
              message.status = 'pending';
              setPendingMessages((prev) => {
                if (prev.some((m) => m.id === message.id)) return prev;
                if (messagesRef.current.some((m) => m.id === message.id)) return prev;
                return [...prev, message];
              });
            } catch (error) {
              console.warn('Failed to process tx_ref update', error);
            }
          },
          'processed'
        );
        subscriptions.push(processedId);

        const confirmedId = await connection.onLogs(
          txRefPk,
          () => {
            if (selectedRoomRef.current) {
              loadMessages(selectedRoom, { skipLoadingState: true });
            }
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
  }, [connection, loadMessages, selectedRoom]);

  const handleCreateRoom = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!writerCtx || !isUserInitialized) {
        setRoomsError('Connect your wallet to create a room');
        return;
      }
      const name = newRoomName.trim();
      if (!name) return;

      setRoomsError(null);
      let gateMint: string | null = null;
      const trimmedGate = newRoomGateMint.trim();
      if (trimmedGate) {
        try {
          // Validate base58 upfront so we can show a friendly error
          new PublicKey(trimmedGate);
          gateMint = trimmedGate;
        } catch {
          setRoomsError('Invalid gate mint address');
          return;
        }
      }

      setCreatingRoom(true);
      try {
        const { tx } = await createTableWeb(writerCtx, ROOT_ID, name, MESSAGE_COLUMNS, {
          idColumn: 'id',
          gateMint,
        });
        await submitTransaction(tx);
        setNewRoomName('');
        setNewRoomGateMint('');
        await refreshRoot();
      } catch (error) {
        setRoomsError((error as Error).message);
      } finally {
        setCreatingRoom(false);
      }
    },
    [isUserInitialized, newRoomName, refreshRoot, submitTransaction, writerCtx]
  );

  const handleSendMessage = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!selectedRoom || !writerCtx || !isUserInitialized) return;
      const text = messageInput.trim();
      const attachment = attachmentUrl.trim();
      const normalizedAttachment = attachment ? normalizeFileUrl(attachment) : null;
      if (attachment && !normalizedAttachment) {
        setAttachmentError('Attachment must be a valid https:// URL');
        return;
      }
      if (!text && !normalizedAttachment) return;
      setAttachmentError(null);

      const messageId =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID().slice(0, 12)
          : Math.random().toString(36).slice(2, 10);
      const senderAddress = wallet.publicKey?.toBase58() ?? '';
      const displayName = senderAddress ? `You (${shorten(senderAddress)})` : 'You';
      const avatarHue = deriveAvatarHue(senderAddress);
      const timestamp = Date.now();

      const tempMessage: MessageRow = {
        id: messageId,
        text,
        file: normalizedAttachment ?? '',
        signature: 'pending',
        sender: senderAddress,
        displayName,
        avatarHue,
        timestamp,
        status: 'pending',
        room: selectedRoom.name,
      };

      // Clear input immediately and keep focus
      setMessageInput('');
      setAttachmentUrl('');
      setShowAttachmentInput(false);
      inputRef.current?.focus();

      setSendingMessage(true);
      setMessagesError(null);
      setPendingMessages((prev) => [...prev, tempMessage]);
      try {
        const payload = {
          id: messageId,
          text,
          file: normalizedAttachment ?? '',
          sender: senderAddress,
          displayName: senderAddress ? shorten(senderAddress, 6) : 'Anonymous',
          avatarHue,
          timestamp,
          status: 'sent',
          room: selectedRoom.name,
        };
        const { tx } = await writeRowWeb(writerCtx, ROOT_ID, selectedRoom.name, JSON.stringify(payload));
        const signature = await submitTransaction(tx);
        await loadMessages(selectedRoom, { skipLoadingState: true });
      } catch (error) {
        setPendingMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
        setMessagesError((error as Error).message);
      } finally {
        setSendingMessage(false);
      }
    },
    [attachmentUrl, connection, isUserInitialized, loadMessages, selectedRoom, submitTransaction, writerCtx, messageInput]
  );

  const rootStatusText = useMemo(() => {
    switch (rootStatus) {
      case 'checking':
        return 'Checking root account…';
      case 'missing':
        return 'Root not found. Will create once a wallet is connected.';
      case 'creating':
        return `Creating root “${ROOT_ID}”…`;
      case 'ready':
        return `Root ready (${shorten(rootPubkey.toBase58())})`;
      case 'error':
        return rootError ? `Root error: ${rootError}` : 'Root error';
      default:
        return '';
    }
  }, [rootError, rootPubkey, rootStatus]);

  const userInitStatus = useMemo(() => {
    if (!wallet.publicKey) {
      return 'Connect a wallet to enable chat actions.';
    }
    if (isUserInitializing) {
      return 'Preparing your on-chain session…';
    }
    if (userInitError) {
      return `Init error: ${userInitError.message}`;
    }
    if (!isUserInitialized) {
      return 'Account not initialized yet.';
    }
    return 'Account ready.';
  }, [isUserInitialized, isUserInitializing, userInitError, wallet.publicKey]);
  const canSubmitMessage = messageInput.trim().length > 0 || attachmentUrl.trim().length > 0;
  const sendDisabled = !canWrite || !canSubmitMessage || sendingMessage;

  const handleCopyAddress = useCallback(async () => {
    if (!wallet.publicKey) return;
    try {
      await navigator.clipboard.writeText(wallet.publicKey.toBase58());
      setCopiedAddress(true);
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch (error) {
      console.error('Failed to copy address:', error);
    }
  }, [wallet.publicKey]);

  const handleCopySenderAddress = useCallback(async (address: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error('Failed to copy sender address:', error);
    }
  }, []);

  const toggleAttachment = useCallback((messageId: string) => {
    setExpandedAttachments((prev) => {
      const newState = {
        ...prev,
        [messageId]: !prev[messageId],
      };

      // Scroll to entire message bubble after a brief delay to allow rendering
      if (newState[messageId]) {
        setTimeout(() => {
          const element = document.getElementById(`message-${messageId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'end' });
          }
        }, 100);
      }

      return newState;
    });
  }, []);

  const handleDownloadAttachment = useCallback(async (url: string) => {
    try {
      // Use Next.js API proxy to bypass CORS
      const proxyUrl = `/api/download?url=${encodeURIComponent(url)}`;
      const link = document.createElement('a');
      link.href = proxyUrl;
      link.download = url.split('/').pop() || 'attachment';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Failed to download attachment:', error);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll when messages or pending messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingMessages, scrollToBottom]);

  // Auto-close sidebar on mobile when room is selected
  useEffect(() => {
    if (selectedSeed && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [selectedSeed]);

  return (
    <div className="flex h-full flex-col bg-black/40 text-sm text-white">
      <header className="border-b-2 border-green-600 bg-black px-3 py-3 md:px-6 md:py-4">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="md:hidden flex items-center justify-center w-9 h-9 rounded border-2 border-green-600 bg-black/50 text-green-400 hover:bg-green-600/10 transition-colors"
              aria-label="Toggle sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <h1 className="text-lg md:text-xl      text-green-400">ON-CHAIN ROOMS</h1>
          </div>

          {wallet.publicKey ? (
            <div className="flex flex-col gap-2 items-end ml-auto">
              {isUserInitialized && rootStatus === 'ready' ? (
                <div className="border-2 border-green-500 bg-black/70 px-3 py-2   text-xs text-green-200">
                  <span className="text-green-300 text-xs uppercase">STATUS: OK</span>
                </div>
              ) : (
                <div className="border-2 border-yellow-400 bg-black/70 px-4 py-3   text-xs text-yellow-100 w-full">
                  <p className="text-yellow-200 text-sm tracking-[0.3em] uppercase">[STATUS: INIT]</p>
                  <div className="mt-2 space-y-1">
                    {rootStatus !== 'ready' && (
                      <div className="flex items-center gap-2">
                        <span className="text-yellow-300">ROOT</span>
                        <span className="text-[11px]">{rootStatusText.toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-300">USER</span>
                      <span className="text-[11px]">{userInitStatus.toUpperCase()}</span>
                    </div>
                    {userInitError && (
                      <button
                        type="button"
                        onClick={retryUserInit}
                        className="mt-1 text-[11px] text-yellow-100 underline decoration-dotted underline-offset-2 hover:text-yellow-200"
                      >
                        [RETRY]
                      </button>
                    )}
                    <p className="pt-2 text-[11px] text-yellow-200/70">
                      complete setup to unlock realtime room updates
                    </p>
                  </div>
                  <div className="mt-3 flex justify-end sm:justify-start">
                    <button
                      type="button"
                      onClick={async () => {
                        if (disconnectingPrivy) return;
                        setDisconnectingPrivy(true);
                        try {
                          await logout();
                        } finally {
                          setDisconnectingPrivy(false);
                        }
                      }}
                      className="text-[11px] text-red-300 underline decoration-dotted underline-offset-2 transition hover:text-red-200 disabled:opacity-50"
                      disabled={disconnectingPrivy}
                    >
                      {disconnectingPrivy ? 'Disconnecting…' : 'Disconnect'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-black/60 border border-green-600/50 rounded px-3 py-1.5 shadow-lg shadow-green-600/10">
              <span className="text-xs   text-green-400">
                [CONNECT WALLET TO START]
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile backdrop */}
        {isSidebarOpen && (
          <div
            className="md:hidden fixed inset-0 bg-black/70 backdrop-blur-md z-40"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          flex w-72 flex-col border-r border-white/10 bg-black z-50
          absolute md:relative inset-y-0 left-0
          transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          {/* Mobile close button */}
          <div className="md:hidden flex justify-start p-3 border-b border-white/10">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="flex items-center justify-center w-9 h-9 rounded border-2 border-green-600 bg-black text-green-400 hover:bg-green-600/10 transition-colors"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="border-b border-white/10 px-4 py-3">
            <form onSubmit={handleCreateRoom} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Create room</div>
              <input
                type="text"
                value={newRoomName}
                onChange={(event) => setNewRoomName(event.target.value)}
                placeholder="Room name"
                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                disabled={creatingRoom || !writerCtx}
              />
              <input
                type="text"
                value={newRoomGateMint}
                onChange={(event) => setNewRoomGateMint(event.target.value)}
                placeholder="Gate mint (optional)"
                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as React.CSSProperties}
                disabled={creatingRoom || !writerCtx}
              />
              <button
                type="submit"
                disabled={creatingRoom || !canWrite || !newRoomName.trim()}
                className="w-full rounded py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
                style={{
                  backgroundColor: creatingRoom || !canWrite || !newRoomName.trim() ? undefined : 'rgb(65, 255, 0)',
                  color: creatingRoom || !canWrite || !newRoomName.trim() ? undefined : 'rgb(0, 33, 0)',
                }}
                onMouseEnter={(e) => {
                  if (!creatingRoom && canWrite && newRoomName.trim()) {
                    e.currentTarget.style.opacity = '0.85';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {creatingRoom ? 'Creating…' : 'Create'}
              </button>
              {!writerCtx && (
                <p className="text-xs text-orange-300">Connect your wallet to create rooms.</p>
              )}
              {writerCtx && !isUserInitialized && !userInitError && (
                <p className="text-xs text-yellow-300">Setting up your account…</p>
              )}
              {userInitError && (
                <p className="text-xs text-red-400">
                  Failed to initialize your account. Please retry.
                </p>
              )}
              {roomsError && <p className="text-xs text-red-400">{roomsError}</p>}
            </form>
          </div>

          <div className="flex-1 overflow-y-auto px-2 py-3">
            <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-white/60">
              Rooms
            </div>
            {roomsLoading && <div className="px-2 py-2 text-sm text-white/60">Loading rooms…</div>}
            {!roomsLoading && rooms.length === 0 && (
              <div className="px-2 py-2 text-sm text-white/60">No chat room exists.</div>
            )}
            <div className="space-y-1">
              {rooms.map((room) => (
                <button
                  key={room.seedHex}
                  onClick={() => setSelectedSeed(room.seedHex)}
                  className={`w-full rounded px-3 py-2 text-left transition ${
                    selectedSeed === room.seedHex ? 'text-white' : 'bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
                  style={selectedSeed === room.seedHex ? { backgroundColor: 'rgba(65, 255, 0, 0.2)' } : undefined}
                >
                  <div className="font-semibold">{room.name}</div>
                  <div className="text-xs text-white/60">{shorten(room.tableAddress)}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="flex flex-1 flex-col overflow-hidden">
          {!selectedRoom ? (
            <div className="flex flex-1 items-center justify-center text-white/60">
              Choose or create a room to start chatting.
            </div>
          ) : (
            <>
              <div className="border-b border-white/10 px-3 py-3 md:px-6 md:py-4">
                <div className="text-xs uppercase tracking-wide text-white/60">Room</div>
                <h2 className="text-lg md:text-xl font-semibold">{selectedRoom.name}</h2>
                <p className="text-xs text-white/50">
                  Table: {shorten(selectedRoom.tableAddress)} · Instruction: {shorten(selectedRoom.instructionAddress)}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto bg-black/20 px-3 py-3 md:px-6 md:py-4">
                {messagesLoading && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: 'rgba(65, 255, 0, 0.2)', borderTopColor: 'rgb(65, 255, 0)' }}></div>
                      <div className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full animate-spin" style={{ borderRightColor: 'rgba(65, 255, 0, 0.4)', animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
                    </div>
                    <div className="mt-4 flex items-center gap-1">
                      <span className="text-sm  " style={{ color: 'rgb(65, 255, 0)' }}>LOADING</span>
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: 'rgb(65, 255, 0)', animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: 'rgb(65, 255, 0)', animationDelay: '150ms' }}></span>
                        <span className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: 'rgb(65, 255, 0)', animationDelay: '300ms' }}></span>
                      </span>
                    </div>
                  </div>
                )}
                {messagesError && <div className="text-red-400">{messagesError}</div>}
                {!messagesLoading && orderedMessages.length === 0 && (
                  <div className="text-white/50">No messages yet. Be the first to say hello!</div>
                )}
                <div className="space-y-4">
                  {orderedMessages.map((message) => {
                    const isOwn = message.sender && viewerAddress && message.sender === viewerAddress;
                    const bubbleName = isOwn ? 'You' : message.displayName || (message.sender ? shorten(message.sender) : 'Unknown');
                    const avatarHue = message.avatarHue ?? deriveAvatarHue(message.sender || bubbleName);
                    const isPending = message.status === 'pending';
                    const fileUrl = normalizeFileUrl(message.file);
                    const isAttachmentOpen = fileUrl ? !!expandedAttachments[message.id] : false;
                    const avatarStyle = { backgroundColor: `hsl(${avatarHue}, 65%, 48%)` };
                    return (
                      <div key={message.id} id={`message-${message.id}`} className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`flex max-w-[90%] md:max-w-[80%] items-end gap-2 md:gap-3 ${
                            isOwn ? 'flex-row-reverse text-right' : 'text-left'
                          }`}
                        >
                          <div
                            className="flex h-8 w-8 md:h-9 md:w-9 flex-shrink-0 items-center justify-center rounded-full text-xs md:text-sm font-semibold text-white shadow-lg"
                            style={avatarStyle}
                          >
                            {getInitials(bubbleName)}
                          </div>
                          <div
                            className="rounded-2xl border px-3 py-2 md:px-4 md:py-3 text-white"
                            style={
                              isOwn
                                ? { backgroundColor: 'rgba(65, 255, 0, 0.2)', borderColor: 'rgba(65, 255, 0, 0.6)' }
                                : { backgroundColor: 'rgba(255, 255, 255, 0.05)', borderColor: 'rgba(255, 255, 255, 0.1)' }
                            }
                          >
                            <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-wide text-white/70">
                              <span>{bubbleName}</span>
                              {message.sender && (
                                <button
                                  type="button"
                                  onClick={() => handleCopySenderAddress(message.sender!, message.id)}
                                  className="group relative flex items-center justify-center w-4 h-4 hover:bg-white/10 transition-colors border border-white/10 rounded"
                                  title="Copy wallet address"
                                >
                                  <svg
                                    className={`w-2.5 h-2.5 transition-all duration-300 ${
                                      copiedMessageId === message.id
                                        ? 'scale-0 opacity-0'
                                        : 'scale-100 opacity-100 text-white/50 group-hover:text-white/70'
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                  <svg
                                    className={`absolute w-2.5 h-2.5 transition-all duration-300 text-white/70 ${
                                      copiedMessageId === message.id ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                </button>
                              )}
                              <span className="text-white/40">· {formatTimestamp(message.timestamp)}</span>
                            </div>
                            <div className="text-sm leading-relaxed">{message.text || '[empty]'}</div>
                            {fileUrl && (
                              <div className="mt-3 space-y-2 text-left">
                                {!isAttachmentOpen && (
                                  <button
                                    type="button"
                                    onClick={() => toggleAttachment(message.id)}
                                    className="text-[11px]   uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                                  >
                                    Load attachment
                                  </button>
                                )}
                                {isAttachmentOpen && (
                                  <div id={`attachment-${message.id}`}>
                                    <div className="rounded-xl border border-white/10 bg-black/30 p-2">
                                      <AttachmentPreview url={fileUrl} />
                                    </div>
                                    <div className="flex gap-4 items-center">
                                      <button
                                        type="button"
                                        onClick={() => toggleAttachment(message.id)}
                                        className="text-[11px]   uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                                      >
                                        Hide attachment
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadAttachment(fileUrl)}
                                        className="text-[11px]   uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
                                      >
                                        Download
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            <div className="mt-2 flex items-center gap-2 text-[11px] text-white/50">
                              <span>#{message.id.slice(0, 6)}</span>
                              <span>·</span>
                              <span>
                                {isPending
                                  ? 'Processing…'
                                  : message.signature
                                  ? `Confirmed · ${shorten(message.signature)}`
                                  : 'Confirmed'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>
              </div>
              <form onSubmit={handleSendMessage} className="border-t border-white/10 bg-black/40 px-3 py-3 md:px-6 md:py-4">
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
                      disabled={sendDisabled}
                      className="rounded px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60 whitespace-nowrap"
                      style={{
                        backgroundColor: sendDisabled ? undefined : 'rgb(65, 255, 0)',
                        color: sendDisabled ? undefined : 'rgb(0, 33, 0)',
                      }}
                      onMouseEnter={(e) => {
                        if (!sendDisabled) {
                          e.currentTarget.style.opacity = '0.85';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1';
                      }}
                    >
                      <span className="hidden sm:inline">{sendingMessage ? 'Sending…' : 'Send'}</span>
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
                      className="  uppercase tracking-wide text-green-400 underline decoration-dotted underline-offset-2 hover:text-green-300"
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
