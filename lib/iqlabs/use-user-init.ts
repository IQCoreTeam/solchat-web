'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAMPORTS_PER_SOL, SystemProgram } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import { IQ_IDL } from 'iqlabs-sdk/contract';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { sendAndConfirmTx } from '@/lib/utils/send-and-confirm';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import { getOrDeriveKeypair } from '@/lib/crypto/dm-encryption';
import { ensureMyDhKey } from '@/lib/crypto/dh-key';

const MIN_FUNDING_LAMPORTS = 0.005 * LAMPORTS_PER_SOL;

export function useUserInit() {
  const { connection, readConnection } = useAppConnection();
  const appWallet = useAppWallet();
  const { publicKey, connected, signTransaction, signAllTransactions, signMessage } = appWallet;
  const [isInitialized, setIsInitialized] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [needsFunding, setNeedsFunding] = useState(false);
  const [balanceLamports, setBalanceLamports] = useState<number | null>(null);

  const programId = useMemo(() => iqlabs.contract.PROGRAM_ID, []);
  const builder = useMemo(
    () => iqlabs.contract.createInstructionBuilder(IQ_IDL, programId),
    [programId]
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

      const user = currentPublicKey;
      const userState = iqlabs.contract.getUserPda(user);
      const codeAccount = iqlabs.contract.getCodeAccountPda(user);
      const userInventory = iqlabs.contract.getUserInventoryPda(user);

      // Check via Helius (fast reads). We bypass the SDK's
      // ensureUserInitialized because it reads via the write connection,
      // which can hang on some RPC providers.
      const invInfo = await readConnection.getAccountInfo(userInventory);
      if (invInfo) {
        setNeedsFunding(false);
      } else {
        const balance = await readConnection.getBalance(currentPublicKey);
        setBalanceLamports(balance);
        if (balance < MIN_FUNDING_LAMPORTS) {
          setNeedsFunding(true);
          setIsInitialized(false);
          return;
        }
        setNeedsFunding(false);
        console.log('[useUserInit] User not initialized, creating accounts');
        const ix = iqlabs.contract.userInitializeInstruction(builder, {
          user,
          code_account: codeAccount,
          user_state: userState,
          user_inventory: userInventory,
          system_program: SystemProgram.programId,
        });
        await sendAndConfirmTx(connection, readConnection, signer, ix);
        console.log('[useUserInit] User initialized successfully');
      }

      setIsInitialized(true);

      if (signMessage) {
        try {
          const kp = await getOrDeriveKeypair(signMessage);
          const result = await ensureMyDhKey(connection, signer, kp.pubHex);
          if (result.created) {
            console.log('[useUserInit] Registered encryption pubkey on-chain:', result.signature);
          }
        } catch (err) {
          console.warn('[useUserInit] DH key registration failed (non-fatal):', err);
        }
      }
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('already in use') || err.message.includes('AlreadyInUse'))
      ) {
        setIsInitialized(true);
        return;
      }
      console.error('[useUserInit] Init failed:', err);
      setError(err instanceof Error ? err : new Error('Failed to initialize user'));
    } finally {
      setIsInitializing(false);
    }
  }, [builder, connected, connection, readConnection, signMessage]);

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
    needsFunding,
    balanceLamports,
    walletAddress: publicKey?.toBase58() ?? null,
    retry: checkAndInitialize,
  };
}
