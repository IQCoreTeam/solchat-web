import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { getCachedAccountInfo } from '@/lib/rpc/cache';
import { PublicKey, SystemProgram, type AccountInfo, type Signer } from '@solana/web3.js';
import { Buffer } from 'buffer';
import type { Idl } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk';
import idl from 'iqlabs-sdk/idl/code_in.json';
import type { SignerInput } from 'iqlabs-sdk/dist/sdk/utils/wallet';
import { sendTx } from 'iqlabs-sdk/dist/sdk/writer/writer_utils';
import { ROOT_ID, MESSAGE_COLUMNS, DM_TABLE_NAME } from '@/lib/iqlabs/constants';
import { buildRequestConnectionInstruction } from '@/lib/friends/request-connection';
import type { UserProfile } from './types';

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

async function parseMetadata(
  connection: ReturnType<typeof useAppConnection>['connection'],
  metadataStr: string
): Promise<{ name: string; bio: string; profilePicture: string } | null> {
  if (!metadataStr || metadataStr.length <= 2) return null;

  try {
    if (metadataStr.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadataStr)) {
      const result = await iqlabs.reader.readCodeIn(metadataStr);
      if (!result?.data || result.data.startsWith('[unable')) return null;
      return JSON.parse(result.data);
    }
    return JSON.parse(metadataStr);
  } catch {
    return null;
  }
}

export function useUserProfileManager() {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();
  const userAddress = wallet?.publicKey?.toBase58();

  const [myProfile, setMyProfile] = useState<UserProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const ensureDbRootInitialized = useCallback(async (signerPublicKey: PublicKey) => {
    if (!signer) throw new Error('Wallet not connected');
    const rootInfo = await connection.getAccountInfo(dbRoot);
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
      await sendTx(connection, signer, initRootIx);
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
  }, [builder, connection, dbRoot, dbRootId, signer]);

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

  const loadAllProfiles = useCallback(async () => {
    if (!userAddress) return;

    setLoading(true);
    setError(null);
    try {
      const tableSeed = Buffer.from('global_user_list', 'utf8');
      const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed, programId);
      const tableInfo = await connection.getAccountInfo(tablePda);

      if (!tableInfo) {
        setAllProfiles([]);
        return;
      }

      const rows = await iqlabs.reader.readTableRows(tablePda);

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

      const userPdas = userPubkeys.map(pk => iqlabs.contract.getUserPda(new PublicKey(pk), programId));
      const accountInfos = await connection.getMultipleAccountsInfo(userPdas);

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

  const saveProfile = useCallback(
    async (profile: Omit<UserProfile, 'pubkey'>) => {
      if (!userAddress || !signer) throw new Error('Wallet not connected');

      setError(null);
      try {
        const userPk = new PublicKey(userAddress);
        const userPda = iqlabs.contract.getUserPda(userPk, programId);

        const fullMetadata = JSON.stringify({
          name: profile.name,
          bio: profile.bio,
          profilePicture: profile.profilePicture,
        });

        console.log('[UserProfile] Storing metadata with iqlabs.writer.codeIn...');

        const txId = await iqlabs.writer.codeIn(
          { connection, signer },
          [fullMetadata],
          undefined,
          'profile-metadata'
        );

        if (!txId) throw new Error('Failed to store metadata transaction');

        console.log('[UserProfile] Metadata stored in txID:', txId);

        await ensureDbRootInitialized(userPk);

        const metadataBefore = extractUserMetadata(await connection.getAccountInfo(userPda));

        await iqlabs.writer.updateUserMetadata(
          connection,
          signer,
          dbRootId,
          txId,
        );

        const metadataAfter = extractUserMetadata(await connection.getAccountInfo(userPda));
        const addedMetadataThisCall = !metadataBefore && !!metadataAfter;

        if (addedMetadataThisCall) {
          try {
            const tableSeed = Buffer.from('global_user_list', 'utf8');
            const tablePda = iqlabs.contract.getTablePda(dbRoot, tableSeed, programId);
            const tableInfo = await connection.getAccountInfo(tablePda);

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
                  gate_mint_opt: null,
                  writers_opt: null,
                }
              );
              await sendTx(connection, signer, createTableIx);
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
      signer,
      programId,
      dbRoot,
      dbRootId,
      builder,
      ensureDbRootInitialized,
      loadAllProfiles,
    ]
  );

  const handleSendFriendRequest = useCallback(
    async (targetPubkey: string) => {
      if (!userAddress || !signer) throw new Error('Wallet not connected');
      if (targetPubkey === userAddress) throw new Error('Cannot add yourself as a friend');

      await ensureDbRootInitialized(signer.publicKey);

      const dmSeed = iqlabs.utils.deriveDmSeed(userAddress, targetPubkey);
      const dmPda = iqlabs.contract.getConnectionTablePda(dbRoot, dmSeed, programId);

      const existing = await connection.getAccountInfo(dmPda);
      if (existing) throw new Error('Connection already exists :3');

      try {
        const receiver = new PublicKey(targetPubkey.trim());
        const { ix } = buildRequestConnectionInstruction({
          builder,
          dbRootId,
          programId,
          requester: signer.publicKey,
          receiver,
          tableName: DM_TABLE_NAME,
          columns: MESSAGE_COLUMNS,
          idCol: 'id',
        });
        await sendTx(connection, signer, ix);
      } catch (err) {
        console.error('[UserProfileManager] requestDm error', err);
        throw err;
      }
    },
    [connection, userAddress, signer, dbRoot, dbRootId, programId, builder, ensureDbRootInitialized]
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
