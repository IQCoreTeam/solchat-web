'use client';

/**
 * VoiceCallContext
 *
 * Global context for voice call state. Provides call functionality
 * throughout the app so incoming calls can be received on any page.
 */

import { createContext, useContext, ReactNode, useState, useEffect, useRef, useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { useVoiceCall } from './useVoiceCall';
import type { WriterCtx } from '@/lib/onchainDB';
import type { CallStatus } from './types';
import type { WebRTCState } from './webrtc-manager';

interface VoiceCallContextValue {
  // State
  status: CallStatus;
  callId: string | null;
  remotePubkey: string | null;
  isOutgoing: boolean;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isRecording: boolean;
  isScreenSharing: boolean;
  webrtcState: WebRTCState;
  error: string | null;
  isReady: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;

  // Actions
  startCall: (targetPubkey: string, video?: boolean) => Promise<boolean>;
  acceptCall: (video?: boolean) => Promise<boolean>;
  rejectCall: (reason?: string) => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleVideo: () => void;
  toggleRecording: () => void;
  toggleScreenShare: () => Promise<void>;

  // Duration tracking
  duration: number;
}

const VoiceCallContext = createContext<VoiceCallContextValue | null>(null);

interface VoiceCallProviderProps {
  children: ReactNode;
  connection: Connection | null;
  writerCtx: WriterCtx | null;
  userPubkey: string | null;
}

export function VoiceCallProvider({
  children,
  connection,
  writerCtx,
  userPubkey
}: VoiceCallProviderProps) {
  const [duration, setDuration] = useState(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const voiceCall = useVoiceCall({
    connection,
    writerCtx,
    userPubkey,
    debug: true,
  });

  // Duration timer
  useEffect(() => {
    if (voiceCall.status === 'active') {
      setDuration(0);
      durationIntervalRef.current = setInterval(() => {
        setDuration(d => d + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      setDuration(0);
    }

    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [voiceCall.status]);

  const value: VoiceCallContextValue = {
    ...voiceCall,
    duration,
  };

  return (
    <VoiceCallContext.Provider value={value}>
      {children}
    </VoiceCallContext.Provider>
  );
}

export function useVoiceCallContext() {
  const context = useContext(VoiceCallContext);
  if (!context) {
    throw new Error('useVoiceCallContext must be used within a VoiceCallProvider');
  }
  return context;
}

// Optional hook that returns null if not in provider (for optional usage)
export function useVoiceCallContextOptional() {
  return useContext(VoiceCallContext);
}
