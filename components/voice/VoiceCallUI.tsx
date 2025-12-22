'use client';

/**
 * VoiceCallUI Component
 *
 * Full on-chain signaling with WebRTC audio.
 * Shows call button, incoming call overlay, and active call bar.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { Connection } from '@solana/web3.js';
import { useVoiceCall } from '@/lib/voice/useVoiceCall';
import type { WriterCtx } from '@/lib/onchainDB';

// ============================================================================
// Icons
// ============================================================================

const PhoneIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
  </svg>
);

const PhoneOffIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z"/>
  </svg>
);

const MicIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/>
  </svg>
);

const MicOffIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>
  </svg>
);

const ChainIcon = () => (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
  </svg>
);

const RecordIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
     <circle cx="12" cy="12" r="8" />
  </svg>
);

const StopIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" />
  </svg>
);

// ============================================================================
// Props
// ============================================================================

interface VoiceCallUIProps {
  userPubkey: string | null;
  connection?: Connection | null;
  writerCtx?: WriterCtx | null;
  onError?: (error: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export function VoiceCallUI({ userPubkey, connection, writerCtx, onError }: VoiceCallUIProps) {
  const [showCallInput, setShowCallInput] = useState(false);
  const [callTarget, setCallTarget] = useState('');
  const [duration, setDuration] = useState(0);

  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const {
    status,
    callId,
    remotePubkey,
    isOutgoing,
    isMuted,
    webrtcState,
    error,
    startCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleRecording,
    isReady,
    isRecording,
  } = useVoiceCall({

    connection: connection || null,
    writerCtx: writerCtx || null,
    userPubkey,
    onError,
    debug: true,
  });

  // Duration timer
  useEffect(() => {
    if (status === 'active') {
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
  }, [status]);

  const handleStartCall = useCallback(async () => {
    if (!callTarget.trim()) return;
    const success = await startCall(callTarget.trim());
    if (success) {
      setShowCallInput(false);
      setCallTarget('');
    }
  }, [callTarget, startCall]);

  const handleEndCall = useCallback(async () => {
    await endCall();
  }, [endCall]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = (): string => {
    switch (status) {
      case 'offering': return 'CALLING...';
      case 'incoming': return 'INCOMING';
      case 'accepting': return 'ACCEPTING...';
      case 'connecting': return 'CONNECTING...';
      case 'active': return webrtcState === 'connected' ? 'CONNECTED' : 'ACTIVE';
      case 'ending': return 'ENDING...';
      case 'error': return 'ERROR';
      default: return 'IDLE';
    }
  };

  // Not connected
  if (!userPubkey) {
    return null;
  }

  // Incoming call overlay
  if (status === 'incoming') {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-gray-900 border-2 border-green-500 rounded-lg p-8 flex flex-col items-center gap-6 max-w-sm">
          <div className="flex items-center gap-2 text-green-400">
            <ChainIcon />
            <span className="text-xs uppercase tracking-wider">On-Chain Call</span>
          </div>
          <div className="animate-pulse">
            <PhoneIcon />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-bold text-white">Incoming Call</h2>
            <p className="text-gray-400 mt-1 font-mono text-sm">
              {remotePubkey?.slice(0, 8)}...{remotePubkey?.slice(-4)}
            </p>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => rejectCall()}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
            >
              <PhoneOffIcon />
              Decline
            </button>
            <button
              onClick={acceptCall}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
            >
              <PhoneIcon />
              Answer
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Active/connecting call bar
  if (status === 'active' || status === 'connecting' || status === 'accepting' || status === 'ending') {
    return (
      <div className="fixed top-0 left-0 right-0 bg-green-700 text-white py-2 px-4 flex items-center justify-between z-50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-green-200">
            <ChainIcon />
            <span className="text-xs">ON-CHAIN</span>
          </div>
          <div className="flex items-center gap-2">
            <PhoneIcon />
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </div>
          <span className="font-medium font-mono">
            {remotePubkey?.slice(0, 8)}...
          </span>
          {status === 'active' && (
            <span className="text-green-200">{formatDuration(duration)}</span>
          )}
          <span className="text-green-200 text-xs uppercase">
            [{getStatusText()}]
          </span>
          {error && (
            <span className="text-red-200 text-xs ml-2">
              {error}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-full transition-colors ${
              isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-700'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOffIcon /> : <MicIcon />}
          </button>
          
          <button
            onClick={toggleRecording}
            className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
              isRecording 
                ? 'bg-red-900/50 border-red-500 text-red-100 animate-pulse' 
                : 'bg-gray-600 border-transparent hover:bg-gray-700 text-gray-200'
            }`}
            title={isRecording ? 'Stop Recording' : 'Record Proof'}
          >
             {isRecording ? <StopIcon /> : <RecordIcon />}
             <span className="text-xs font-bold">{isRecording ? 'REC' : 'PROOF'}</span>
          </button>

          <button
            onClick={handleEndCall}
            className="flex items-center gap-2 px-4 py-1 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
          >
            <PhoneOffIcon />
            End
          </button>
        </div>
      </div>
    );
  }

  // Calling state (outgoing, waiting for accept)
  if (status === 'offering') {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-600 rounded-full text-white">
          <ChainIcon />
          <PhoneIcon />
          <span className="text-sm animate-pulse">Calling on-chain...</span>
        </div>
        <button
          onClick={handleEndCall}
          className="p-2 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
          title="Cancel"
        >
          <PhoneOffIcon />
        </button>
      </div>
    );
  }

  // Idle state - show call button
  return (
    <div className="flex items-center gap-2">
      {showCallInput ? (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={callTarget}
            onChange={(e) => setCallTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleStartCall()}
            placeholder="Paste wallet address..."
            className="w-48 px-3 py-1.5 text-sm bg-black border border-green-500 text-green-300 rounded font-mono focus:outline-none focus:ring-1 focus:ring-green-400"
            autoFocus
          />
          <button
            onClick={handleStartCall}
            disabled={!isReady || !callTarget.trim()}
            className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Call
          </button>
          <button
            onClick={() => {
              setShowCallInput(false);
              setCallTarget('');
            }}
            className="px-2 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded transition-colors"
          >
            X
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowCallInput(true)}
          disabled={!isReady}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium transition-colors
            ${isReady
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          title={isReady ? 'Start an on-chain voice call' : 'Connecting...'}
        >
          <ChainIcon />
          <PhoneIcon />
          {isReady ? 'CALL' : 'INIT...'}
        </button>
      )}

      {error && (
        <span className="text-xs text-red-400">{error}</span>
      )}
    </div>
  );
}
