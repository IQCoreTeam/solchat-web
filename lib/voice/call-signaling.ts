/**
 * On-Chain Call Signaling
 *
 * All call signals (offer, accept, reject, SDP, ICE) are written on-chain
 * to a dedicated 'voice-calls' table. Participants subscribe to the TxRef
 * account to receive real-time updates.
 */

import { Connection, PublicKey } from '@solana/web3.js';
import {
  writeRowWeb,
  createTableWeb,
  type WriterCtx,
  pdaRoot,
  pdaTable,
  pdaTxRef,
} from '@/lib/onchainDB';
import { ROOT_ID } from '@/lib/onchainDB/constants';
import { sendAndConfirmTx } from '@/lib/onchainDB/utils/transaction-helpers';
import {
  type CallSignal,
  type CallSignalType,
  CALLS_TABLE_NAME,
  CALLS_COLUMNS,
  generateCallId,
  serializeCallSignal,
} from './types';
import { chunkSdp, compressSdp } from './sdp-chunker';
import { encryptForRecipient } from './encryption';

/**
 * Ensure the voice-calls table exists
 */
export async function ensureCallsTable(
  connection: Connection,
  writerCtx: WriterCtx
): Promise<boolean> {
  const rootPubkey = pdaRoot(ROOT_ID);
  const tablePda = pdaTable(rootPubkey, new TextEncoder().encode(CALLS_TABLE_NAME));

  try {
    const tableAccount = await connection.getAccountInfo(tablePda);
    if (tableAccount) {
      console.log('[CallSignaling] Calls table exists:', tablePda.toBase58());
      return true;
    }

    console.log('[CallSignaling] Creating calls table...');
    const { tx } = await createTableWeb(
      writerCtx,
      ROOT_ID,
      CALLS_TABLE_NAME,
      [...CALLS_COLUMNS],
      { idColumn: 'id' }
    );

    await sendAndConfirmTx(connection, writerCtx.wallet, tx, '[CallSignaling] Table created:');
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('already in use') || msg.includes('already exists')) {
      return true;
    }
    console.error('[CallSignaling] Failed to ensure calls table:', error);
    return false;
  }
}

/**
 * Write a call signal to the blockchain
 * Uses the same signing approach as chat messages (Privy embedded wallet)
 */
async function writeSignal(
  connection: Connection,
  writerCtx: WriterCtx,
  signal: CallSignal
): Promise<string | null> {
  try {
    const { tx } = await writeRowWeb(
      writerCtx,
      ROOT_ID,
      CALLS_TABLE_NAME,
      serializeCallSignal(signal)
    );

    // Use sendAndConfirmTx - same as chat messages
    // This uses the Privy embedded wallet via writerCtx.wallet
    const signature = await sendAndConfirmTx(
      connection,
      writerCtx.wallet,
      tx,
      `[CallSignaling] ${signal.type} sent:`
    );

    return signature;
  } catch (error) {
    console.error('[CallSignaling] Failed to write signal:', error);
    return null;
  }
}

/**
 * Send a call offer (includes encryption public key)
 */
export async function sendCallOffer(
  connection: Connection,
  writerCtx: WriterCtx,
  fromPubkey: string,
  toPubkey: string,
  encPubKey?: string // Encryption public key (hex)
): Promise<{ callId: string; signature: string | null }> {
  const callId = generateCallId();
  const signal: CallSignal = {
    type: 'call-offer',
    callId,
    from: fromPubkey,
    to: toPubkey,
    timestamp: Date.now(),
    encPubKey, // Include encryption public key
  };

  const signature = await writeSignal(connection, writerCtx, signal);
  return { callId, signature };
}

/**
 * Send call accept (includes encryption public key)
 */
export async function sendCallAccept(
  connection: Connection,
  writerCtx: WriterCtx,
  callId: string,
  fromPubkey: string,
  toPubkey: string,
  encPubKey?: string // Encryption public key (hex)
): Promise<string | null> {
  const signal: CallSignal = {
    type: 'call-accept',
    callId,
    from: fromPubkey,
    to: toPubkey,
    timestamp: Date.now(),
    encPubKey, // Include encryption public key
  };
  return writeSignal(connection, writerCtx, signal);
}

/**
 * Send call reject
 */
export async function sendCallReject(
  connection: Connection,
  writerCtx: WriterCtx,
  callId: string,
  fromPubkey: string,
  toPubkey: string,
  reason?: string
): Promise<string | null> {
  const signal: CallSignal = {
    type: 'call-reject',
    callId,
    from: fromPubkey,
    to: toPubkey,
    timestamp: Date.now(),
    reason,
  };
  return writeSignal(connection, writerCtx, signal);
}

/**
 * Send call end
 */
export async function sendCallEnd(
  connection: Connection,
  writerCtx: WriterCtx,
  callId: string,
  fromPubkey: string,
  toPubkey: string
): Promise<string | null> {
  const signal: CallSignal = {
    type: 'call-end',
    callId,
    from: fromPubkey,
    to: toPubkey,
    timestamp: Date.now(),
  };
  return writeSignal(connection, writerCtx, signal);
}

/**
 * Encryption params for SDP/ICE
 */
interface EncryptionParams {
  recipientPubKey: Uint8Array;
  senderSecretKey: Uint8Array;
}

/**
 * Send SDP offer (chunked if needed, optionally encrypted)
 * Returns array of signatures for each chunk
 */
export async function sendSdpOffer(
  connection: Connection,
  writerCtx: WriterCtx,
  callId: string,
  fromPubkey: string,
  toPubkey: string,
  sdp: string,
  encryption?: EncryptionParams
): Promise<string[]> {
  const compressed = compressSdp(sdp);
  const chunks = chunkSdp(compressed);
  const signatures: string[] = [];

  console.log('[CallSignaling] Sending SDP offer in', chunks.length, 'chunks', encryption ? '(encrypted)' : '(plaintext)');

  for (let i = 0; i < chunks.length; i++) {
    let chunkData = chunks[i];
    let nonce: string | undefined;
    let encrypted = false;

    // Encrypt if encryption params provided
    if (encryption) {
      const result = encryptForRecipient(chunkData, encryption.recipientPubKey, encryption.senderSecretKey);
      chunkData = result.encrypted;
      nonce = result.nonce;
      encrypted = true;
    }

    const signal: CallSignal = {
      type: 'sdp-offer',
      callId,
      from: fromPubkey,
      to: toPubkey,
      timestamp: Date.now(),
      sdp: chunkData,
      sdpChunk: i,
      sdpTotal: chunks.length,
      nonce,
      encrypted,
    };

    const sig = await writeSignal(connection, writerCtx, signal);
    if (sig) {
      signatures.push(sig);
    }

    // Delay between chunks - needs to be long enough for TxRef subscription to catch each one
    // TxRef only stores the latest tx, so rapid writes can cause missed chunks
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return signatures;
}

/**
 * Send SDP answer (chunked if needed, optionally encrypted)
 */
export async function sendSdpAnswer(
  connection: Connection,
  writerCtx: WriterCtx,
  callId: string,
  fromPubkey: string,
  toPubkey: string,
  sdp: string,
  encryption?: EncryptionParams
): Promise<string[]> {
  const compressed = compressSdp(sdp);
  const chunks = chunkSdp(compressed);
  const signatures: string[] = [];

  console.log('[CallSignaling] Sending SDP answer in', chunks.length, 'chunks', encryption ? '(encrypted)' : '(plaintext)');

  for (let i = 0; i < chunks.length; i++) {
    let chunkData = chunks[i];
    let nonce: string | undefined;
    let encrypted = false;

    // Encrypt if encryption params provided
    if (encryption) {
      const result = encryptForRecipient(chunkData, encryption.recipientPubKey, encryption.senderSecretKey);
      chunkData = result.encrypted;
      nonce = result.nonce;
      encrypted = true;
    }

    const signal: CallSignal = {
      type: 'sdp-answer',
      callId,
      from: fromPubkey,
      to: toPubkey,
      timestamp: Date.now(),
      sdp: chunkData,
      sdpChunk: i,
      sdpTotal: chunks.length,
      nonce,
      encrypted,
    };

    const sig = await writeSignal(connection, writerCtx, signal);
    if (sig) {
      signatures.push(sig);
    }

    // Delay between chunks - needs to be long enough for TxRef subscription to catch each one
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  return signatures;
}

/**
 * Send ICE candidates (batched - all in one transaction, optionally encrypted)
 */
export async function sendIceCandidates(
  connection: Connection,
  writerCtx: WriterCtx,
  callId: string,
  fromPubkey: string,
  toPubkey: string,
  candidates: RTCIceCandidate[],
  encryption?: EncryptionParams
): Promise<string | null> {
  if (candidates.length === 0) return null;

  // Serialize all candidates into a single JSON array
  let candidatesJson = JSON.stringify(
    candidates.map(c => c.toJSON())
  );

  let nonce: string | undefined;
  let encrypted = false;

  // Encrypt if encryption params provided
  if (encryption) {
    const result = encryptForRecipient(candidatesJson, encryption.recipientPubKey, encryption.senderSecretKey);
    candidatesJson = result.encrypted;
    nonce = result.nonce;
    encrypted = true;
  }

  const signal: CallSignal = {
    type: 'ice-candidate',
    callId,
    from: fromPubkey,
    to: toPubkey,
    timestamp: Date.now(),
    candidate: candidatesJson,
    nonce,
    encrypted,
  };

  console.log('[CallSignaling] Sending', candidates.length, 'ICE candidates in one tx', encryption ? '(encrypted)' : '(plaintext)');
  return writeSignal(connection, writerCtx, signal);
}

/**
 * Get the TxRef PDA for subscribing to call signals
 */
export function getCallsTxRefPda(): PublicKey {
  return pdaTxRef(ROOT_ID);
}
