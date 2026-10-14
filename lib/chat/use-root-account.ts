import { useCallback, useEffect, useState } from 'react';
import type { AccountInfo, Connection, PublicKey } from '@solana/web3.js';
import { SystemProgram } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { sendTx } from '@/lib/iqlabs/send-tx';

export type RootStatus = 'checking' | 'missing' | 'creating' | 'ready' | 'error';

type UseRootAccountOptions = {
  connection: Connection;
  readConnection: Connection;
  rootPubkey: PublicKey;
  isUserInitialized: boolean;
  isUserInitializing: boolean;
  builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>;
  dbRootId: Buffer;
  signer: SignerInput | null;
};

export function useRootAccount({
  connection,
  readConnection,
  rootPubkey,
  isUserInitialized,
  isUserInitializing,
  builder,
  dbRootId,
  signer,
}: UseRootAccountOptions) {
  const [rootStatus, setRootStatus] = useState<RootStatus>('checking');
  const [rootAccount, setRootAccount] = useState<AccountInfo<Buffer> | null>(null);
  const [rootError, setRootError] = useState<string | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      // Let Strict Mode's setup/cleanup pass cancel before starting a duplicate RPC read.
      await Promise.resolve();
      if (!mounted) return;
      setRootStatus('checking');
      setRootError(null);
      setRootAccount(null);
      try {
        const acc = await readConnection.getAccountInfo(rootPubkey);
        if (!mounted) return;
        if (acc) {
          setRootStatus('ready');
          setRootAccount(acc);
        } else {
          setRootStatus('missing');
        }
      } catch (err) {
        if (!mounted) return;
        console.error('[useRootAccount] Failed to check root:', err);
        setRootStatus('error');
        setRootError(err instanceof Error ? err.message : 'Unknown error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [readConnection, rootPubkey, isUserInitialized, isUserInitializing, readAttempt]);

  const retryRoot = useCallback(() => setReadAttempt((attempt) => attempt + 1), []);

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
      const acc = await readConnection.getAccountInfo(rootPubkey);
      setRootAccount(acc);
      setRootStatus('ready');
    } catch (err) {
      console.error('[useRootAccount] Create root error:', err);
      setRootStatus('error');
      setRootError(err instanceof Error ? err.message : 'Failed to create root');
    }
  }, [signer, builder, connection, readConnection, rootPubkey, dbRootId]);

  return {
    rootStatus,
    rootAccount,
    rootError,
    retryRoot,
    handleCreateRoot,
  };
}
