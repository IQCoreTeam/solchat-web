import { useCallback, useEffect, useState } from 'react';
import type { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk/src';
import type { SignerInput } from 'iqlabs-sdk/src/sdk/utils/wallet';
import { sendTx } from 'iqlabs-sdk/src/sdk/writer/writer_utils';
import { getCachedAccountInfo } from '@/lib/rpc/cache';
import type { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';

export type RootStatus = 'checking' | 'missing' | 'creating' | 'ready' | 'error';

type UseRootAccountOptions = {
  connection: Connection;
  rootPubkey: PublicKey;
  isUserInitialized: boolean;
  isUserInitializing: boolean;
  builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
  dbRootId: Buffer;
  signer: SignerInput | null;
  runWithRpcRateLimit: typeof runWithRpcRateLimit;
};

export function useRootAccount({
  connection,
  rootPubkey,
  isUserInitialized,
  isUserInitializing,
  builder,
  dbRootId,
  signer,
  runWithRpcRateLimit,
}: UseRootAccountOptions) {
  const [rootStatus, setRootStatus] = useState<RootStatus>('checking');
  const [rootAccount, setRootAccount] = useState<AccountInfo<Buffer> | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const acc = await getCachedAccountInfo(connection, rootPubkey);
        if (!mounted) return;
        if (acc) {
          setRootStatus('ready');
          setRootAccount(acc);
        } else {
          setRootStatus('missing');
        }
      } catch (err) {
        if (!mounted) return;
        console.error('[ChatClient] Failed to check root:', err);
        setRootStatus('error');
        setRootError(err instanceof Error ? err.message : 'Unknown error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [connection, rootPubkey, isUserInitialized, isUserInitializing]);

  const handleCreateRoot = useCallback(async () => {
    if (!signer) return;
    setRootStatus('creating');
    try {
      const ix = iqlabs.contract.initializeDbRootInstruction(
        builder,
        {
          db_root: rootPubkey,
          signer: signer.publicKey,
          system_program: SystemProgram.programId,
        },
        { db_root_id: dbRootId }
      );
      await sendTx(connection, signer, ix);
      const acc = await runWithRpcRateLimit(
        () => connection.getAccountInfo(rootPubkey),
        { endpoint: connection.rpcEndpoint }
      );
      setRootAccount(acc);
      setRootStatus('ready');
    } catch (err) {
      console.error('[ChatClient]Create root error:', err);
      setRootStatus('error');
      setRootError(err instanceof Error ? err.message : 'Failed to create root');
    }
  }, [signer, builder, connection, rootPubkey, dbRootId, runWithRpcRateLimit]);

  return {
    rootStatus,
    rootAccount,
    rootError,
    handleCreateRoot,
  };
}
