/**
 * Voice Calling Module
 *
 * Full on-chain signaling with WebRTC audio.
 */

// Types
export type {
  CallSignal,
  CallSignalType,
  CallState,
  CallStatus,
} from './types';

export {
  CALLS_TABLE_NAME,
  CALLS_COLUMNS,
  ICE_SERVERS,
  generateCallId,
  parseCallSignal,
  serializeCallSignal,
} from './types';

// Hook
export { useVoiceCall } from './useVoiceCall';

// Signaling (for advanced usage)
export {
  ensureCallsTable,
  sendCallOffer,
  sendCallAccept,
  sendCallReject,
  sendCallEnd,
  sendSdpOffer,
  sendSdpAnswer,
  sendIceCandidates,
  getCallsTxRefPda,
} from './call-signaling';

// SDP utilities
export { chunkSdp, reassembleSdp, compressSdp, estimateSdpTransactions } from './sdp-chunker';

// WebRTC manager (for advanced usage)
export { WebRTCManager, type WebRTCState, type WebRTCManagerConfig } from './webrtc-manager';
