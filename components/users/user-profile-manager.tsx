/**
 * User Profile Manager Component - Zo's Vision
 * Uses the new User account system with onchain metadata
 * - My Profile: Set name, bio, profile pic using updateUserMetadata
 * - All Users: Fetch all user pubkeys from admin table, then fetch each User account's metadata
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { usePrivy } from '@privy-io/react-auth';
import { ProfileEditor } from './profile-editor';
import { UserList } from './user-list';
import { updateUserMetadataWeb, pdaUser, pdaRoot, pdaTable, createExtTableWeb, writeRowWeb, readRowsByTable } from '@/lib/onchainDB';
import { getAnchorProvider, getProgram, type WalletAdapterLike } from '@/lib/onchainDB/web/provider';
import idl from '@/lib/onchainDB/idl.json';
import type { Idl } from '@coral-xyz/anchor';
import { ROOT_ID } from '@/lib/onchainDB/constants';
import { PublicKey } from '@solana/web3.js';
import { sendAndConfirmTx } from '@/lib/onchainDB/utils/transaction-helpers';
import type { AccountInfo } from '@solana/web3.js';
import type { WriterCtx } from '@/lib/onchainDB/web/writer';
import {codeInWithonlyTailTx, initializeUser, WalletExecutor} from '@/lib/iq/transaction';
import { reconstructMessageFromChainForTailTx } from '@/lib/iq/reader';
import {getDBPDA} from "@/lib/iq";

export interface UserProfile {
  pubkey: string;
  name: string;
  bio: string;
  profilePicture: string;
  timestamp?: number;
}

export function UserProfileManager() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const writerWallet = useMemo<WalletAdapterLike | null>(() => {
    if (!wallet?.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
      return null;
    }
    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: wallet.signAllTransactions.bind(wallet),
    };
  }, [wallet]);
  const { ready, authenticated, login } = usePrivy();
  const userAddress = wallet?.publicKey?.toBase58();

  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'my-profile' | 'all-users'>('my-profile');

  // Load user's profile from their User account
  const loadMyProfile = useCallback(async () => {
    if (!userAddress || !connection) return;

    setLoading(true);
    setError(null);
    try {
      const userPk = new PublicKey(userAddress);
      const rootPk = pdaRoot(ROOT_ID);
      const userAccount = pdaUser(rootPk, userPk);

      console.log('[UserProfile] Fetching User account:', userAccount.toBase58());

      // Fetch the User account
      const accountInfo = await connection.getAccountInfo(userAccount);

      if (accountInfo && accountInfo.data) {
        // Parse the User account data
        // User struct: { owner: Pubkey (32), data: Vec<u8> (4 + len), metadata: Vec<u8> (4 + len) }
        const data = Buffer.from(accountInfo.data);

        // Skip discriminator (8 bytes)
        let offset = 8;

        // Skip owner (32 bytes)
        offset += 32;

        // Skip data Vec (4 bytes length + data)
        const dataLen = data.readUInt32LE(offset);
        offset += 4 + dataLen;

        // Read metadata Vec
        const metadataLen = data.readUInt32LE(offset);
        offset += 4;
        const metadataBytes = data.slice(offset, offset + metadataLen);
        const metadata: string = metadataBytes.toString('utf8');

        console.log('[UserProfile] Raw metadata:', metadata);

        if (typeof metadata === 'string' && metadata.length > 2) {
          const metadataStr = metadata ?? "";
          try {
            // Zo's system: Check if metadata is a transaction ID
            // Transaction IDs are typically 88-90 chars, alphanumeric (base58)
            let profileData;

            if (metadataStr.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadataStr)) {
              // Looks like a transaction ID, reconstruct the original JSON
              console.log('[UserProfile] Metadata is txID, reconstructing from chain...');
              const reconstructed = await reconstructMessageFromChainForTailTx(
                connection,
                String(metadataStr ?? '')
              );

              if (!reconstructed || reconstructed.startsWith('[unable')) {
                throw new Error('Failed to reconstruct metadata from transaction');
              }

              console.log('[UserProfile] Reconstructed metadata:', reconstructed);
              profileData = JSON.parse(reconstructed);
            } else {
              // Direct JSON metadata (backwards compatibility)
              console.log('[UserProfile] Metadata is direct JSON');
              profileData = JSON.parse(metadataStr);
            }

            setMyProfile({
              pubkey: userAddress,
              name: profileData.name || '',
              bio: profileData.bio || '',
              profilePicture: profileData.profilePicture || '',
              timestamp: Date.now(),
            });
            console.log('[UserProfile] Loaded profile from User account');
          } catch (parseErr) {
            console.error('[UserProfile] Failed to parse metadata:', parseErr);
            setMyProfile({
              pubkey: userAddress,
              name: '',
              bio: '',
              profilePicture: '',
              timestamp: Date.now(),
            });
          }
        } else {
          console.log('[UserProfile] No metadata found');
          setMyProfile({
            pubkey: userAddress,
            name: '',
            bio: '',
            profilePicture: '',
            timestamp: Date.now(),
          });
        }
      } else {
        console.log('[UserProfile] User account not found (not initialized yet)');
        setMyProfile(null);
      }
    } catch (err) {
      console.error('[UserProfile] Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userAddress, connection]);

  // Load all user profiles from global_user_list admin table
  const loadAllProfiles = useCallback(async () => {
    if (!connection) return;

    setLoading(true);
    setError(null);
    try {
      console.log('[UserProfile] Fetching global_user_list admin table...');

      // Fetch all rows from global_user_list table
      if (!userAddress) {
        setAllProfiles([]);
        return;
      }
      const rows = await readRowsByTable({
        connection,
        rootId: ROOT_ID,
        userPublicKey: userAddress,
        tableName: 'global_user_list',
        idl: idl as any,
      });

      console.log('[UserProfile] Found', rows.length, 'users in global_user_list');

      const rootPk = pdaRoot(ROOT_ID);
      const profiles: UserProfile[] = [];

      // For each row, extract the pubkey and fetch their User account
      for (const row of rows) {
        try {
          // Row is already parsed by readRowsByTable
          const pubkeyString = (row as any).pubkeyString || (row as any).pubkey;

          if (!pubkeyString) {
            console.warn('[UserProfile] No pubkeyString found in row:', row);
            continue;
          }

          console.log('[UserProfile] Fetching User account for:', pubkeyString.slice(0, 8) + '...');

          const userPk = new PublicKey(pubkeyString);
          const userAccount = pdaUser(rootPk, userPk);

          // Fetch the User account
          const accountInfo = await connection.getAccountInfo(userAccount);

          const metadata: string = extractUserMetadataString(accountInfo);
          if (typeof metadata === 'string' && metadata.length > 2) {
            const metadataStr = metadata ?? "";
            try {
              const profileData =
                metadataStr.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadataStr)
                  ? JSON.parse(
                      await reconstructMessageFromChainForTailTx(connection, metadataStr) as string
                    )
                  : JSON.parse(metadataStr);

              profiles.push({
                pubkey: pubkeyString,
                name: profileData.name || '',
                bio: profileData.bio || '',
                profilePicture: profileData.profilePicture || '',
                timestamp: Date.now(),
              });
            } catch (parseErr) {
              console.error('[UserProfile] Failed to parse metadata for', pubkeyString, parseErr);
              profiles.push({
                pubkey: pubkeyString,
                name: '',
                bio: '',
                profilePicture: '',
                timestamp: Date.now(),
              });
            }
          }
        } catch (err) {
          console.error('[UserProfile] Error fetching user:', err);
        }
      }

      const uniqueProfiles = Array.from(
        new Map(profiles.map((profile) => [profile.pubkey, profile])).values()
      );
      console.log('[UserProfile] Loaded', uniqueProfiles.length, 'unique user profiles');
      setAllProfiles(uniqueProfiles);
    } catch (err) {
      console.error('[UserProfile] Error loading profiles:', err);
      // If table doesn't exist yet, just show empty list
      if (err instanceof Error && err.message.includes('Account does not exist')) {
        console.log('[UserProfile] Userlist table not created yet');
        setAllProfiles([]);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load profiles');
      }
    } finally {
      setLoading(false);
    }
  }, [connection, userAddress]);

  // Save user profile using updateUserMetadata
  const saveProfile = useCallback(async (profile: Omit<UserProfile, 'pubkey'>) => {
    if (!userAddress || !connection || !wallet) {
      throw new Error('Wallet not connected');
    }

    setError(null);
    try {
      const rootPk = pdaRoot(ROOT_ID);
      const userPk = new PublicKey(userAddress);
      const userPda = pdaUser(rootPk, userPk);

      // Prepare full metadata JSON (can be up to 1MB!)
      const fullMetadata = JSON.stringify({
        name: profile.name,
        bio: profile.bio,
        profilePicture: profile.profilePicture,
      });

      console.log('[UserProfile] Storing metadata with codeInWithonlyTailTx...');
      console.log('[UserProfile] Metadata size:', fullMetadata.length, 'bytes');
      console.log('[UserProfile] Metadata content:', fullMetadata);

      const DBPDA = await getDBPDA(userAddress);
      const isUserHaveIQPDA = await connection.getAccountInfo(new PublicKey(DBPDA));
      if (!isUserHaveIQPDA) {
        console.log('[UserProfile] Creating IQPDA for user...');
          const signingWallet: WalletExecutor = {
              publicKey: wallet.publicKey!,
              signTransaction: wallet.signTransaction ?? undefined,
              sendTransaction: wallet.sendTransaction ?? undefined,
          };
        const createIQPDA = await initializeUser(connection,signingWallet);
        console.log('[UserProfile] IQPDA created:', createIQPDA);
      }
      // Zo's system: Store full metadata as transaction, get txID (90 bytes)
      const txId = await codeInWithonlyTailTx(
        connection,
        wallet as any,
        fullMetadata,
        'profile-metadata',
        userAddress
      );

      if (!txId) {
        throw new Error('Failed to store metadata transaction - no txID returned');
      }

      console.log('[UserProfile] Metadata stored in txID:', txId);
      console.log('[UserProfile] txID length:', txId.length);
      console.log('[UserProfile] Saving txID with updateUserMetadata...');

      // Snapshot before updating
      const metadataBefore = extractUserMetadataString(await connection.getAccountInfo(userPda));

      // Create writer context
      if (!writerWallet) {
        throw new Error('Wallet not connected');
      }
      const writerCtx: WriterCtx = {
        wallet: writerWallet,
        connection,
        idl: idl as Idl,
      };

      // Save the txID (90 bytes) in User account
      const { tx } = await updateUserMetadataWeb(writerCtx, ROOT_ID, txId);

      // Send transaction
      await sendAndConfirmTx(connection, wallet, tx, '[UserProfile] Profile saved!');

      const userAccountAfter = await connection.getAccountInfo(userPda);
      const metadataAfter = extractUserMetadataString(userAccountAfter);

      const addedMetadataThisCall = !metadataBefore && !!metadataAfter;

      if (addedMetadataThisCall) {
         // alert('added metadata in this call!');
        try {
          console.log('[UserProfile] Adding user to global_user_list table...');

          // Check if global_user_list table exists by checking the account directly
          const tablePk = pdaTable(rootPk, 'global_user_list');
          const tableAccount = await connection.getAccountInfo(tablePk);

          if (!tableAccount) {
            // Create global_user_list table if it doesn't exist
            console.log('[UserProfile] Creating global_user_list admin table...');
            const { tx: createTableTx } = await createExtTableWeb(
              writerCtx,
              ROOT_ID,
              'global_user_list',
              ['pubkeyString'],
              { idColumn: 'pubkeyString' }
            );

            const tableSig = await sendAndConfirmTx(connection, wallet, createTableTx, '[UserProfile] global_user_list table created:');
            // Wait a bit for the table to be fully initialized
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.log('[UserProfile] global_user_list table already exists');
          }

          // Add user pubkey to global_user_list
          const globalUserListRow = JSON.stringify({
            pubkeyString: userAddress,
          });

          const { tx: rowTx } = await writeRowWeb(writerCtx, ROOT_ID, 'global_user_list', globalUserListRow);

          const rowSig = await sendAndConfirmTx(connection, wallet, rowTx, '[UserProfile] User added to global_user_list! Signature:');
          setTimeout(() => loadAllProfiles(), 1000);
        } catch (listErr) {
          console.error('[UserProfile] Error managing global_user_list:', listErr);
          // Don't fail the whole operation if global_user_list update fails
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
  }, [userAddress, connection, wallet, loadAllProfiles]);

  useEffect(() => {
    if (userAddress) {
      loadMyProfile();
      loadAllProfiles();
    }
  }, [userAddress, loadMyProfile, loadAllProfiles]);

  // Handle login
  const handleLogin = () => {
    if (ready && !authenticated) {
      login();
    }
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-green-400 mb-2">User Profiles</h1>
        <p className="text-white/60">
          Zo&#39;s Vision: Onchain user profiles with metadata stored in User accounts
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-900/30 border border-red-500 rounded text-red-400">
          {error}
        </div>
      )}

      {/* Tabs */}
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

      {/* Content */}
      <div className="mt-6">
        {activeTab === 'my-profile' && (
          <ProfileEditor
            profile={myProfile}
            onSave={saveProfile}
            loading={loading}
          />
        )}
        {activeTab === 'all-users' && (
          <UserList
            profiles={allProfiles}
            loading={loading}
            currentUser={userAddress}
          />
        )}
      </div>

      {/* Info Box */}
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

function extractUserMetadataString(info?: AccountInfo<Buffer> | null): string {
  if (!info || !info.data) return ''
  try {
    const data = Buffer.from(info.data)
    let offset = 8 // discriminator
    offset += 32 // owner
    if (offset + 4 > data.length) return ''
    const dataLen = data.readUInt32LE(offset)
    offset += 4 + dataLen
    if (offset + 4 > data.length) return ''
    const metadataLen = data.readUInt32LE(offset)
    offset += 4
    if (metadataLen <= 0 || offset + metadataLen > data.length) return ''
    const metadataBytes = data.slice(offset, offset + metadataLen)
    const metadata = metadataBytes.toString('utf8').trim()
    return metadata.length > 0 ? metadata : ''
  } catch {
    return ''
  }
}
