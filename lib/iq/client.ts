import { IQ_CONFIG } from './config';

/**
 * Get user database PDA from backend
 */
export async function getDBPDA(userKey: string): Promise<string> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/getDBPDA/${userKey}`);
  if (!response.ok) {
    throw new Error(`Failed to get DB PDA: ${response.statusText}`);
  }
  const data = await response.json();
  return data.pda;
}

/**
 * Get server PDA from backend
 */
export async function getServerPDA(userKey: string, serverId: string): Promise<string> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/get-server-pda/${userKey}/${serverId}`);
  if (!response.ok) {
    throw new Error(`Failed to get server PDA: ${response.statusText}`);
  }
  const data = await response.json();
  return data.pda;
}

/**
 * Initialize server/room on backend
 */
export async function createServerInitTransactionOnServer(
  userKey: string,
  serverId: string
): Promise<{ transaction: string; pda: string }> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/initialize-server`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userKey, serverId }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create server: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Initialize user account on backend
 */
export async function createInitTransactionOnServer(userKey: string): Promise<{ transaction: string }> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/initialize-user/${userKey}`);
  if (!response.ok) {
    throw new Error(`Failed to initialize user: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Create transaction for sending data
 */
export async function createCodeInTransactionOnServer(
  userKey: string,
  recipientKey: string,
  chunkData: string,
  chunkIndex: number,
  totalChunks: number,
  merkleRoot: string,
  transactionType: string,
  handle: string = 'default-handle'
): Promise<{ transaction: string }> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/create-send-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      senderKey: userKey,
      recipientKey,
      chunkData,
      chunkIndex,
      totalChunks,
      merkleRoot,
      transactionType,
      handle,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create transaction: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get transaction chunks
 */
export async function getTransactionChunks(txId: string): Promise<any> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/get_transaction_chunks/${txId}`);
  if (!response.ok) {
    throw new Error(`Failed to get transaction chunks: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Get transaction info
 */
export async function getTransactionInfo(txId: string): Promise<any> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/get_transaction_info/${txId}`);
  if (!response.ok) {
    throw new Error(`Failed to get transaction info: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Generate Merkle root
 */
export async function generateMerkleRoot(chunks: string[]): Promise<{ merkleRoot: string }> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/generate-merkle-root`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks }),
  });

  if (!response.ok) {
    throw new Error(`Failed to generate Merkle root: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Get cached data
 */
export async function getCache(txId?: string, merkleRoot?: string): Promise<any> {
  const params = new URLSearchParams();
  if (txId) params.append('txId', txId);
  if (merkleRoot) params.append('merkleRoot', merkleRoot);

  const response = await fetch(`${IQ_CONFIG.backendHost}/getCache?${params.toString()}`);
  if (!response.ok) {
    return null;
  }

  return await response.json();
}

/**
 * Put data in cache
 */
export async function putCache(data: any): Promise<void> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/putCache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error(`Failed to put cache: ${response.statusText}`);
  }
}
