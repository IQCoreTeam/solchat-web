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
    });

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

    const writerCtx: WriterCtx = {
      connection,
      wallet,
      idl: idl as Idl,
    };

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

  // Open chat (placeholder)
  const handleOpenChat = (friend: Friend) => {
    console.log('[FriendsList] Opening chat with:', friend.address);
    // TODO: Navigate to DM chat
  };

  return (
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
  );
}
