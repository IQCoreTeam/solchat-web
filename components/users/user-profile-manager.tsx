/**
 * User Profile Manager Component - Zo's Vision
 * - My Profile: Set name, bio, profile pic using updateUserMetadata
 * - All Users: Fetch all user pubkeys from admin table, then fetch each User account's metadata
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';
import { ProfileEditor } from './profile-editor';
import { UserList } from './user-list';
import { getCachedAccountInfo } from '@/lib/rpc/cache';
import { PublicKey, SystemProgram, type AccountInfo } from '@solana/web3.js';
import { Buffer } from 'buffer';
import type { Idl } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk/src';
import idl from 'iqlabs-sdk/idl/code_in.json';
import type { SignerInput } from 'iqlabs-sdk/src/sdk/utils/wallet';
import { sendTx } from 'iqlabs-sdk/src/sdk/writer/writer_utils';
import { ROOT_ID, MESSAGE_COLUMNS, DM_TABLE_NAME } from '@/lib/iqlabs/constants';

export interface UserProfile {
  pubkey: string;
  name: string;
  bio: string;
  profilePicture: string;
  timestamp?: number;
}

// Helper: Extract metadata string from User account
function extractUserMetadata(info?: AccountInfo<Buffer> | null): string {
  if (!info?.data) return '';
  try {
    const data = Buffer.from(info.data);
    let offset = 8; // discriminator
    offset += 32; // owner
    if (offset + 4 > data.length) return '';
    const dataLen = data.readUInt32LE(offset);
    offset += 4 + dataLen;
    if (offset + 4 > data.length) return '';
    const metadataLen = data.readUInt32LE(offset);
    offset += 4;
    if (metadataLen <= 0 || offset + metadataLen > data.length) return '';
    return data.slice(offset, offset + metadataLen).toString('utf8').trim();
  } catch {
    return '';
  }
}

// Helper: Parse metadata (txID or direct JSON)
async function parseMetadata(
  connection: ReturnType<typeof useAppConnection>['connection'],
  metadataStr: string
): Promise<{ name: string; bio: string; profilePicture: string } | null> {
  if (!metadataStr || metadataStr.length <= 2) return null;

  try {
    // Check if it's a txID (base58, 88-90 chars)
    if (metadataStr.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadataStr)) {
      const result = await iqlabs.reader.readCodeIn(metadataStr);
      if (!result?.data || result.data.startsWith('[unable')) return null;
      return JSON.parse(result.data);
    }
    // Direct JSON
    return JSON.parse(metadataStr);
  } catch {
    return null;
  }
}

export function UserProfileManager() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const { ready, authenticated, login } = usePrivy();
  const userAddress = wallet?.publicKey?.toBase58();

  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my-profile' | 'all-users'>('my-profile');

  const programId = useMemo(() => iqlabs.contract.getProgramId(), []);
  const dbRootId = useMemo(() => Buffer.from(ROOT_ID, 'utf8'), []);
  const dbRoot = useMemo(() => iqlabs.contract.getDbRootPda(dbRootId, programId), [dbRootId, programId]);
  const builder = useMemo(() => iqlabs.contract.createInstructionBuilder(idl as Idl, programId), [programId]);

  const signer = useMemo<SignerInput | null>(() => {
    if (!wallet?.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: wallet.signAllTransactions.bind(wallet),
    } as SignerInput;
  }, [wallet]);

  // Load user's profile from their User account
  const loadMyProfile = useCallback(async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);
    try {
      const userPk = new PublicKey(userAddress);
      const userPda = iqlabs.contract.getUserPda(userPk, programId);

      const accountInfo = await getCachedAccountInfo(connection, userPda);
      if (!accountInfo?.data) {
        setMyProfile(null);
        return;
      }

      const metadataStr = extractUserMetadata(accountInfo);
      const profileData = await parseMetadata(connection, metadataStr);

      setMyProfile({
        pubkey: userAddress,
        name: profileData?.name || '',
        bio: profileData?.bio || '',
        profilePicture: profileData?.profilePicture || '',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[UserProfile] Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userAddress, connection, programId]);

  // Load all user profiles from global_user_list table
  const loadAllProfiles = useCallback(async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);
    try {
      // Get global_user_list table
      const tableSeed = Buffer.from('global_user_list', 'utf8');
      const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed, programId);
      const tableInfo = await connection.getAccountInfo(tablePda);

      if (!tableInfo) {
        setAllProfiles([]);
        return;
      }

      // Fetch all rows from table
      const rows = await iqlabs.reader.readTableRows(tablePda);

      // Extract user pubkeys
      const userPubkeys: string[] = [];
      for (const row of rows) {
        const pubkeyStr = (row as any).pubkeyString || (row as any).pubkey;
        if (pubkeyStr) userPubkeys.push(pubkeyStr);
      }

      if (userPubkeys.length === 0) {
        setAllProfiles([]);
        return;
      }

      // Batch fetch User accounts
      const userPdas = userPubkeys.map(pk => iqlabs.contract.getUserPda(new PublicKey(pk), programId));
      const accountInfos = await connection.getMultipleAccountsInfo(userPdas);

      // Parse profiles
      const profiles: UserProfile[] = [];
      for (let i = 0; i < userPubkeys.length; i++) {
        const pubkey = userPubkeys[i];
        const accountInfo = accountInfos[i];

        const metadataStr = extractUserMetadata(accountInfo);
        const profileData = await parseMetadata(connection, metadataStr);

        profiles.push({
          pubkey,
          name: profileData?.name || '',
          bio: profileData?.bio || '',
          profilePicture: profileData?.profilePicture || '',
          timestamp: Date.now(),
        });
      }

      setAllProfiles(profiles);
    } catch (err) {
      console.error('[UserProfile] Error loading profiles:', err);
      if (err instanceof Error && err.message.includes('Account does not exist')) {
        setAllProfiles([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load profiles');
      }
    } finally {
      setLoading(false);
    }
  }, [connection, userAddress, dbRoot, programId]);

  // Save user profile
  const saveProfile = useCallback(
    async (profile: Omit<UserProfile, 'pubkey'>) => {
      if (!userAddress || !signer) throw new Error('Wallet not connected');

      setError(null);
      try {
        const userPk = new PublicKey(userAddress);
        const userPda = iqlabs.contract.getUserPda(userPk, programId);

        // Prepare metadata JSON
        const fullMetadata = JSON.stringify({
          name: profile.name,
          bio: profile.bio,
          profilePicture: profile.profilePicture,
        });

        console.log('[UserProfile] Storing metadata with iqlabs.writer.codeIn...');

        // Store metadata as transaction, get txID
        // SDK's codeIn automatically handles user initialization with ensureUserInitialized
        const result = await iqlabs.writer.codeIn(
          connection,
          signer,
          fullMetadata,
          Buffer.from('profile-metadata', 'utf8')
        );

        if (!result?.tailTx) throw new Error('Failed to store metadata transaction');
        const txId = result.tailTx;

        console.log('[UserProfile] Metadata stored in txID:', txId);

        // Check if this is first time setting metadata
        const metadataBefore = extractUserMetadata(await connection.getAccountInfo(userPda));

        // Update User account with txID
        const ix = iqlabs.contract.updateUserMetadataInstruction(
          builder,
          {
            user: userPk,
            user_state: userPda,
            system_program: SystemProgram.programId,
          },
          { metadata: Buffer.from(txId, 'utf8') }
        );

        await sendTx(connection, signer, ix);

        const metadataAfter = extractUserMetadata(await connection.getAccountInfo(userPda));
        const addedMetadataThisCall = !metadataBefore && !!metadataAfter;

        // Add to global_user_list if first time
        if (addedMetadataThisCall) {
          try {
            const tableSeed = Buffer.from('global_user_list', 'utf8');
            const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed, programId);
            const tableInfo = await connection.getAccountInfo(tablePda);

            // Create table if doesn't exist
            if (!tableInfo) {
              const createTableIx = iqlabs.contract.createExtTableInstruction(
                builder,
                {
                  db_root: dbRoot,
                  table: tablePda,
                  signer: userPk,
                  system_program: SystemProgram.programId,
                },
                {
                  table_seed: tableSeed,
                  column_names: [Buffer.from('pubkeyString', 'utf8')],
                  id_column: Buffer.from('pubkeyString', 'utf8'),
                }
              );
              await sendTx(connection, signer, createTableIx);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Write user row
            const rowData = JSON.stringify({ pubkeyString: userAddress });
            const writeIx = iqlabs.contract.writeRowInstruction(
              builder,
              {
                db_root: dbRoot,
                table: tablePda,
                signer: userPk,
              },
              { row_data: Buffer.from(rowData, 'utf8') }
            );
            await sendTx(connection, signer, writeIx);

            setTimeout(() => loadAllProfiles(), 1000);
          } catch (listErr) {
            console.error('[UserProfile] Error managing global_user_list:', listErr);
          }
        }

        const fullProfile: UserProfile = {
          pubkey: userAddress,
          ...profile,
          timestamp: Date.now(),
        };

        setMyProfile(fullProfile);
        return fullProfile;
      } catch (err) {
        console.error('[UserProfile] Error saving profile:', err);
        throw err;
      }
    },
    [userAddress, connection, wallet, signer, programId, dbRoot, builder, loadAllProfiles]
  );

  // Send friend request
  const handleSendFriendRequest = useCallback(
    async (targetPubkey: string) => {
      if (!userAddress || !signer) throw new Error('Wallet not connected');
      if (targetPubkey === userAddress) throw new Error('Cannot add yourself as a friend');

      const userPk = new PublicKey(userAddress);
      const targetPk = new PublicKey(targetPubkey);
      const dmSeed = iqlabs.utils.deriveDmSeed(userAddress, targetPubkey);
      const dmPda = iqlabs.contract.getConnectionTablePda(dbRoot, dmSeed, programId);

      const existing = await connection.getAccountInfo(dmPda);
      if (existing) throw new Error('Connection already exists :3');

      try {
        const ix = iqlabs.contract.requestDmInstruction(
          builder,
          {
            db_root: dbRoot,
            connection_table: dmPda,
            signer: userPk,
            target: targetPk,
            system_program: SystemProgram.programId,
          },
          {
            dm_seed: dmSeed,
            table_name: Buffer.from(DM_TABLE_NAME, 'utf8'),
            column_names: MESSAGE_COLUMNS.map(c => Buffer.from(c, 'utf8')),
            id_column: Buffer.from('id', 'utf8'),
          }
        );
        await sendTx(connection, signer, ix);
      } catch (err) {
        console.error('[UserProfileManager] requestDm error', err);
        throw err;
      }
    },
    [connection, userAddress, signer, dbRoot, programId, builder]
  );

  useEffect(() => {
    if (userAddress) {
      loadMyProfile();
      loadAllProfiles();
    }
  }, [userAddress, loadMyProfile, loadAllProfiles]);

  const handleLogin = () => {
    if (ready && !authenticated) login();
  };

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-green-400 text-xl">Loading...</div>
      </div>
    );
  }

  if (!authenticated || !userAddress) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-green-400 mb-4">User Profiles</h1>
          <p className="text-white/60 mb-6">Connect your wallet to create and view profiles</p>
          <button
            onClick={handleLogin}
            className="px-6 py-3 bg-green-500 text-black font-bold rounded hover:bg-green-400 transition"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-green-400 mb-2">User Profiles</h1>
        <p className="text-white/60">
          Zo&#39;s Vision: Onchain user profiles with metadata stored in User accounts
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded text-red-400">
          {error}
        </div>
      )}

      <div className="flex gap-4 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab('my-profile')}
          className={`px-6 py-3 font-bold transition ${
            activeTab === 'my-profile'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          MY PROFILE
        </button>
        <button
          onClick={() => setActiveTab('all-users')}
          className={`px-6 py-3 font-bold transition ${
            activeTab === 'all-users'
              ? 'text-green-400 border-b-2 border-green-400'
              : 'text-white/60 hover:text-white/80'
          }`}
        >
          ALL USERS ({allProfiles.length})
        </button>
      </div>

      <div className="mt-6">
        {activeTab === 'my-profile' && (
          <ProfileEditor profile={myProfile} onSave={saveProfile} loading={loading} />
        )}
        {activeTab === 'all-users' && (
          <UserList
            profiles={allProfiles}
            loading={loading}
            currentUser={userAddress}
            onSendFriendRequest={handleSendFriendRequest}
          />
        )}
      </div>

      <div className="mt-12 p-6 bg-green-900/10 border border-green-700/30 rounded-lg">
        <h3 className="text-green-400 font-bold mb-2">About This Feature - Zo's New User Account System</h3>
        <p className="text-white/70 text-sm mb-2">
          User profiles are now stored in dedicated User accounts with automatic initialization:
        </p>
        <code className="block bg-black/40 p-3 rounded text-xs text-green-300 overflow-x-auto mb-2">
          {`updateUserMetadata(metadata) → Creates/updates User account`}
        </code>
        <p className="text-white/70 text-sm mb-2">
          User account structure (seeds: ["solchat-user", programId, root, user]):
        </p>
        <code className="block bg-black/40 p-3 rounded text-xs text-green-300 overflow-x-auto mb-3">
          {`{
  owner: Pubkey,
  data: Vec<u8>,
  metadata: Vec<u8> // JSON: {name, bio, profilePicture}
}`}
        </code>
        <p className="text-white/70 text-sm mb-3">
          The metadata field stores your profile JSON. With <code className="text-green-400">init_if_needed</code>, your User account is created automatically when you save your profile!
        </p>
        <div className="border-t border-green-700/30 pt-3 mt-3">
          <h4 className="text-green-400 font-bold text-sm mb-2">Zo's Anti-Spam System</h4>
          <p className="text-white/70 text-sm">
            Users are only added to the "All Users" list when they set their nickname for the <span className="text-green-400">first time</span>.
            The system checks if metadata exists before adding you to the global_user_list admin table. This prevents spam and duplicate entries!
          </p>
        </div>
      </div>
    </div>
  );
}
