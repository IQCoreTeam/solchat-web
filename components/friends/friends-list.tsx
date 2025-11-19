/**
 * FriendsList Component
 * - Main friends list UI with tabs and actions
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { Transaction } from '@solana/web3.js';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useFriends } from '@/lib/friends/use-friends';
import { FriendCard } from './friend-card';
import { AddFriendForm } from './add-friend-form';
import { configs, requestDmWeb, manageDmWeb, writeDmRowWeb, type WriterCtx } from '@/lib/onchainDB';
import { readRowsByDmSeed, type Row } from '@/lib/onchainDB/web/reader';
import { deriveDmSeed, shortenAddress } from '@/lib/friends/utils';
import { DM_STATUS } from '@/lib/friends/types';
import type { Friend } from '@/lib/friends/types';
import idl from '@/lib/onchainDB/idl.json';
import {Idl} from "@coral-xyz/anchor";

const ROOT_ID = configs.defaultRootId;
const MESSAGE_COLUMNS = ['id', 'text', 'file', 'sender', 'displayName', 'avatarHue', 'timestamp', 'status', 'room'];

type Tab = 'all' | 'pending' | 'blocked';

export function FriendsList() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const userAddress = wallet?.publicKey?.toBase58();

  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [error, setError] = useState<string | null>(null);
  const [chatFriend, setChatFriend] = useState<Friend | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<Row[]>([]);
  const [chatPendingMessages, setChatPendingMessages] = useState<Row[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);

  const writerCtx = useMemo<WriterCtx | null>(() => {
    if (!wallet) return null;
    return {
      connection,
      wallet,
      idl: idl as Idl,
    };
  }, [connection, wallet]);

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

  const closeChatModal = () => {
    setChatOpen(false);
    setChatFriend(null);
    setChatMessages([]);
    setChatPendingMessages([]);
    setChatError(null);
    setChatMessageInput('');
    setChatSending(false);
  };

  // Fetch friends
  const { friends, loading, error: friendsError, refetch } = useFriends({
    connection,
    userAddress: userAddress || '',
    programId: configs.programId,
    idl: idl as any,
  });

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

  // Send transaction helper
  const sendTx = async (tx: Transaction, successMsg: string) => {
    if (!wallet) throw new Error('Wallet not connected');

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey!;

    const signed = await wallet.signTransaction(tx);
    const serialized = signed.serialize();
    const signature = await connection.sendRawTransaction(serialized);

    console.log('[sendTx] signature', signature);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'processed');

    console.log(successMsg, signature);
  };

  // Send friend request
  const handleAddFriend = async (friendAddress: string) => {
    setError(null);
    if (!userAddress || !wallet) {
      throw new Error('Wallet not connected');
    }

    if (friendAddress === userAddress) {
      throw new Error('Cannot add yourself as a friend');
    }
    console.log('[FriendsList] Sending friend request to:', friendAddress);

      // Check if already friends
    const existing = friends.find((f) => f.address === friendAddress);
    if (existing) {
      throw new Error(`Already ${existing.status} with this user`);
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
        MESSAGE_COLUMNS,
        friendAddress,
        { },
        { idColumn: 'id' }
      );
      await sendTx(tx, '[FriendsList] Friend request sent:');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send request';
      setError(message);

      const maybeLogs = (err as any)?.logs ?? (err as any)?.simulationResponse?.logs;
      if (maybeLogs) {
        console.error('[FriendsList] requestDmWeb logs', maybeLogs);
      }
      console.error('[FriendsList] requestDmWeb error', err);

      throw err;
    }
  };

  // Approve friend request
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
      idl: idl as any,
    };

    setError(null);

    try {
      const { tx, dmTable } = await manageDmWeb(
        writerCtx,
        ROOT_ID,
        friend.dmSeed,
        DM_STATUS.APPROVED
      );

      console.log('[FriendsList] DMTable PDA:', dmTable);
      console.log('[FriendsList] Expected:', friend.tableAddress);

      await sendTx(tx, '[FriendsList] Friend approved:');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve friend';
      setError(message);
      console.error('[FriendsList] Failed to approve friend', err);
    }
  };

  // Block/decline friend
  const handleBlockFriend = async (friend: Friend) => {
    if (!wallet) throw new Error('Wallet not connected');

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as any,
    };

    setError(null);

    try {
      const { tx } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.BLOCKED);

      await sendTx(tx, '[FriendsList] Friend blocked:');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to block friend';
      setError(message);
      console.error('[FriendsList] Failed to block friend', err);
    }
  };

  // Unblock friend
  const handleUnblockFriend = async (friend: Friend) => {
    if (!wallet) throw new Error('Wallet not connected');

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as any,
    };

    setError(null);

    try {
      const { tx } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.APPROVED);

      await sendTx(tx, '[FriendsList] Friend unblocked:');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unblock friend';
      setError(message);
      console.error('[FriendsList] Failed to unblock friend', err);
    }
  };

  const scrollChatToBottom = useCallback(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const loadChatHistory = useCallback(
    async (friend: Friend, opts?: { silent?: boolean }) => {
      if (!userAddress && !friend.address) return;
      if (!opts?.silent) {
        setChatLoading(true);
        setChatError(null);
      }
      try {
        const rows = await readRowsByDmSeed({
          connection,
          rootId: ROOT_ID,
          userPublicKey: userAddress || friend.address,
          programId: configs.programId,
          idl: idl as any,
          dmSeed: friend.dmSeed,
          maxTx: 100,
        });
        setChatMessages(rows);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load DM conversation';
        setChatError(message);
      } finally {
        if (!opts?.silent) {
          setChatLoading(false);
        }
      }
    },
    [connection, userAddress]
  );

  const handleOpenChat = async (friend: Friend) => {
    setChatFriend(friend);
    setChatMessages([]);
    setChatPendingMessages([]);
    setChatError(null);
    setChatMessageInput('');
    setChatOpen(true);
    await loadChatHistory(friend);
    setTimeout(() => {
      scrollChatToBottom();
    }, 50);
  };

  const handleSendChatMessage = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!chatFriend || !writerCtx || !userAddress) return;
    const text = chatMessageInput.trim();
    if (!text) return;
    if (!canSendChatToFriend(chatFriend)) {
      setChatError('Approve the request to continue this conversation.');
      return;
    }

    // Generate unique message ID
    const messageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 12)
        : Math.random().toString(36).slice(2, 10);

    const timestamp = Date.now();

    // Create temp message with pending status
    const tempMessage: Row = {
      id: messageId,
      text,
      sender: userAddress,
      displayName: shortenAddress(userAddress, 6),
      timestamp,
      status: 'pending',
      room: `dm-${chatFriend.dmSeedHex.slice(0, 6)}`,
      __rowId: `temp-${messageId}`,
    } as Row;

    const payload = {
      id: messageId,
      text,
      sender: userAddress,
      displayName: shortenAddress(userAddress, 6),
      timestamp,
      status: 'sent',
      room: `dm-${chatFriend.dmSeedHex.slice(0, 6)}`,
    };

    // Clear input immediately (before sending)
    setChatMessageInput('');
    setChatSending(true);
    setChatError(null);

    // Add temp message to pending BEFORE sending
    setChatPendingMessages((prev) => [...prev, tempMessage]);

    try {
        const { tx } = await writeDmRowWeb(writerCtx, ROOT_ID, chatFriend.dmSeed, JSON.stringify(payload));
        await sendTx(tx, '[FriendsList] DM sent:');
        await loadChatHistory(chatFriend, { silent: true });
    } catch (err) {
      // Remove temp message on error
      setChatPendingMessages((prev) => prev.filter((msg) => msg.__rowId !== tempMessage.__rowId));
      const message = err instanceof Error ? err.message : 'Failed to send DM';
      setChatError(message);
    } finally {
      setChatSending(false);
    }
  };

  // Auto-scroll when messages or pending messages change
  useEffect(() => {
    if (chatOpen) {
      scrollChatToBottom();
    }
  }, [chatMessages, chatPendingMessages, chatOpen, scrollChatToBottom]);

  // Combine and deduplicate messages (pending + confirmed)
  const orderedChatMessages = useMemo(() => {
    const combined = [...chatMessages, ...chatPendingMessages];
    const seen = new Set<string>();
    const deduplicated = combined.filter((msg) => {
      const key = msg.id || msg.__rowId;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return deduplicated.sort((a, b) => {
      const aTime = typeof a.timestamp === 'number' ? a.timestamp : 0;
      const bTime = typeof b.timestamp === 'number' ? b.timestamp : 0;
      return aTime - bTime;
    });
  }, [chatMessages, chatPendingMessages]);

  // Auto-cleanup: remove pending messages that appear in confirmed messages
  useEffect(() => {
    if (chatMessages.length === 0) return;
    const confirmedIds = new Set(chatMessages.map((msg) => msg.id).filter(Boolean));
    setChatPendingMessages((prev) =>
      prev.filter((msg) => !confirmedIds.has(msg.id))
    );
  }, [chatMessages]);

  return (
    <>
    <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-green-400   mb-2">
          [FRIENDS]
        </h1>
        <p className="text-green-600 text-sm  ">
          Manage your on-chain friendships
        </p>
      </div>

      {/* Error Banner */}
      {(error || friendsError) && (
        <div className="mb-4 border border-red-700 bg-red-900/30 text-red-300 px-4 py-2   text-sm rounded">
          {error || friendsError}
        </div>
      )}

      {/* Add Friend Form */}
      <div className="mb-6">
        <AddFriendForm onSubmit={handleAddFriend} disabled={!userAddress} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b-2 border-green-700/30 pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2   text-sm transition-colors ${
            activeTab === 'all'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-green-700 hover:text-green-500'
          }`}
        >
          [FRIENDS]
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2   text-sm transition-colors ${
            activeTab === 'pending'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-green-700 hover:text-green-500'
          }`}
        >
          [REQUESTS]
        </button>
        <button
          onClick={() => setActiveTab('blocked')}
          className={`px-4 py-2   text-sm transition-colors ${
            activeTab === 'blocked'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-green-700 hover:text-green-500'
          }`}
        >
          [BLOCKED]
        </button>
      </div>

      {/* Error display */}
      {error && (
        <div className="bg-red-900/30 border-2 border-red-700 text-red-400 p-4 rounded mb-4   text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <div className="text-green-400   animate-pulse">[LOADING...]</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredFriends.length === 0 && (
        <div className="text-center py-12 bg-black/20 border-2 border-green-900/30 rounded">
          <p className="text-green-700   text-sm">
            {activeTab === 'all' && 'No friends yet. Add someone above!'}
            {activeTab === 'pending' && 'No pending requests'}
            {activeTab === 'blocked' && 'No blocked users'}
          </p>
        </div>
      )}

      {/* Friends list */}
      {!loading && filteredFriends.length > 0 && (
        <div className="grid gap-3">
          {filteredFriends.map((friend) => (
            <FriendCard
              key={friend.tableAddress}
              friend={friend}
              currentUser={userAddress || ''}
              onApprove={handleApproveFriend}
              onBlock={handleBlockFriend}
              onUnblock={handleUnblockFriend}
              onOpenChat={handleOpenChat}
            />
          ))}
        </div>
      )}
    </div>
    {chatOpen && chatFriend && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
        <div className="w-full max-w-2xl rounded-xl border-2 border-green-400 bg-black shadow-2xl shadow-green-500/20">
          <div className="flex items-start justify-between border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-green-300">Direct Message</p>
              <p className="text-white text-sm">
                {shortenAddress(chatFriend.address, 6)}
              </p>
              <p className="text-white/60 text-xs">
                Table: {shortenAddress(chatFriend.tableAddress, 6)}
              </p>
              <p className="text-white/40 text-[11px] break-all">Seed: {chatFriend.dmSeedHex}</p>
              <p className="text-white/50 text-[11px]">
                Status: {chatFriend.status}
                {chatFriend.status === 'pending' &&
                  (isRequesterForFriend(chatFriend)
                    ? ' · Only you can message until they approve'
                    : ' · Approve to reply')}
                {chatFriend.status === 'blocked' && ' · Unblock to continue conversation'}
              </p>
            </div>
            <button
              type="button"
              onClick={closeChatModal}
              className="rounded border border-white/30 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-white/10"
            >
              [CLOSE]
            </button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto px-4 py-3 space-y-3">
            {chatLoading && <div className="text-white/70">Loading conversation…</div>}
            {chatError && <div className="text-red-400 text-sm">{chatError}</div>}
            {!chatLoading && !chatError && orderedChatMessages.length === 0 && (
              <div className="text-white/60 text-sm">No DM messages yet.</div>
            )}
            {!chatLoading &&
              !chatError &&
              orderedChatMessages.map((row, index) => {
                const meta = row as Record<string, any>;
                const key = meta.__rowId ?? meta.id ?? meta.signature ?? index;
                const sender = meta.sender ?? meta.author ?? 'Unknown';
                const textContent =
                  typeof meta.text === 'string'
                    ? meta.text
                    : typeof meta.message === 'string'
                    ? meta.message
                    : JSON.stringify(meta);
                const tsValue = meta.timestamp ?? meta.createdAt ?? meta.time;
                let formattedTime = '';
                if (typeof tsValue === 'number') {
                  formattedTime = new Date(tsValue).toLocaleString();
                } else if (typeof tsValue === 'string' && tsValue) {
                  const asNumber = Number(tsValue);
                  if (!Number.isNaN(asNumber)) {
                    formattedTime = new Date(asNumber).toLocaleString();
                  }
                }
                const messageStatus = meta.status === 'pending' ? 'Pending' : 'Confirmed';
                const isPending = meta.status === 'pending';
                return (
                  <div key={key} className={`rounded border p-3 ${isPending ? 'border-yellow-500/30 bg-yellow-900/10' : 'border-white/15 bg-white/5'}`}>
                    <div className="flex items-center justify-between text-xs text-white/60">
                      <span>{sender}</span>
                      <div className="flex items-center gap-2">
                        {formattedTime && <span>{formattedTime}</span>}
                        <span className={isPending ? 'text-yellow-400' : 'text-green-400'}>{messageStatus}</span>
                      </div>
                    </div>
                    <div className="mt-2 text-sm text-white whitespace-pre-wrap break-words">
                      {textContent}
                    </div>
                  </div>
                );
              })}
            <div ref={chatMessagesEndRef} />
          </div>
          <form onSubmit={handleSendChatMessage} className="border-t border-white/10 bg-black/70 px-4 py-3 flex flex-col gap-2 rounded-b-xl">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatMessageInput}
                onChange={(event) => setChatMessageInput(event.target.value)}
                placeholder="Send a DM…"
                className="flex-1 rounded bg-white/10 px-3 py-2 text-sm text-white placeholder-white/50 outline-none focus:ring-2"
                style={{ '--tw-ring-color': 'rgb(65, 255, 0)' } as CSSProperties}
                disabled={!writerCtx || !chatFriend || !canSendChatToFriend(chatFriend)}
              />
              <button
                type="submit"
                disabled={
                  !writerCtx ||
                  !chatMessageInput.trim() ||
                  !chatFriend ||
                  !canSendChatToFriend(chatFriend)
                }
                className="rounded px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/60"
                style={{
                  backgroundColor:
                    !writerCtx ||
                    !chatMessageInput.trim() ||
                    !chatFriend ||
                    !canSendChatToFriend(chatFriend)
                      ? undefined
                      : 'rgb(65, 255, 0)',
                  color:
                    !writerCtx ||
                    !chatMessageInput.trim() ||
                    !chatFriend ||
                    !canSendChatToFriend(chatFriend)
                      ? undefined
                      : 'rgb(0, 33, 0)',
                }}
              >
                Send
              </button>
            </div>
            {!writerCtx && (
              <p className="text-xs text-orange-300">Connect your wallet to send DMs.</p>
            )}
            {chatFriend && !canSendChatToFriend(chatFriend) && (
              <p className="text-xs text-yellow-300">
                {chatFriend.status === 'pending'
                  ? isRequesterForFriend(chatFriend)
                    ? 'Request pending. Waiting for approval from the recipient.'
                    : 'Approve this request before replying.'
                  : 'Unblock this DM to continue the conversation.'}
              </p>
            )}
          </form>
        </div>
      </div>
    )}
    </>
  );
}
