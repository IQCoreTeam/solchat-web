/**
 * Voice Call Types and Constants
 * Full on-chain signaling with WebRTC audio
 */

// ============================================================================
// Call Signaling Types (written on-chain)
// ============================================================================

export type CallSignalType =
  | 'call-offer'      // Caller initiates
  | 'call-accept'     // Callee accepts
  | 'call-reject'     // Callee rejects
  | 'call-end'        // Either party ends
  | 'call-busy'       // Callee is busy
  | 'sdp-offer'       // WebRTC SDP offer
  | 'sdp-answer'      // WebRTC SDP answer
  | 'ice-candidate'   // ICE candidate
  | 'call-proof';     // Merkle proof anchoring

export interface CallSignal {
  type: CallSignalType;
  callId: string;
  from: string;       // sender wallet pubkey
  to: string;         // recipient wallet pubkey
  timestamp: number;
  // Optional fields based on type
  sdp?: string;       // For sdp-offer/sdp-answer (may be chunked, may be encrypted)
  sdpChunk?: number;  // Chunk index for SDP
  sdpTotal?: number;  // Total chunks for SDP
  candidate?: string; // For ice-candidate (JSON stringified, may be encrypted)
  reason?: string;    // For call-reject
  // Encryption fields
  encPubKey?: string; // Sender's encryption public key (hex) - in call-offer/call-accept
  nonce?: string;     // Nonce for encrypted data (base64)
  encrypted?: boolean; // True if sdp/candidate is encrypted
  // Proof fields (for call-proof)
  merkleRoot?: string; // Hex string of the Merkle root
  cid?: string;        // IPFS/Arweave CID of the encrypted bundle
}

// ============================================================================
// Call State Machine
// ============================================================================

export type CallStatus =
  | 'idle'
  | 'offering'     // We sent offer, waiting for accept
  | 'incoming'     // We received offer
  | 'accepting'    // We're sending accept
  | 'connecting'   // Exchanging SDP/ICE
  | 'active'       // Call is live
  | 'ending'       // Ending call
  | 'error';

export interface CallState {
  status: CallStatus;
  callId: string | null;
  remotePubkey: string | null;
  isOutgoing: boolean;
  error: string | null;
  // SDP assembly
  remoteSdpChunks: Map<number, string>;
  remoteSdpTotal: number | null;
  // ICE candidates queued before connection
  pendingIceCandidates: RTCIceCandidateInit[];
  // Timing
  startedAt: number | null;
}

// ============================================================================
// Constants
// ============================================================================

// Table name for call signaling data
export const CALLS_TABLE_NAME = 'voice-calls';

// Columns for the calls table
export const CALLS_COLUMNS = ['id', 'type', 'data', 'sender', 'timestamp'] as const;

// SDP chunk size - must be small enough for on-chain write
// Total signal JSON ~200 bytes overhead + chunk + table/column overhead
// Keeping chunks at 400 bytes to stay well under tx limit
export const SDP_CHUNK_SIZE = 400;

// How long to wait for call accept before timeout (ms)
export const CALL_OFFER_TIMEOUT_MS = 30000;

// How long to wait for SDP/ICE exchange (ms)
export const CALL_CONNECT_TIMEOUT_MS = 60000;

// ICE servers for WebRTC
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique call ID
 */
export function generateCallId(): string {
  return `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Parse call signal from on-chain data
 */
export function parseCallSignal(data: string): CallSignal | null {
  try {
    const parsed = JSON.parse(data);
    if (!parsed.type || !parsed.callId || !parsed.from || !parsed.to) {
      return null;
    }
    return parsed as CallSignal;
  } catch {
    return null;
  }
}

/**
 * Serialize call signal for on-chain transmission
 */
export function serializeCallSignal(signal: CallSignal): string {
  return JSON.stringify(signal);
}
