/**
 * FriendsList Component
 * - Main friends list UI with tabs and actions
 */

'use client';

import { useMemo, useState } from 'react';
import { Transaction } from '@solana/web3.js';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { useFriends } from '@/lib/friends/use-friends';
import { FriendCard } from './friend-card';
import { AddFriendForm } from './add-friend-form';
import { configs, requestDmWeb, manageDmWeb, type WriterCtx } from '@/lib/onchainDB';
import { deriveDmSeed } from '@/lib/friends/utils';
import { DM_STATUS } from '@/lib/friends/types';
import type { Friend } from '@/lib/friends/types';
import idl from '@/lib/onchainDB/idl.json';

const ROOT_ID = configs.defaultRootId;
const MESSAGE_COLUMNS = ['id', 'text', 'sender', 'displayName', 'timestamp'];

type Tab = 'all' | 'pending' | 'blocked';

export function FriendsList() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const userAddress = wallet?.publicKey?.toBase58();

  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [error, setError] = useState<string | null>(null);

  // Fetch friends
  const { friends, loading, refetch } = useFriends({
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
    const signature = await connection.sendRawTransaction(signed.serialize());

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    });

    console.log(successMsg, signature);
  };

  // Send friend request
  const handleAddFriend = async (friendAddress: string) => {
    if (!userAddress || !wallet) {
      throw new Error('Wallet not connected');
    }

    if (friendAddress === userAddress) {
      throw new Error('Cannot add yourself as a friend');
    }

    // Check if already friends
    const existing = friends.find((f) => f.address === friendAddress);
    if (existing) {
      throw new Error(`Already ${existing.status} with this user`);
    }

    const dmSeed = deriveDmSeed(userAddress, friendAddress);

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as any,
    };

    const { tx } = await requestDmWeb(
      writerCtx,
      ROOT_ID,
      dmSeed,
      'dm',
      MESSAGE_COLUMNS,
      friendAddress,
      JSON.stringify({ type: 'friend_request' }),
      { idColumn: 'id' }
    );

    await sendTx(tx, '[FriendsList] Friend request sent:');
    await refetch();
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

    const { tx, dmTable } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.APPROVED);

    console.log('[FriendsList] DMTable PDA:', dmTable);
    console.log('[FriendsList] Expected:', friend.tableAddress);

    await sendTx(tx, '[FriendsList] Friend approved:');
    await refetch();
  };

  // Block/decline friend
  const handleBlockFriend = async (friend: Friend) => {
    if (!wallet) throw new Error('Wallet not connected');

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as any,
    };

    const { tx } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.BLOCKED);

    await sendTx(tx, '[FriendsList] Friend blocked:');
    await refetch();
  };

  // Unblock friend
  const handleUnblockFriend = async (friend: Friend) => {
    if (!wallet) throw new Error('Wallet not connected');

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as any,
    };

    const { tx } = await manageDmWeb(writerCtx, ROOT_ID, friend.dmSeed, DM_STATUS.APPROVED);

    await sendTx(tx, '[FriendsList] Friend unblocked:');
    await refetch();
  };

  // Open chat (placeholder)
  const handleOpenChat = (friend: Friend) => {
    console.log('[FriendsList] Opening chat with:', friend.address);
    // TODO: Navigate to DM chat
  };

  return (
    <div className="flex-1 p-4 md:p-6 max-w-4xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-green-400 font-mono mb-2">
          [FRIENDS]
        </h1>
        <p className="text-green-600 text-sm font-mono">
          Manage your on-chain friendships
        </p>
      </div>

      {/* Add Friend Form */}
      <div className="mb-6">
        <AddFriendForm onSubmit={handleAddFriend} disabled={!userAddress} />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b-2 border-green-700/30 pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
            activeTab === 'all'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-green-700 hover:text-green-500'
          }`}
        >
          [FRIENDS]
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
            activeTab === 'pending'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-green-700 hover:text-green-500'
          }`}
        >
          [REQUESTS]
        </button>
        <button
          onClick={() => setActiveTab('blocked')}
          className={`px-4 py-2 font-mono text-sm transition-colors ${
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
        <div className="bg-red-900/30 border-2 border-red-700 text-red-400 p-4 rounded mb-4 font-mono text-sm">
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <div className="text-green-400 font-mono animate-pulse">[LOADING...]</div>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredFriends.length === 0 && (
        <div className="text-center py-12 bg-black/20 border-2 border-green-900/30 rounded">
          <p className="text-green-700 font-mono text-sm">
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
  );
}
