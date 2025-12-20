'use client';

/**
 * VoiceCallProviderWrapper
 *
 * Wraps the app with VoiceCallProvider and includes global overlays.
 * Uses useAppConnection and useAppWallet to get the necessary context.
 */

import { ReactNode, useMemo } from 'react';
import { VoiceCallProvider } from '@/lib/voice/VoiceCallContext';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { ActiveCallBar } from './ActiveCallBar';
import { useAppConnection, useAppWallet } from '@/lib/wallet/use-app-wallet';
import type { WalletAdapterLike } from '@/lib/onchainDB/web/provider';
import type { WriterCtx } from '@/lib/onchainDB';
import idl from '@/lib/onchainDB/idl.json';
import { Idl } from '@coral-xyz/anchor';

type ProgramIdl = Idl & { address?: string };
const VOICE_IDL = idl as ProgramIdl;

interface VoiceCallProviderWrapperProps {
  children: ReactNode;
}

export function VoiceCallProviderWrapper({ children }: VoiceCallProviderWrapperProps) {
  const { connection } = useAppConnection();
  const wallet = useAppWallet();

  const userPubkey = wallet?.publicKey?.toBase58() || null;

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

  const writerCtx = useMemo<WriterCtx | null>(() => {
    if (!writerWallet) return null;
    return {
      connection,
      wallet: writerWallet,
      idl: VOICE_IDL,
    };
  }, [connection, writerWallet]);

  return (
    <VoiceCallProvider
      connection={connection}
      writerCtx={writerCtx}
      userPubkey={userPubkey}
    >
      {/* Global voice call overlays */}
      <IncomingCallOverlay />
      <ActiveCallBar />
      {children}
    </VoiceCallProvider>
  );
}
