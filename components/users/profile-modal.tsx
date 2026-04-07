/**
 * Profile Modal Component
 * Shows full user profile when clicking on profile picture in chat
 */

'use client';

import { useMemo, useState } from 'react';
import { Buffer } from 'buffer';

import { useRouter } from 'next/navigation';
import { useUserProfile } from './use-user-profile';
import { shorten } from '@/lib/utils/message-utils';
import { DefaultProfileAvatar } from '@/components/ui/default-profile-avatar';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import iqlabs from 'iqlabs-sdk';
import { IQ_IDL } from 'iqlabs-sdk/contract';

import type { SignerInput } from 'iqlabs-sdk/utils';
import { sendTx } from '@/lib/iqlabs/send-tx';
import { DM_STATUS } from '@/lib/friends/types';
import { ROOT_ID } from '@/lib/iqlabs/constants';
import { useDmRelationship } from './use-dm-relationship';
import { requestDmConnection } from '@/lib/friends/request-connection';

interface ProfileModalProps {
  walletAddress: string;
  onClose: () => void;
}

export function ProfileModal({ walletAddress, onClose }: ProfileModalProps) {
  const router = useRouter();
  const { profile, loading, error } = useUserProfile(walletAddress);
  const [imageError, setImageError] = useState(false);
  const [copied, setCopied] = useState(false);
  const wallet = useAppWallet();
  const { connection, readConnection } = useAppConnection();
  const signer = useMemo<SignerInput | null>(() => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }
    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: wallet.signAllTransactions.bind(wallet),
    };
  }, [wallet]);
  const programId = useMemo(() => iqlabs.contract.PROGRAM_ID, []);
  const dbRootId = useMemo(() => iqlabs.utils.toSeedBytes(ROOT_ID), []);
  const dbRoot = useMemo(
    () => iqlabs.contract.getDbRootPda(dbRootId, programId),
    [dbRootId, programId]
  );
  const builder = useMemo(
    () => iqlabs.contract.createInstructionBuilder(IQ_IDL, programId),
    [programId]
  );
  const viewerAddress = wallet.publicKey?.toBase58() || null;
  const isOwnProfile = viewerAddress === walletAddress;
  const [requestStatus, setRequestStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [unblockState, setUnblockState] = useState<'idle' | 'confirm' | 'working'>('idle');
  const [unblockError, setUnblockError] = useState<string | null>(null);

  const {
    status: dmStatus,
    loading: dmStatusLoading,
    error: dmStatusError,
    isRequester,
    isBlocker,
    dmSeed,
    refresh: refreshDmState,
  } = useDmRelationship(readConnection, viewerAddress, walletAddress);
  const handleCopyWallet = async () => {
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy wallet:', err);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const routeToFriends = (openDm = false) => {
    const params = new URLSearchParams();
    if (openDm && walletAddress) {
      params.set('dm', walletAddress);
    }
    const query = params.toString();
    router.push(query ? `/friends?${query}` : '/friends');
    onClose();
  };

  const handleOpenDm = () => routeToFriends(true);

  const canSendFriendRequest =
    !!connection &&
    !!wallet.publicKey &&
    !!signer &&
    walletAddress &&
    walletAddress !== wallet.publicKey.toBase58();

  const handleSendFriendRequest = async () => {
    if (!canSendFriendRequest || !wallet.publicKey || !signer) return;
    setRequestError(null);
    setRequestStatus('sending');
    try {
      await requestDmConnection(connection, signer, ROOT_ID, wallet.publicKey.toBase58(), walletAddress.trim());
      setRequestStatus('success');
      refreshDmState();
    } catch (err) {
      setRequestStatus('error');
      const message = err instanceof Error ? err.message : 'Failed to send request';
      setRequestError(message);
      console.error('[ProfileModal] Friend request error:', err);
    }
  };

  const handleBlockedButtonClick = async () => {
    if (!isBlocker) return;
    if (!dmSeed) {
      setUnblockError('Missing DM reference.');
      return;
    }
    if (!wallet.publicKey || !signer) {
      setUnblockError('Connect your wallet to manage this DM.');
      setUnblockState('idle');
      return;
    }

    if (unblockState === 'idle') {
      setUnblockError(null);
      setUnblockState('confirm');
      return;
    }

    if (unblockState === 'working') return;

    setUnblockError(null);
    setUnblockState('working');

    try {
      const connectionTable = iqlabs.contract.getConnectionTablePda(
        dbRoot,
        dmSeed,
        programId
      );
      const ix = iqlabs.contract.manageConnectionInstruction(
        builder,
        {
          db_root: dbRoot,
          connection_table: connectionTable,
          signer: signer.publicKey,
        },
        {
          db_root_id: dbRootId,
          connection_seed: Buffer.from(dmSeed),
          new_status: DM_STATUS.APPROVED,
        }
      );
      await sendTx(connection, signer, ix);
      setUnblockState('idle');
      refreshDmState();
    } catch (err) {
      setUnblockState('confirm');
      const message = err instanceof Error ? err.message : 'Failed to unblock';
      setUnblockError(message);
      console.error('[ProfileModal] Unblock error:', err);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-black border-2 border-green-500 rounded-lg max-w-md w-full p-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/60 hover:text-white transition text-2xl leading-none"
          title="Close"
        >
          ×
        </button>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-green-400">Loading profile...</div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-red-400 text-center py-6">
            Failed to load profile
          </div>
        )}

        {/* No profile found */}
        {!loading && !error && (
          <div className="space-y-6">
            {/* Profile picture */}
            <div className="flex justify-center">
              {profile?.profilePicture && !imageError ? (
                <img
                  src={profile.profilePicture}
                  alt={profile?.name || 'Default avatar'}
                  className="w-32 h-32 rounded-full object-cover border-4 border-green-500"
                  onError={() => setImageError(true)}
                />
              ) : (
                <DefaultProfileAvatar
                  seed={profile?.pubkey || profile?.name || walletAddress || 'profile'}
                  className="w-32 h-32 rounded-full border-4 border-green-700"
                />
              )}
            </div>

            {/* Name */}
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">
                {profile?.name || 'Annonymous'}
              </h2>
            </div>

            {/* Bio */}
            {profile?.bio ? (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="text-sm font-bold text-green-400 mb-2">BIO</div>
                <div className="text-white/80 text-sm leading-relaxed">
                  {profile.bio}
                </div>
              </div>
            ) : (
              <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center text-white/50 text-sm">
                This user hasn't created a profile yet.
              </div>
            )}

            {/* Wallet address */}
            <div className="bg-white/5 border border-white/10 rounded-lg p-4">
              <div className="text-sm font-bold text-green-400 mb-2">
                WALLET ADDRESS
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="text-white/60 text-xs  break-all">
                  {shorten(walletAddress, 8)}
                </div>
                <button
                  onClick={handleCopyWallet}
                  className="text-xs text-green-400 hover:text-green-300 font-bold transition whitespace-nowrap"
                  title="Copy full wallet address"
                >
                  {copied ? 'COPIED!' : 'COPY'}
                </button>
              </div>
            </div>

            {!isOwnProfile && (
              <div className="space-y-3">
                {dmStatusLoading && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-sm text-white/70">
                    Checking friend status...
                  </div>
                )}

                {!dmStatusLoading && dmStatusError && (
                  <div className="bg-red-500/10 border border-red-500/40 rounded-lg p-3 text-xs text-red-200">
                    Unable to confirm your DM status. Try again from the Friends tab.
                  </div>
                )}

                {!dmStatusLoading && dmStatus === 'none' && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-2">
                    <div className="text-sm font-bold text-green-400 mb-1">
                      FRIEND REQUEST
                    </div>
                    <button
                      onClick={handleSendFriendRequest}
                      disabled={!canSendFriendRequest || requestStatus === 'sending' || requestStatus === 'success'}
                      className={`w-full rounded border border-green-500 px-4 py-2 text-sm font-bold transition ${
                        requestStatus === 'success'
                          ? 'bg-green-500 text-black cursor-default'
                          : 'text-green-400 hover:bg-green-500/10'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      {requestStatus === 'success'
                        ? 'REQUEST SENT'
                        : requestStatus === 'sending'
                          ? 'SENDING...'
                          : 'ADD FRIEND'}
                    </button>
                    {requestError && (
                      <div className="text-xs text-red-400 text-center">{requestError}</div>
                    )}
                    {!canSendFriendRequest && (
                      <div className="text-xs text-white/40 text-center">
                        Connect your wallet to send a request.
                      </div>
                    )}
                  </div>
                )}

                {!dmStatusLoading && dmStatus === 'pending' && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                    <div className="text-sm font-bold text-green-400">DM STATUS</div>
                    <p className="text-white/70 text-sm">
                      {isRequester
                        ? 'Request sent. You can continue chatting while it is pending.'
                        : 'Incoming request. Review it from the Friends page.'}
                    </p>
                    <button
                      onClick={handleOpenDm}
                      className="w-full rounded border border-green-500 px-4 py-2 text-sm font-bold text-green-300 hover:bg-green-500/10"
                    >
                      {isRequester ? 'OPEN DM' : 'REVIEW REQUEST'}
                    </button>
                  </div>
                )}

                {!dmStatusLoading && dmStatus === 'approved' && (
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                    <div className="text-sm font-bold text-green-400">DM STATUS</div>
                    <p className="text-white/70 text-sm">
                      You're connected with this user. Jump into your DM anytime.
                    </p>
                    <button
                      onClick={handleOpenDm}
                      className="w-full rounded border border-green-500 px-4 py-2 text-sm font-bold text-green-300 hover:bg-green-500/10"
                    >
                      OPEN DM
                    </button>
                  </div>
                )}

                {!dmStatusLoading && dmStatus === 'blocked' && (
                  <div className="bg-red-900/30 border border-red-500/40 rounded-lg p-4 space-y-3">
                    <div className="text-sm font-bold text-red-300">DM STATUS</div>
                    <p className="text-white/70 text-sm">
                      {isBlocker
                        ? 'You blocked this DM. Confirm to unblock and resume chatting.'
                        : 'This conversation is blocked. Only the blocker can reopen it.'}
                    </p>
                    <button
                      onClick={handleBlockedButtonClick}
                      disabled={!isBlocker || unblockState === 'working'}
                      className={`w-full rounded border px-4 py-2 text-sm font-bold transition ${
                        isBlocker
                          ? 'border-red-500 text-red-200 hover:bg-red-500/10 disabled:opacity-60 disabled:cursor-not-allowed'
                          : 'border-red-500 text-red-400 opacity-70 cursor-not-allowed'
                      }`}
                    >
                      {isBlocker
                        ? unblockState === 'working'
                          ? 'UNBLOCKING...'
                          : unblockState === 'confirm'
                            ? 'CONFIRM UNBLOCK'
                            : 'BLOCKED'
                        : 'BLOCKED'}
                    </button>
                    {unblockError && (
                      <div className="text-xs text-red-200 text-center">{unblockError}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
