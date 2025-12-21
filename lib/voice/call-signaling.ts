/**
 * On-Chain Call Signaling
 *
 * All call signals (offer, accept, reject, SDP, ICE) are written on-chain
 * to a dedicated 'voice-calls' table. Participants subscribe to the TxRef
 * account to receive real-time updates.
 */

import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
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
import { getCachedSignatures, getCachedTransaction } from '@/lib/rpc/cache';
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
    // Polling fallback will catch any missed chunks, but longer delay reduces need for polling
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
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
    // Polling fallback will catch any missed chunks, but longer delay reduces need for polling
    if (i < chunks.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
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

/**
 * Read the current signal directly from TxRef account
 * This is a fallback when transaction history polling fails
 */
export async function readCurrentTxRefSignal(
  connection: Connection
): Promise<CallSignal | null> {
  try {
    const txRefPda = getCallsTxRefPda();
    const accountInfo = await connection.getAccountInfo(txRefPda, 'confirmed');

    if (!accountInfo || !accountInfo.data) {
      console.log('[CallSignaling] TxRef account not found or empty');
      return null;
    }

    const data = Buffer.from(accountInfo.data);
    if (data.length < 12) return null;

    // Parse TxRef data: 8-byte discriminator + 4-byte length + data
    const dataLen = data.readUInt32LE(8);
    if (data.length < 12 + dataLen) return null;

    const rawData = data.slice(12, 12 + dataLen);
    const jsonStr = new TextDecoder().decode(rawData);

    const parsed = JSON.parse(jsonStr);
    if (parsed.type && parsed.callId && parsed.from && parsed.to) {
      console.log('[CallSignaling] Read current TxRef signal:', parsed.type, 'callId:', parsed.callId?.slice(0, 12));
      return parsed as CallSignal;
    }

    return null;
  } catch (error) {
    console.error('[CallSignaling] Failed to read TxRef signal:', error);
    return null;
  }
}

/**
 * Get the voice-calls table PDA
 */
export function getCallsTablePda(): PublicKey {
  const rootPubkey = pdaRoot(ROOT_ID);
  return pdaTable(rootPubkey, new TextEncoder().encode(CALLS_TABLE_NAME));
}

/**
 * Parse a transaction to extract call signal data
 * Returns null if not a valid voice-call signal
 */
async function parseCallSignalFromTx(
  connection: Connection,
  signature: string
): Promise<CallSignal | null> {
  try {
    const result = await getCachedTransaction(connection, signature);
    const tx = result.tx;

    if (!tx || !tx.transaction) {
      return null;
    }

    // Get the transaction message
    const msg = tx.transaction.message as any;
    const instructions = msg?.compiledInstructions || msg?.instructions || [];

    for (const instruction of instructions) {
      try {
        const data = Buffer.from(instruction.data);
        if (data.length < 20) continue;

        // Try to find JSON payload in the instruction data
        // Scan for {"type": pattern which is how our signals start
        const dataStr = data.toString('utf8');
        const jsonStartIdx = dataStr.indexOf('{"type"');

        if (jsonStartIdx >= 0) {
          // Find the end of the JSON by counting braces
          let braceCount = 0;
          let jsonEndIdx = jsonStartIdx;
          for (let i = jsonStartIdx; i < dataStr.length; i++) {
            if (dataStr[i] === '{') braceCount++;
            if (dataStr[i] === '}') braceCount--;
            if (braceCount === 0) {
              jsonEndIdx = i + 1;
              break;
            }
          }

          const jsonStr = dataStr.slice(jsonStartIdx, jsonEndIdx);
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.type && parsed.callId && parsed.from && parsed.to) {
              return parsed as CallSignal;
            }
          } catch {
            // Not valid JSON, continue
          }
        }
      } catch {
        continue;
      }
    }

    return null;
  } catch (error) {
    console.error('[CallSignaling] Failed to parse tx:', signature.slice(0, 8), error);
    return null;
  }
}

/**
 * Poll recent call signals from blockchain transaction history
 * This is the fallback mechanism to catch any signals missed by TxRef subscription
 *
 * @param connection Solana connection
 * @param callId The call ID to filter signals for
 * @param userPubkey The user's public key (to filter signals for us)
 * @param limit Maximum number of recent transactions to scan
 * @returns Array of CallSignals for the specified call
 */
// Rate limiting for polling
let lastPollTime = 0;
const MIN_POLL_INTERVAL = 1000; // Minimum 1 second between polls

export async function pollRecentCallSignals(
  connection: Connection,
  callId: string,
  userPubkey: string,
  limit: number = 15
): Promise<CallSignal[]> {
  // Rate limiting - wait if we polled too recently
  const now = Date.now();
  const timeSinceLastPoll = now - lastPollTime;
  if (timeSinceLastPoll < MIN_POLL_INTERVAL) {
    await new Promise(r => setTimeout(r, MIN_POLL_INTERVAL - timeSinceLastPoll));
  }
  lastPollTime = Date.now();

  const signals: CallSignal[] = [];

  try {
    // First, try reading the current TxRef signal directly (fast, single RPC call)
    const currentSignal = await readCurrentTxRefSignal(connection);
    if (currentSignal &&
        currentSignal.callId === callId &&
        (currentSignal.to === userPubkey || currentSignal.from === userPubkey) &&
        currentSignal.from !== userPubkey) {
      signals.push(currentSignal);
    }

    // Get transaction history from TxRef PDA
    const txRefPda = getCallsTxRefPda();

    const txRefSigs = await connection.getSignaturesForAddress(
      txRefPda,
      { limit },
      'confirmed'
    );

    if (txRefSigs && txRefSigs.length > 0) {
      console.log('[CallSignaling] Scanning', txRefSigs.length, 'transactions for callId:', callId.slice(0, 12));

      // Parse transactions sequentially with small delays to avoid rate limiting
      for (const sig of txRefSigs) {
        try {
          const signal = await parseCallSignalFromTx(connection, sig.signature);
          if (signal &&
              signal.callId === callId &&
              (signal.to === userPubkey || signal.from === userPubkey) &&
              signal.from !== userPubkey) {
            // Avoid duplicates
            if (!signals.find(s => s.type === signal.type && s.sdpChunk === signal.sdpChunk && s.timestamp === signal.timestamp)) {
              signals.push(signal);
              console.log('[CallSignaling] Found:', signal.type, 'chunk:', signal.sdpChunk, '/', signal.sdpTotal);
            }
          }
          // Small delay between transaction fetches to avoid rate limiting
          await new Promise(r => setTimeout(r, 50));
        } catch (e) {
          // Continue on error, try next transaction
          continue;
        }
      }
    }

    console.log('[CallSignaling] Poll complete:', signals.length, 'signals found');
    return signals;
  } catch (error) {
    console.error('[CallSignaling] Poll error:', error);
    return signals;
  }
}
