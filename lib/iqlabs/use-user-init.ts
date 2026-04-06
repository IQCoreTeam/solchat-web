'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SystemProgram } from '@solana/web3.js';
import { Buffer } from 'buffer';
import iqlabs from 'iqlabs-sdk';
import { sendTx, ensureUserInitialized, type SignerInput } from '@/lib/iqlabs/send-tx';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { ROOT_ID } from '@/lib/iqlabs/constants';

const toRootBytes = (value: string | Uint8Array) =>
  value instanceof Uint8Array ? value : Buffer.from(value, 'utf8');

export function useUserInit(rootIdOverride?: string | Uint8Array) {
  const { connection } = useAppConnection();
  const appWallet = useAppWallet();
  const { publicKey, connected, signTransaction, signAllTransactions } = appWallet;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const resolvedRootId = rootIdOverride ?? ROOT_ID;
  const dbRootId = useMemo(() => toRootBytes(resolvedRootId), [resolvedRootId]);
  const builder = useMemo(
    () => iqlabs.contract.createInstructionBuilder(),
    []
  );
  const rootPda = useMemo(
    () => iqlabs.contract.getDbRootPda(dbRootId),
    [dbRootId]
  );

  const publicKeyRef = useRef(publicKey);
  const signerRef = useRef<SignerInput | null>(null);

  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  useEffect(() => {
    if (!publicKey || !signTransaction || !signAllTransactions) {
      signerRef.current = null;
      return;
    }
    signerRef.current = {
      publicKey,
      signTransaction,
      signAllTransactions,
    } as SignerInput;
  }, [publicKey, signTransaction, signAllTransactions]);

  const checkAndInitialize = useCallback(async () => {
    const currentPublicKey = publicKeyRef.current;
    const signer = signerRef.current;

    if (!currentPublicKey || !connected || !signer) {
      setIsInitialized(false);
      return;
    }

    try {
      setIsInitializing(true);
      setError(null);

      const rootInfo = await connection.getAccountInfo(rootPda);
      if (!rootInfo) {
        const ix = iqlabs.contract.initializeDbRootInstruction(
          builder,
          {
            db_root: rootPda,
            signer: currentPublicKey,
            system_program: SystemProgram.programId,
          },
          { db_root_id: dbRootId }
        );
        await sendTx(connection, signer, ix);
      }

      const user = currentPublicKey;
      const userState = iqlabs.contract.getUserPda(user);
      const codeAccount = iqlabs.contract.getCodeAccountPda(user);
      const userInventory = iqlabs.contract.getUserInventoryPda(user);

      await ensureUserInitialized(connection, signer, builder, {
        user,
        code_account: codeAccount,
        user_state: userState,
        user_inventory: userInventory,
        system_program: SystemProgram.programId,
      });

      setIsInitialized(true);
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('already in use') || err.message.includes('AlreadyInUse'))
      ) {
        setIsInitialized(true);
        return;
      }
      setError(err instanceof Error ? err : new Error('Failed to initialize user'));
    } finally {
      setIsInitializing(false);
    }
  }, [builder, connected, connection, dbRootId, rootPda]);

  useEffect(() => {
    if (!publicKey || !connected || !signTransaction || !signAllTransactions) {
      setIsInitialized(false);
      return;
    }

    checkAndInitialize();
  }, [checkAndInitialize, connected, publicKey, signTransaction, signAllTransactions]);

  return {
    isInitialized,
    isInitializing,
    error,
    retry: checkAndInitialize,
  };
}
