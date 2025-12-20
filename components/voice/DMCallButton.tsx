'use client';

/**
 * DMCallButton Component
 *
 * Call button for DM chat view. Starts a call with the friend
 * you're currently chatting with - no need to enter their address.
 */

import { useCallback } from 'react';
import { useVoiceCallContextOptional } from '@/lib/voice/VoiceCallContext';

// Icons
const PhoneIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
  </svg>
);

const ChainIcon = () => (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
  </svg>
);

interface DMCallButtonProps {
  targetPubkey: string;
  disabled?: boolean;
}

export function DMCallButton({ targetPubkey, disabled }: DMCallButtonProps) {
  const voiceCall = useVoiceCallContextOptional();

  const handleCall = useCallback(async () => {
    if (!voiceCall || !voiceCall.isReady) return;
    await voiceCall.startCall(targetPubkey);
  }, [voiceCall, targetPubkey]);

  // Not in provider
  if (!voiceCall) {
    return null;
  }

  const { status, isReady } = voiceCall;

  // Already in a call
  if (status !== 'idle') {
    return null;
  }

  const isDisabled = disabled || !isReady;

  return (
    <button
      onClick={handleCall}
      disabled={isDisabled}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
        ${isDisabled
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
          : 'bg-green-600 hover:bg-green-700 text-white'
        }`}
      title={isReady ? 'Start voice call' : 'Initializing...'}
    >
      <ChainIcon />
      <PhoneIcon />
      <span>{isReady ? 'CALL' : 'INIT...'}</span>
    </button>
  );
}
