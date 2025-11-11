import { Connection, PublicKey, ConfirmedSignatureInfo } from '@solana/web3.js';
import { getTransactionChunks, getCache } from './client';
import { reconstructData, formatTimestamp } from './utils';

export interface ChatMessage {
  handle: string;
  message: string;
  timestamp: number;
  signature: string;
}

/**
 * Fetch transaction signatures for an account
 */
export async function fetchDataSignatures(
  connection: Connection,
  accountPubkey: PublicKey,
  limit: number = 10
): Promise<ConfirmedSignatureInfo[]> {
  try {
    const signatures = await connection.getSignaturesForAddress(accountPubkey, { limit });
    return signatures;
  } catch (error) {
    console.error('Failed to fetch signatures:', error);
    return [];
  }
}

/**
 * Parse DbCodeIn instruction to get handle and tail transaction
 */
async function parseDbCodeIn(
  connection: Connection,
  signature: string
): Promise<{ handle: string; tailTx: string } | null> {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx || !tx.transaction) {
      return null;
    }

    const instructions = tx.transaction.message.compiledInstructions || [];

    for (const instruction of instructions) {
      try {
        const data = Buffer.from(instruction.data);

        // Look for DbCodeIn discriminator: 2664a5f26389ce6c
        if (data.length > 12 &&
            data[0] === 0x26 && data[1] === 0x64 &&
            data[2] === 0xa5 && data[3] === 0xf2) {

          let pos = 8; // Skip discriminator

          // Read handle
          const handleLen = data.readUInt32LE(pos);
          pos += 4;
          const handle = data.slice(pos, pos + handleLen).toString('utf8');
          pos += handleLen;

          // Read tail transaction signature
          const tailTxLen = data.readUInt32LE(pos);
          pos += 4;
          const tailTx = data.slice(pos, pos + tailTxLen).toString('utf8');

          if (handleLen > 0 && handleLen < 100) {
            return { handle, tailTx };
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse SendCode instruction to get chunk data and previous transaction
 */
async function parseSendCode(
  connection: Connection,
  signature: string
): Promise<{ chunk: string; previousTx: string } | null> {
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!tx || !tx.transaction) {
      return null;
    }

    const instructions = tx.transaction.message.compiledInstructions || [];

    for (const instruction of instructions) {
      try {
        const data = Buffer.from(instruction.data);

        // SendCode instruction structure (observed from testing transaction):
        // [discriminator/metadata] [chunk_len (u32)] [chunk] [prev_tx_len (u32)] [prev_tx] ...
        if (data.length > 12) {
          // Try parsing from different offsets to find the data
          const possibleOffsets = [0, 8, 16];

          for (const startOffset of possibleOffsets) {
            try {
              let pos = startOffset;

              if (pos + 4 > data.length) continue;

              // Read chunk length
              const chunkLen = data.readUInt32LE(pos);
              pos += 4;

              // Sanity check chunk length
              if (chunkLen > 0 && chunkLen < 2000 && pos + chunkLen + 4 <= data.length) {
                const chunk = data.slice(pos, pos + chunkLen).toString('utf8');
                pos += chunkLen;

                // Read previous tx length
                const prevTxLen = data.readUInt32LE(pos);
                pos += 4;

                // Sanity check prev tx length
                if (prevTxLen > 0 && prevTxLen < 200 && pos + prevTxLen <= data.length) {
                  const previousTx = data.slice(pos, pos + prevTxLen).toString('utf8');

                  // Validate that chunk contains printable text
                  if (chunk.length > 0 && /^[\x20-\x7E\s]+$/.test(chunk)) {
                    return { chunk, previousTx };
                  }
                }
              }
            } catch (e) {
              continue;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Reconstruct full message by following transaction chain
 */
async function reconstructMessageFromChain(
  connection: Connection,
  dbCodeInSig: string
): Promise<string | null> {
  try {
    console.log(`[reconstruct] Starting for ${dbCodeInSig.substring(0, 20)}...`);

    // Parse the DbCodeIn transaction
    const dbCodeIn = await parseDbCodeIn(connection, dbCodeInSig);
    if (!dbCodeIn) {
      console.log(`[reconstruct] Failed to parse DbCodeIn`);
      return null;
    }

    const { handle, tailTx } = dbCodeIn;
    console.log(`[reconstruct] Handle: ${handle}, tailTx: ${tailTx.substring(0, 20)}...`);

    // If tailTx is "Genesis", there's no actual message content
    if (tailTx === 'Genesis' || !tailTx) {
      return `${handle}: [empty message]`;
    }

    // Follow the transaction chain to collect chunks
    const chunks: string[] = [];
    let currentTx = tailTx;
    let iterations = 0;
    const maxIterations = 10; // Reduced from 20 to prevent long waits

    while (currentTx && currentTx !== 'Genesis' && iterations < maxIterations) {
      iterations++;

      const sendCode = await parseSendCode(connection, currentTx);
      if (!sendCode) {
        console.log(`[reconstruct] Failed to parse SendCode at iteration ${iterations}`);
        break;
      }

      console.log(`[reconstruct] Chunk ${iterations}: "${sendCode.chunk.substring(0, 20)}..."`);
      chunks.unshift(sendCode.chunk);
      currentTx = sendCode.previousTx;
    }

    if (chunks.length > 0) {
      const message = chunks.join('');
      console.log(`[reconstruct] Success: ${chunks.length} chunks, ${message.length} chars`);
      return `${handle}: ${message}`;
    }

    console.log(`[reconstruct] No chunks found`);
    return `${handle}: [unable to reconstruct message]`;
  } catch (error) {
    console.error('[reconstruct] Error:', error);
    return null;
  }
}

/**
 * Read chat message from transaction
 * Parses directly from blockchain (backend removed)
 */
export async function readChat(
  signature: string,
  connection?: Connection
): Promise<string | null> {
  try {
    const shortSig = signature.substring(0, 20);
    console.log(`[readChat] ${shortSig}... - parsing from chain`);

    // Parse directly from chain
    if (connection) {
      const reconstructed = await reconstructMessageFromChain(connection, signature);
      if (reconstructed) {
        console.log(`[readChat] ${shortSig}... - SUCCESS: ${reconstructed}`);
        return reconstructed;
      }
    }

    console.log(`[readChat] ${shortSig}... - failed`);
    return null;
  } catch (error) {
    console.error('Failed to read chat:', error);
    return null;
  }
}

/**
 * Format chat message with handle and timestamp
 */
function formatChatMessage(data: string): string {
  if (!data) return '';

  try {
    // Parse JSON if it's structured data
    const parsed = JSON.parse(data);
    if (parsed.handle && parsed.message) {
      return `${parsed.handle}: ${parsed.message}`;
    }
    return data;
  } catch {
    // If not JSON, return as is
    return data;
  }
}

/**
 * Get chat history
 */
export async function getChatRecords(
  connection: Connection,
  pdaString: string,
  limit: number = 10
): Promise<ChatMessage[]> {
  try {
    const pda = new PublicKey(pdaString);
    const signatures = await fetchDataSignatures(connection, pda, limit);

    console.log(`[getChatRecords] Found ${signatures.length} signatures`);

    const messages: ChatMessage[] = [];

    // Process messages in parallel with timeout
    const messagePromises = signatures.reverse().map(async (sig) => {
      try {
        // Add 10 second timeout per message
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 10000)
        );

        const messagePromise = readChat(sig.signature, connection);

        const message = await Promise.race([messagePromise, timeoutPromise]) as string | null;

        if (message) {
          return {
            handle: 'User',
            message,
            timestamp: sig.blockTime || Date.now() / 1000,
            signature: sig.signature,
          };
        }
        return null;
      } catch (error) {
        console.error('Failed to read message:', sig.signature.substring(0, 20), error);
        return null;
      }
    });

    const results = await Promise.all(messagePromises);

    // Filter out nulls
    for (const result of results) {
      if (result) {
        messages.push(result);
      }
    }

    console.log(`[getChatRecords] Successfully loaded ${messages.length} messages`);
    return messages;
  } catch (error) {
    console.error('Failed to get chat records:', error);
    return [];
  }
}

/**
 * Subscribe to new chat messages in real-time
 */
export function joinChat(
  connection: Connection,
  pdaString: string,
  onMessage: (message: string) => void
): number {
  try {
    const chatPDA = new PublicKey(pdaString);

    const subscriptionId = connection.onLogs(
      chatPDA,
      async (logs) => {
        try {
            console.log('New message received:', logs.signature);
          const message = await readChat(logs.signature, connection);
          if (message) {
            onMessage(message);
          }
        } catch (error) {
          console.error('Failed to process new message:', error);
        }
      },
      'confirmed'
    );

    console.log('Subscribed to chat:', pdaString, 'Subscription ID:', subscriptionId);
    return subscriptionId;
  } catch (error) {
    console.error('Failed to join chat:', error);
    throw error;
  }
}

/**
 * Unsubscribe from chat
 */
export async function leaveChat(
  connection: Connection,
  subscriptionId: number
): Promise<void> {
  try {
    await connection.removeOnLogsListener(subscriptionId);
    console.log('Unsubscribed from chat:', subscriptionId);
  } catch (error) {
    console.error('Failed to leave chat:', error);
  }
}

/**
 * Read arbitrary code/data from transaction
 */
export async function readCode(signature: string): Promise<string | null> {
  try {
    // Try cache first (will return null on 404)
    const cached = await getCache(signature);
    if (cached?.data) {
      return cached.data;
    }

    // Try backend chunks API (will return null on 404)
    const result = await getTransactionChunks(signature);
    if (result?.chunks) {
      return reconstructData(result.chunks);
    }

    return null;
  } catch (error) {
    console.error('Failed to read code:', error);
    return null;
  }
}

/**
 * Check if PDA exists
 */
export async function pdaExists(
  connection: Connection,
  pdaString: string
): Promise<boolean> {
  try {
    const pda = new PublicKey(pdaString);
    const accountInfo = await connection.getAccountInfo(pda);
    return accountInfo !== null;
  } catch (error) {
    return false;
  }
}
