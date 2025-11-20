/**
 * FriendsList Component
 * - Main friends list UI with tabs and actions
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useFriends } from '@/lib/friends/use-friends';
import { FriendCard } from './friend-card';
import { AddFriendForm } from './add-friend-form';
import { configs, requestDmWeb, manageDmWeb, writeDmRowWeb, type WriterCtx } from '@/lib/onchainDB';
import { readRowsByDmSeed, type Row } from '@/lib/onchainDB/web/cached-reader-integration';
import { deriveDmSeed, shortenAddress } from '@/lib/friends/utils';
import { DM_STATUS } from '@/lib/friends/types';
import type { Friend } from '@/lib/friends/types';
import idl from '@/lib/onchainDB/idl.json';
import { Idl } from '@coral-xyz/anchor';
import { Window, WindowHeader, WindowContent, Button, Tabs, Tab, TabBody, Cutout } from 'react95';
import { ThemeProvider } from 'styled-components';
import { MessageBubble } from '@/components/ui/message-bubble';
import { MessageInputForm } from '@/components/chat/message-input-form';
import { normalizeFileUrl } from '@/lib/utils/message-utils';
import { GlobalStyles, darkGreenTheme } from './theme';
import { ROOT_ID, MESSAGE_COLUMNS } from '@/lib/onchainDB/constants';
import { sendAndConfirmTx } from '@/lib/onchainDB/utils/transaction-helpers';

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
  const [showChatLoadingSpinner, setShowChatLoadingSpinner] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatMessageInput, setChatMessageInput] = useState('');
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const [addFriendModalOpen, setAddFriendModalOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [friendToBlock, setFriendToBlock] = useState<Friend | null>(null);
  const [showAttachmentInput, setShowAttachmentInput] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

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
        { },
        { idColumn: 'id' }
      );
      await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend request sent:');
      await refetch();
      setAddFriendModalOpen(false); // Close modal on success
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

      await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend approved:');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to approve friend';
      setError(message);
      console.error('[FriendsList] Failed to approve friend', err);
    }
  };

  // Show block confirmation
  const showBlockConfirm = (friend: Friend) => {
    setFriendToBlock(friend);
    setBlockConfirmOpen(true);
  };

  // Block/decline friend
  const handleBlockFriend = async () => {
    if (!wallet || !friendToBlock) return;

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as any,
    };

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

      await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] Friend unblocked:');
      await refetch();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to unblock friend';
      setError(message);
      console.error('[FriendsList] Failed to unblock friend', err);
    }
  };

  const scrollChatToBottom = useCallback(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
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
    // Don't clear messages to prevent flash - let new messages replace old ones
    setChatError(null);
    setChatMessageInput('');
    setChatOpen(true);
    await loadChatHistory(friend);
    setTimeout(() => {
      scrollChatToBottom();
    }, 0);
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

    // Validate attachment URL
    const fileUrl = normalizeFileUrl(attachmentUrl);
    if (attachmentUrl.trim() && !fileUrl) {
      setAttachmentError('Invalid attachment URL. Must be a valid https:// link.');
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
      file: fileUrl || undefined,
      sender: userAddress,
      displayName: shortenAddress(userAddress, 6),
      timestamp,
      status: 'pending',
      room: `dm-${chatFriend.dmSeedHex.slice(0, 6)}`,
      __rowId: `temp-${messageId}`,
    } as Row;

    const payload: any = {
      id: messageId,
      text,
      sender: userAddress,
      displayName: shortenAddress(userAddress, 6),
      timestamp,
      status: 'sent',
      room: `dm-${chatFriend.dmSeedHex.slice(0, 6)}`,
    };

    if (fileUrl) {
      payload.file = fileUrl;
    }

    // Clear inputs immediately (before sending)
    setChatMessageInput('');
    setAttachmentUrl('');
    setAttachmentError(null);
    setShowAttachmentInput(false);
    setChatError(null);

    // Add temp message to pending BEFORE sending
    setChatPendingMessages((prev) => [...prev, tempMessage]);

    try {
        const { tx } = await writeDmRowWeb(writerCtx, ROOT_ID, chatFriend.dmSeed, JSON.stringify(payload));
        await sendAndConfirmTx(connection, wallet, tx, '[FriendsList] DM sent:');
        // Retry loading until message appears (max 3 attempts with 3s delay each)
        let messageFound = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 3000));
          const rows = await readRowsByDmSeed({
            connection,
            rootId: ROOT_ID,
            userPublicKey: userAddress || chatFriend.address,
            idl: idl as any,
            dmSeed: chatFriend.dmSeed,
            maxTx: 100,
          });
          setChatMessages(rows);
          // Check if message was loaded
          if (rows.some((m: any) => m.id === messageId)) {
            console.log('[FriendsList] Message found after', attempt + 1, 'attempts');
            messageFound = true;
            break;
          }
          console.log('[FriendsList] Message not found, attempt', attempt + 1, 'of 3');
        }
    } catch (err) {
      // Remove temp message on error
      setChatPendingMessages((prev) => prev.filter((msg) => msg.__rowId !== tempMessage.__rowId));
      const message = err instanceof Error ? err.message : 'Failed to send DM';
      setChatError(message);
    }
  };

  // Debounced loading spinner - only show if loading takes longer than 300ms
  useEffect(() => {
    if (chatLoading) {
      const timer = setTimeout(() => {
        setShowChatLoadingSpinner(true);
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setShowChatLoadingSpinner(false);
    }
  }, [chatLoading]);

  // Auto-scroll when messages or pending messages change
  useEffect(() => {
    if (chatOpen) {
      scrollChatToBottom();
    }
  }, [chatMessages, chatPendingMessages, chatOpen, scrollChatToBottom]);

  // Combine and deduplicate messages (pending + confirmed)
  const orderedChatMessages = useMemo(() => {
    // Deduplicate: prefer confirmed messages (with signatures) over pending ones
    const messageMap = new Map<string, Row>();

    console.log('[FriendsList] Deduplicating:', {
      pendingCount: chatPendingMessages.length,
      confirmedCount: chatMessages.length,
      pendingIds: chatPendingMessages.map(m => ({ id: m.id, rowId: m.__rowId, sig: !!m.__txSignature })),
      confirmedIds: chatMessages.slice(0, 3).map(m => ({ id: m.id, rowId: m.__rowId, sig: !!m.__txSignature })),
    });

    // Add pending messages first
    chatPendingMessages.forEach(msg => {
      const key = msg.id || msg.__rowId;
      if (key) messageMap.set(String(key), msg);
    });

    // Confirmed messages override pending ones with same ID
    chatMessages.forEach(msg => {
      const key = msg.id || msg.__rowId;
      if (key) messageMap.set(String(key), msg);
    });

    const deduplicated = Array.from(messageMap.values());
    console.log('[FriendsList] Deduplicated result:', deduplicated.length, 'messages');
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
    console.log('[FriendsList] Auto-cleanup - confirmed IDs:', Array.from(confirmedIds).slice(0, 5));
    setChatPendingMessages((prev) => {
      const before = prev.length;
      const pendingIds = prev.map(m => m.id);
      console.log('[FriendsList] Auto-cleanup - pending IDs:', pendingIds);
      const after = prev.filter((msg) => !confirmedIds.has(msg.id));
      console.log('[FriendsList] Auto-cleanup - removed:', before - after.length, 'pending messages');
      return after;
    });
  }, [chatMessages]);

  return (
    <ThemeProvider theme={darkGreenTheme}>
      <GlobalStyles />
      <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
        <Window style={{ width: '100%', marginBottom: '20px' }}>
          <WindowContent>
            <div style={{ padding: '8px' }}>
              {/* Error Banner */}
              {(error || friendsError) && (
                <Cutout style={{ padding: '8px', marginBottom: '16px', background: '#330000' }}>
                  <p style={{ color: '#ff0000', fontSize: '12px', fontFamily: 'monospace' }}>
                    ERROR: {error || friendsError}
                  </p>
                </Cutout>
              )}

              {/* Tabs and Add Friend Button */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <Tabs value={activeTab} onChange={(value) => setActiveTab(value as Tab)}>
                  <Tab value="all">[FRIENDS]</Tab>
                  <Tab value="pending">[REQUESTS]</Tab>
                  <Tab value="blocked">[BLOCKED]</Tab>
                </Tabs>
                <Button
                  onClick={() => setAddFriendModalOpen(true)}
                  disabled={!userAddress}
                  primary
                  style={{ fontFamily: 'monospace', fontSize: '11px', marginLeft: '12px' }}
                >
                  [ADD FRIEND]
                </Button>
              </div>

              <TabBody style={{ marginTop: '16px', minHeight: '300px' }}>
                {/* Loading state */}
                {loading && (
                  <div style={{ textAlign: 'center', padding: '48px 0' }}>
                    <p style={{ color: '#00ff00', fontFamily: 'monospace' }}>[LOADING...]</p>
                  </div>
                )}

                {/* Empty state */}
                {!loading && filteredFriends.length === 0 && (
                  <Cutout style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <p style={{ color: '#00ff00', fontFamily: 'monospace', fontSize: '12px' }}>
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
              </TabBody>
            </div>
          </WindowContent>
        </Window>
      </div>
    {chatOpen && chatFriend && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6">
        <div className="bg-black border-2 border-green-700 rounded-xl w-full max-w-4xl h-[85vh] flex flex-col">
          {/* Header */}
          <div className="border-b border-green-700/50 px-4 py-3 flex items-center justify-between flex-shrink-0">
            <h3 className="text-green-400 font-bold">
              DM with {shortenAddress(chatFriend.address)}
            </h3>
            <Button onClick={closeChatModal} size="sm" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
              X
            </Button>
          </div>

          {/* Info banner */}
          <div className="border-b border-green-700/30 bg-black/60 px-4 py-2 text-xs text-green-600 flex-shrink-0">
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
            {orderedChatMessages.map((row, index) => {
                const meta = row as Record<string, any>;
                const key = meta.__rowId ?? meta.id ?? meta.signature ?? index;
                const sender = meta.sender ?? meta.author ?? userAddress;
                const textContent =
                  typeof meta.text === 'string'
                    ? meta.text
                    : typeof meta.message === 'string'
                    ? meta.message
                    : JSON.stringify(meta);
                const isSender = sender === userAddress;
                return (
                  <MessageBubble
                    key={key}
                    id={meta.id || key}
                    text={textContent}
                    sender={sender}
                    displayName={meta.displayName || shortenAddress(sender, 6)}
                    avatarHue={meta.avatarHue}
                    timestamp={meta.timestamp}
                    status={meta.status || 'confirmed'}
                    signature={meta.signature}
                    file={meta.file}
                    isOwn={isSender}
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
              <Button onClick={() => setAddFriendModalOpen(false)} size="sm" style={{ padding: '2px 8px', fontSize: '10px' }}>
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
                <p style={{ color: '#00ff00', fontFamily: 'monospace', fontSize: '12px', marginBottom: '16px' }}>
                  Are you sure you want to block {shortenAddress(friendToBlock.address, 6)}?
                </p>
                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                  <Button onClick={() => { setBlockConfirmOpen(false); setFriendToBlock(null); }}>
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
    </ThemeProvider>
  );
}
