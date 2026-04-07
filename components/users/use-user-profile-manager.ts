import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { PublicKey, SystemProgram, type Signer } from '@solana/web3.js';
import { Buffer } from 'buffer';

import iqlabs from 'iqlabs-sdk';
import { readTableRows as gatewayReadTableRows, getUserProfile } from '@/lib/gateway/reader';
import { IQ_IDL } from 'iqlabs-sdk/contract';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { sendAndConfirmTx } from '@/lib/utils/send-and-confirm';
import { ROOT_ID } from '@/lib/iqlabs/constants';
import { requestDmConnection } from '@/lib/friends/request-connection';
import type { UserProfile } from './types';
import { extractUserMetadata } from './profile-helpers';
import { getOrDeriveKeypair } from '@/lib/crypto/dm-encryption';

export function useUserProfileManager() {
  const { connection, readConnection } = useAppConnection();
  const wallet = useAppWallet();
  const userAddress = wallet?.publicKey?.toBase58();

  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const programId = useMemo(() => iqlabs.contract.PROGRAM_ID, []);
  const dbRootId = useMemo(() => iqlabs.utils.toSeedBytes(ROOT_ID), []);
  const dbRoot = useMemo(() => iqlabs.contract.getDbRootPda(dbRootId, programId), [dbRootId, programId]);
  const builder = useMemo(() => iqlabs.contract.createInstructionBuilder(IQ_IDL, programId), [programId]);

  const signer = useMemo<SignerInput | null>(() => {
    if (!wallet?.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    return {
      publicKey: wallet.publicKey,
      signTransaction: wallet.signTransaction.bind(wallet),
      signAllTransactions: wallet.signAllTransactions.bind(wallet),
    } as SignerInput;
  }, [wallet]);

  const ensureDbRootInitialized = useCallback(async (signerPublicKey: PublicKey) => {
    if (!signer) throw new Error('Wallet not connected');
    const rootInfo = await readConnection.getAccountInfo(dbRoot);
    if (rootInfo) return;
    try {
      const initRootIx = iqlabs.contract.initializeDbRootInstruction(
        builder,
        {
          db_root: dbRoot,
          signer: signerPublicKey,
          system_program: SystemProgram.programId,
        },
        { db_root_id: dbRootId }
      );
      await sendAndConfirmTx(connection, readConnection, signer, initRootIx);
    } catch (initErr) {
      if (
        !(
          initErr instanceof Error &&
          (initErr.message.includes('already in use') || initErr.message.includes('AlreadyInUse'))
        )
      ) {
        throw initErr;
      }
    }
  }, [builder, connection, readConnection, dbRoot, dbRootId, signer]);

  const loadMyProfile = useCallback(async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);
    try {
      const profile = await getUserProfile(userAddress);
      setMyProfile({
        pubkey: userAddress,
        name: profile?.name || '',
        bio: profile?.bio || '',
        profilePicture: profile?.profilePicture || '',
        timestamp: Date.now(),
      });
    } catch (err) {
      console.error('[UserProfile] Error loading profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }, [userAddress]);

  const loadAllProfiles = useCallback(async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);
    try {
      const tableSeed = iqlabs.utils.toSeedBytes('global_user_list');
      const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed, programId);
      const tableInfo = await readConnection.getAccountInfo(tablePda);

      if (!tableInfo) {
        setAllProfiles([]);
        return;
      }

      const rows = await gatewayReadTableRows(tablePda.toBase58());

      const userPubkeys: string[] = [];
      for (const row of rows) {
        const pubkeyStr = (row as { pubkeyString?: string; pubkey?: string }).pubkeyString
          || (row as { pubkeyString?: string; pubkey?: string }).pubkey;
        if (pubkeyStr) userPubkeys.push(pubkeyStr);
      }

      if (userPubkeys.length === 0) {
        setAllProfiles([]);
        return;
      }

      // Fetch all profiles in parallel (getUserProfile handles gateway + fallback)
      const results = await Promise.allSettled(
        userPubkeys.map(async (pubkey) => {
          const profile = await getUserProfile(pubkey);
          return {
            pubkey,
            name: profile?.name || '',
            bio: profile?.bio || '',
            profilePicture: profile?.profilePicture || '',
            timestamp: Date.now(),
          } as UserProfile;
        })
      );
      const profiles: UserProfile[] = results
        .filter((r): r is PromiseFulfilledResult<UserProfile> => r.status === 'fulfilled')
        .map(r => r.value);

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
  }, [readConnection, userAddress, dbRoot, programId]);

  const saveProfile = useCallback(
    async (profile: Omit<UserProfile, 'pubkey'>) => {
      if (!userAddress || !signer) throw new Error('Wallet not connected');

      setError(null);
      try {
        const userPk = new PublicKey(userAddress);
        const userPda = iqlabs.contract.getUserPda(userPk, programId);

        // Derive encryption pubkey if wallet supports signMessage
        let encryptionPubKey: string | undefined;
        if (wallet.signMessage) {
          try {
            const kp = await getOrDeriveKeypair(wallet.signMessage);
            encryptionPubKey = kp.pubHex;
          } catch (err) {
            console.warn('[UserProfile] Could not derive encryption key:', err);
          }
        }

        const fullMetadata = JSON.stringify({
          name: profile.name,
          bio: profile.bio,
          profilePicture: profile.profilePicture,
          ...(encryptionPubKey ? { encryptionPubKey } : {}),
        });

        console.log('[UserProfile] Storing metadata with iqlabs.writer.codeIn...');

        const txId = await iqlabs.writer.codeIn(
          { connection, signer: signer as any },
          [fullMetadata],
          'profile-metadata',
          0,
        );

        if (!txId) throw new Error('Failed to store metadata transaction');

        console.log('[UserProfile] Metadata stored in txID:', txId);

        await ensureDbRootInitialized(userPk);

        const metadataBefore = extractUserMetadata(await readConnection.getAccountInfo(userPda));

        await iqlabs.writer.updateUserMetadata(
          connection,
          signer as any,
          dbRootId,
          txId,
        );

        const metadataAfter = extractUserMetadata(await readConnection.getAccountInfo(userPda));
        const addedMetadataThisCall = !metadataBefore && !!metadataAfter;

        if (addedMetadataThisCall) {
          try {
            const tableSeed = iqlabs.utils.toSeedBytes('global_user_list');
            const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed, programId);
            const tableInfo = await readConnection.getAccountInfo(tablePda);

            if (!tableInfo) {
              const instructionTable = iqlabs.contract.getInstructionTablePda(
                dbRoot,
                tableSeed,
                programId
              );
              const createTableIx = iqlabs.contract.createExtTableInstruction(
                builder,
                {
                  db_root: dbRoot,
                  table: tablePda,
                  instruction_table: instructionTable,
                  signer: userPk,
                  system_program: SystemProgram.programId,
                },
                {
                  db_root_id: dbRootId,
                  table_seed: tableSeed,
                  table_name: tableSeed,
                  column_names: [Buffer.from('pubkeyString', 'utf8')],
                  id_col: Buffer.from('pubkeyString', 'utf8'),
                  ext_keys: [],
                  table_hint: tableSeed,
                  gate_opt: null,
                  writers_opt: null,
                }
              );
              await sendAndConfirmTx(connection, readConnection, signer, createTableIx);
              await new Promise(resolve => setTimeout(resolve, 2000));
            }

            const rowData = JSON.stringify({ pubkeyString: userAddress });
            await iqlabs.writer.writeRow(
              connection,
              signer as Signer,
              dbRootId,
              tableSeed,
              rowData
            );

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
    [
      userAddress,
      connection,
      readConnection,
      signer,
      programId,
      dbRoot,
      dbRootId,
      builder,
      ensureDbRootInitialized,
      loadAllProfiles,
      wallet.signMessage,
    ]
  );

  const handleSendFriendRequest = useCallback(
    async (targetPubkey: string) => {
      if (!userAddress || !signer) throw new Error('Wallet not connected');
      if (targetPubkey === userAddress) throw new Error('Cannot add yourself as a friend');

      await ensureDbRootInitialized(signer.publicKey);

      const dmSeed = iqlabs.utils.deriveDmSeed(userAddress, targetPubkey);
      const dmPda = iqlabs.contract.getConnectionTablePda(dbRoot, dmSeed, programId);

      const existing = await readConnection.getAccountInfo(dmPda);
      if (existing) throw new Error('Connection already exists :3');

      try {
        await requestDmConnection(connection, signer, ROOT_ID, userAddress, targetPubkey.trim());
      } catch (err) {
        console.error('[UserProfileManager] requestDm error', err);
        throw err;
      }
    },
    [connection, readConnection, userAddress, signer, dbRoot, dbRootId, programId, builder, ensureDbRootInitialized]
  );

  useEffect(() => {
    if (userAddress) {
      loadMyProfile();
      loadAllProfiles();
    }
  }, [userAddress, loadMyProfile, loadAllProfiles]);

  return {
    userAddress,
    myProfile,
    allProfiles,
    loading,
    error,
    saveProfile,
    handleSendFriendRequest,
  };
}
