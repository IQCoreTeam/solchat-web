'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {initializeRootWeb, pdaRoot} from '../index';
import { pdaTxRef } from '../provider/pda.provider';
import idl from '@/lib/onchainDB/idl.json';

import type { Idl } from '@coral-xyz/anchor';
import type { BytesLike } from '../core/seed';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { configs } from '../configs';

export function useUserInit(rootIdOverride?: BytesLike) {
  const { connection } = useAppConnection();
  const appWallet = useAppWallet();
  const { publicKey, connected, signTransaction, signAllTransactions } = appWallet;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const derivedRootId = rootIdOverride ?? configs.defaultRootId;
  const publicKeyRef = useRef(publicKey);
  const signerRef = useRef<typeof signTransaction | null>(signTransaction ?? null);
  const signerAllRef = useRef<typeof signAllTransactions | null>(signAllTransactions ?? null);
  const publicKeyBase58 = useMemo(() => publicKey?.toBase58() ?? null, [publicKey]);
  const hasSigner = Boolean(signTransaction);
  const hasAllSigners = Boolean(signAllTransactions);

  useEffect(() => {
    publicKeyRef.current = publicKey;
  }, [publicKey]);

  useEffect(() => {
    signerRef.current = signTransaction ?? null;
  }, [signTransaction]);

  useEffect(() => {
    signerAllRef.current = signAllTransactions ?? null;
  }, [signAllTransactions]);

  const checkAndInitialize = useCallback(async () => {
    const currentPublicKey = publicKeyRef.current;
    const signer = signerRef.current;
    const signerAll = signerAllRef.current;

    if (!currentPublicKey || !connected || !derivedRootId || !signer) {
      console.log('useUserInit: wallet not ready');
      setIsInitialized(false);
      return;
    }

    try {
      setIsInitializing(true);
      setError(null);

      const txRefPda = pdaTxRef(derivedRootId);
      console.log('useUserInit: Checking TxRef PDA:', txRefPda.toBase58());
      const rootPda = pdaRoot(derivedRootId);
      const rootInfo = await connection.getAccountInfo(rootPda);
      if (rootInfo) {
        console.log('useUserInit: ✓ root exists, user is initialized');
        setIsInitialized(true);
        return;
      }
      //   if (txRefInfo) {
      //   console.log('useUserInit: ✓ TxRef exists, user is initialized');
      //   setIsInitialized(true);
      //   return;
      // }

      console.log('useUserInit: ❌ TxRef missing, initializing via initialize_root');

      const { tx } = await initializeRootWeb(
        {
          connection,
          wallet: {
            publicKey: currentPublicKey,
            signTransaction: signer,
            signAllTransactions: signerAll ?? undefined,
          },
          idl: idl as Idl,
        },
        derivedRootId
      );

      console.log('useUserInit: Transaction built, requesting signature...');
      const latestBlockhash = await connection.getLatestBlockhash('processed');
      tx.recentBlockhash = latestBlockhash.blockhash;
      tx.feePayer = currentPublicKey;

      const signedTx = await signer(tx);
      const signature = await connection.sendRawTransaction(signedTx.serialize());

      console.log('useUserInit: Transaction sent:', signature);
      console.log('useUserInit: Confirming...');

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        'processed'
      );

      console.log('useUserInit: ✓ User initialized successfully!');
      setIsInitialized(true);
    } catch (err: any) {
      console.error('useUserInit: Error during initialization:', err);

      if (
        err?.message?.includes('already in use') ||
        err?.message?.includes('AlreadyInUse')
      ) {
        console.log('useUserInit: Account already exists, marking as initialized');
        setIsInitialized(true);
      } else {
        setError(err);
      }
    } finally {
      setIsInitializing(false);
    }
  }, [connection, derivedRootId, connected]);

  useEffect(() => {
    if (!publicKeyBase58 || !connected || !hasSigner || !derivedRootId || !hasAllSigners) {
      setIsInitialized(false);
      return;
    }

    checkAndInitialize();
  }, [checkAndInitialize, derivedRootId, connected, publicKeyBase58, hasSigner, hasAllSigners]);

  return {
    isInitialized,
    isInitializing,
    error,
    retry: checkAndInitialize,
  };
}
