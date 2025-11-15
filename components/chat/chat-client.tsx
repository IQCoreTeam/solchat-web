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
    return [...messages, ...pendingMessages].sort((a, b) => {
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

        const normalized = rows.map(rowToMessage).reverse();
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
      if (!text) return;

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
        file: '',
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
      inputRef.current?.focus();

      setSendingMessage(true);
      setMessagesError(null);
      setPendingMessages((prev) => [...prev, tempMessage]);
      try {
        const payload = {
          id: messageId,
          text,
          file: '',
          sender: senderAddress,
          displayName: senderAddress ? shorten(senderAddress, 6) : 'Anonymous',
          avatarHue,
          timestamp,
          status: 'sent',
          room: selectedRoom.name,
        };
        const { tx } = await writeRowWeb(writerCtx, ROOT_ID, selectedRoom.name, JSON.stringify(payload));
        await submitTransaction(tx);
        await loadMessages(selectedRoom, { skipLoadingState: true });
      } catch (error) {
        setPendingMessages((prev) => prev.filter((msg) => msg.id !== tempMessage.id));
        setMessagesError((error as Error).message);
      } finally {
        setSendingMessage(false);
      }
    },
    [isUserInitialized, loadMessages, messageInput, selectedRoom, submitTransaction, writerCtx]
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll when messages or pending messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingMessages, scrollToBottom]);

  return (
    <div className="flex h-full flex-col bg-black/40 text-sm text-white">
      <header className="border-b-2 border-green-600 bg-black px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-mono font-bold text-green-400">ON-CHAIN ROOMS</h1>
          </div>

          {wallet.publicKey ? (
            <div className="flex flex-col gap-2">
              {isUserInitialized && rootStatus === 'ready' ? (
                <div className="flex items-center gap-2 bg-black/60 border border-green-600/50 rounded px-3 py-1.5 shadow-lg shadow-green-600/10">
                  <span className="text-xs font-mono text-green-400">
                    [SECURELY CONNECTED]
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-black/60 border border-green-600/50 rounded px-3 py-1.5 shadow-lg shadow-green-600/10">
                  <span className="text-xs font-mono text-green-400">
                    {rootStatus !== 'ready' && <div>[{rootStatusText.toUpperCase()}]</div>}
                    <div>[{userInitStatus.toUpperCase()}]</div>
                    {userInitError && (
                      <button
                        type="button"
                        onClick={retryUserInit}
                        className="ml-2 underline text-green-400 hover:text-green-300 font-mono"
                      >
                        [RETRY]
                      </button>
                    )}
                  </span>
                </div>
              )}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/50">
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
                  className="text-red-300 underline disabled:opacity-50"
                  disabled={disconnectingPrivy}
                >
                  {disconnectingPrivy ? 'Disconnecting…' : 'Disconnect Privy wallet'}
                </button>
                <span>Use this to create a fresh embedded wallet for testing.</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-black/60 border border-green-600/50 rounded px-3 py-1.5 shadow-lg shadow-green-600/10">
              <span className="text-xs font-mono text-green-400">
                [CONNECT WALLET TO START]
              </span>
            </div>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-72 flex-col border-r border-white/10 bg-black/30">
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
              <div className="border-b border-white/10 px-6 py-4">
                <div className="text-xs uppercase tracking-wide text-white/60">Room</div>
                <h2 className="text-xl font-semibold">{selectedRoom.name}</h2>
                <p className="text-xs text-white/50">
                  Table: {shorten(selectedRoom.tableAddress)} · Instruction: {shorten(selectedRoom.instructionAddress)}
                </p>
              </div>
              <div className="flex-1 overflow-y-auto bg-black/20 px-6 py-4">
                {messagesLoading && (
                  <div className="flex flex-col items-center justify-center h-full">
                    <div className="relative">
                      <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: 'rgba(65, 255, 0, 0.2)', borderTopColor: 'rgb(65, 255, 0)' }}></div>
                      <div className="absolute inset-0 w-12 h-12 border-4 border-transparent rounded-full animate-spin" style={{ borderRightColor: 'rgba(65, 255, 0, 0.4)', animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
                    </div>
                    <div className="mt-4 flex items-center gap-1">
                      <span className="text-sm font-mono" style={{ color: 'rgb(65, 255, 0)' }}>LOADING</span>
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
                    const avatarStyle = { backgroundColor: `hsl(${avatarHue}, 65%, 48%)` };
                    return (
                      <div key={message.id} className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`flex max-w-[80%] items-end gap-3 ${
                            isOwn ? 'flex-row-reverse text-right' : 'text-left'
                          }`}
                        >
                          <div
                            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white shadow-lg"
                            style={avatarStyle}
                          >
                            {getInitials(bubbleName)}
                          </div>
                          <div
                            className="rounded-2xl border px-4 py-3 text-white"
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
              <form onSubmit={handleSendMessage} className="border-t border-white/10 bg-black/40 px-6 py-4">
                <div className="flex gap-3">
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
                    disabled={!canWrite || !messageInput.trim()}
                    className="rounded px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
                    style={{
                      backgroundColor: !canWrite || !messageInput.trim() ? undefined : 'rgb(65, 255, 0)',
                      color: !canWrite || !messageInput.trim() ? undefined : 'rgb(0, 33, 0)',
                    }}
                    onMouseEnter={(e) => {
                      if (canWrite && messageInput.trim()) {
                        e.currentTarget.style.opacity = '0.85';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.opacity = '1';
                    }}
                  >
                    Send
                  </button>
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
