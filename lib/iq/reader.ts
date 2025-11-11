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
 * Read chat message from transaction
 */
export async function readChat(signature: string): Promise<string | null> {
  try {
    // Try cache first
    const cached = await getCache(signature);
    if (cached?.data) {
      return formatChatMessage(cached.data);
    }

    // Fetch from chain
    const result = await getTransactionChunks(signature);
    if (!result?.chunks) {
      return null;
    }

    const data = reconstructData(result.chunks);
    return formatChatMessage(data);
  } catch (error) {
    console.error('Failed to read chat:', error);
    return null;
  }
}

/**
 * Format chat message with handle and timestamp
 */
function formatChatMessage(data: string): string {
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

    const messages: ChatMessage[] = [];

    for (const sig of signatures.reverse()) {
      try {
        const message = await readChat(sig.signature);
        if (message) {
          messages.push({
            handle: 'User',
            message,
            timestamp: sig.blockTime || Date.now() / 1000,
            signature: sig.signature,
          });
        }
      } catch (error) {
        console.error('Failed to read message:', error);
      }
    }

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
          const message = await readChat(logs.signature);
          if (message) {
            onMessage(message);
          }
        } catch (error) {
          console.error('Failed to process new message:', error);
        }
      },
      'finalized'
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
    const cached = await getCache(signature);
    if (cached?.data) {
      return cached.data;
    }

    const result = await getTransactionChunks(signature);
    if (!result?.chunks) {
      return null;
    }

    return reconstructData(result.chunks);
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
