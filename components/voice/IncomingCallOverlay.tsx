'use client';

/**
 * IncomingCallOverlay Component
 *
 * Full-screen overlay that appears when there's an incoming call.
 * Uses the global VoiceCallContext to detect and respond to calls.
 */

import { useVoiceCallContextOptional } from '@/lib/voice/VoiceCallContext';

// Icons
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

const ChainIcon = () => (
  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
  </svg>
);

export function IncomingCallOverlay() {
  const voiceCall = useVoiceCallContextOptional();

  // Not in provider or no incoming call
  if (!voiceCall || voiceCall.status !== 'incoming') {
    return null;
  }

  const { remotePubkey, acceptCall, rejectCall } = voiceCall;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
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
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
          >
            <PhoneOffIcon />
            Decline
          </button>
          
          <button
            onClick={() => acceptCall(false)}
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-green-600 hover:bg-green-700 text-white font-medium transition-colors"
          >
            <PhoneIcon />
            Audio
          </button>

          <button
            onClick={() => acceptCall(true)}
            className="flex items-center gap-2 px-4 py-3 rounded-full bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
             {/* Using a simpler inline video icon since I can't import the one from ActiveCallBar easily without code dupe or refactor */}
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>
            Video
          </button>
        </div>
      </div>
    </div>
  );
}
