'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AccountInfo } from '@solana/web3.js';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
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
import { pdaInstructionTable, pdaRoot, pdaTable, pdaTxRef } from '@/lib/onchainDB';
import { useUserInit } from '@/lib/onchainDB/hooks/use-user-init';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { RPC_URL } from '@/lib/constants';

const ROOT_ID = 'solchat';
const DECODER = new TextDecoder();
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

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

  const logSubscriptionsRef = useRef<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.seedHex === selectedSeed) ?? null,
    [rooms, selectedSeed]
  );

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
        loadMessages(selectedRoom);
      });
      await register(instructionPk, 'confirmed', () => {
        loadMessages(selectedRoom);
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
    if (!wallet.publicKey || !selectedRoom) return;

    let cancelled = false;
    let subscriptionId: number | null = null;
    const txRefPk = pdaTxRef(wallet.publicKey);

    const subscribe = async () => {
      try {
        const id = await connection.onLogs(txRefPk, () => {
          loadMessages(selectedRoom);
        }, 'confirmed');

        if (cancelled) {
          connection.removeOnLogsListener(id).catch(() => undefined);
          return;
        }

        subscriptionId = id;
      } catch (error) {
        console.warn('Failed to subscribe to tx_ref logs', error);
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      if (subscriptionId !== null) {
        connection.removeOnLogsListener(subscriptionId).catch(() => undefined);
      }
    };
  }, [connection, loadMessages, selectedRoom, wallet.publicKey]);

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
        const { tx } = await createTableWeb(writerCtx, ROOT_ID, name, ['id', 'text', 'file'], {
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

      const tempMessage: MessageRow = {
        id: messageId,
        text,
        file: '',
        signature: 'pending',
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
        };
        const { tx } = await writeRowWeb(writerCtx, ROOT_ID, selectedRoom.name, JSON.stringify(payload));
        await submitTransaction(tx);
        await loadMessages(selectedRoom);
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
        return 'Creating root “solchat”…';
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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Auto-scroll when messages or pending messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingMessages, scrollToBottom]);

  return (
    <div className="flex h-full flex-col bg-black/40 text-sm text-white">
      <header className="border-b border-white/10 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-emerald-300">SOLCHAT</p>
            <h1 className="text-2xl font-semibold">On-chain Rooms</h1>
          </div>

          {wallet.publicKey ? (
            <div className="flex items-center gap-3">
              {isUserInitialized && rootStatus === 'ready' ? (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-2">
                  <span className="text-xs font-medium text-emerald-300">
                    Securely connected to IQ Labs
                  </span>
                  <div className="h-4 w-px bg-emerald-500/30"></div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/70 font-mono">
                      {shorten(wallet.publicKey.toBase58(), 4)}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="group relative flex items-center justify-center w-6 h-6 rounded hover:bg-emerald-500/20 transition-colors"
                      title="Copy wallet address"
                    >
                      <svg
                        className={`w-3.5 h-3.5 transition-all duration-300 ${
                          copiedAddress
                            ? 'scale-0 opacity-0'
                            : 'scale-100 opacity-100 text-white/70 group-hover:text-emerald-300'
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
                        className={`absolute w-3.5 h-3.5 transition-all duration-300 text-emerald-400 ${
                          copiedAddress ? 'scale-100 opacity-100' : 'scale-0 opacity-0'
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
                  </div>
                </div>
              ) : (
                <div className="text-xs text-white/70 space-y-1">
                  <div
                    className={
                      userInitError
                        ? 'text-red-300'
                        : isUserInitializing
                        ? 'text-yellow-300'
                        : 'text-white/60'
                    }
                  >
                    {rootStatus !== 'ready' && <div>{rootStatusText}</div>}
                    <div>{userInitStatus}</div>
                    {userInitError && (
                      <button
                        type="button"
                        onClick={retryUserInit}
                        className="ml-2 underline text-white"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-white/50">
              Connect wallet to get started
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
                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-emerald-400"
                disabled={creatingRoom || !writerCtx}
              />
              <input
                type="text"
                value={newRoomGateMint}
                onChange={(event) => setNewRoomGateMint(event.target.value)}
                placeholder="Gate mint (optional)"
                className="w-full rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-emerald-400"
                disabled={creatingRoom || !writerCtx}
              />
              <button
                type="submit"
                disabled={creatingRoom || !canWrite || !newRoomName.trim()}
                className="w-full rounded bg-emerald-500 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
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
                    selectedSeed === room.seedHex ? 'bg-emerald-500/20 text-white' : 'bg-white/5 text-white/80 hover:bg-white/10'
                  }`}
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
                      <div className="w-12 h-12 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin"></div>
                      <div className="absolute inset-0 w-12 h-12 border-4 border-transparent border-r-emerald-400/40 rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
                    </div>
                    <div className="mt-4 flex items-center gap-1">
                      <span className="text-sm text-emerald-300 font-medium">Loading messages</span>
                      <span className="flex gap-0.5">
                        <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                      </span>
                    </div>
                  </div>
                )}
                {messagesError && <div className="text-red-400">{messagesError}</div>}
                {!messagesLoading && messages.length === 0 && (
                  <div className="text-white/50">No messages yet. Be the first to say hello!</div>
                )}
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className="rounded border border-white/10 bg-white/5 p-3">
                      <div className="text-sm text-white">{message.text || '[empty]'}</div>
                      {message.file && (
                        <div className="text-xs text-white/70">Attachment: {message.file}</div>
                      )}
                      <div className="mt-1 text-[11px] text-white/40">
                        #{message.id} {message.signature ? `· ${shorten(message.signature)}` : null}
                      </div>
                    </div>
                  ))}
                  {pendingMessages.map((message) => (
                    <div
                      key={`pending-${message.id}`}
                      className="rounded border border-yellow-400/40 bg-yellow-400/10 p-3"
                    >
                      <div className="text-sm text-yellow-100">{message.text || '[empty]'}</div>
                      <div className="mt-1 text-[11px] text-yellow-300">#{message.id} · Processing…</div>
                    </div>
                  ))}
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
                    className="flex-1 rounded bg-white/10 px-4 py-2 text-sm text-white placeholder-white/50 outline-none focus:ring-2 focus:ring-emerald-400"
                    disabled={!canWrite}
                  />
                  <button
                    type="submit"
                    disabled={!canWrite || !messageInput.trim()}
                    className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
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
