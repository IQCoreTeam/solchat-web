import { IQ_CONFIG } from './config';
import {Connection, PublicKey, Transaction, TransactionInstruction} from '@solana/web3.js';

export type ServerInstructionKey = {
  pubkey: string;
  isSigner: boolean;
  isWritable: boolean;
};

export type ServerInstructionData =
  | number[]
  | string
  | { type: 'Buffer'; data: number[] };

export type ServerInstruction = {
  keys: ServerInstructionKey[];
  programId: string;
  data: ServerInstructionData;
};

export type ServerTransactionPayload = {
  feePayer: string;
  instructions: ServerInstruction[];
};

export type ServerTransactionResponse<T extends Record<string, unknown> = Record<string, unknown>> = T & {
  transaction: ServerTransactionPayload;
};

const normalizeBuffer = (data: ServerInstructionData): Buffer => {
  if (typeof data === 'string') {
    try {
      return Buffer.from(data, 'base64');
    } catch {
      return Buffer.from(data);
    }
  }

  if (Array.isArray(data)) {
    return Buffer.from(data);
  }

  if (data && typeof data === 'object' && data.type === 'Buffer' && Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }

  throw new Error('Unsupported instruction data format');
};

export const buildTransactionFromServerPayload = (payload: ServerTransactionPayload): Transaction => {
  const transaction = new Transaction();

  payload.instructions.forEach((instr) => {
    const instruction = new TransactionInstruction({
      programId: new PublicKey(instr.programId),
      keys: instr.keys.map((key) => ({
        pubkey: new PublicKey(key.pubkey),
        isSigner: key.isSigner,
        isWritable: key.isWritable,
      })),
      data: normalizeBuffer(instr.data),
    });

    transaction.add(instruction);
  });

  return transaction;
};

/**
 * Get user database PDA from backend
 */

export async function getDBPDA(userKey: string): Promise<string> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/getDBPDA/${userKey}`);
  if (!response.ok) {
    throw new Error(`Failed to get DB PDA: ${response.statusText}`);
  }
  const data = await response.json();
  return data.DBPDA ?? data.pda ?? data.PDA;
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
  return data.PDA ?? data.pda ?? data.serverPDA;
}
export async function getTransactionDataFromBlockchain(txId: string) {
    try {
        const response = await fetch(IQ_CONFIG.backendHost + `/get_transaction_result/${txId}`);
        if (response.ok) {
            try {
                return response.text();
            } catch (error) {
                console.error("Error getting transaction:", error);
                return null;
            }
        }
        console.error("Error getting transaction:", txId);
        return null;
    } catch (error) {
        console.error("Error creating initTransactionOnServer:", error);
        return null;
    }
}
/**
 * Initialize server/room on backend
 */

export async function createServerInitTransactionOnServer(
  userKey: string,
  serverId: string,
  serverType: string = 'group_chat',
  allowedMerkleRoot: string = 'public'
): Promise<ServerTransactionResponse> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/initialize-server`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userKey,
      serverType,
      serverID: serverId,
      allowedMerkleRoot,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create server: ${response.statusText}`);
  }

  return await response.json();
}

export async function _translate_transaction(connection:Connection,data: any) {
    const transaction = new Transaction();
    const latestBlockhash = await connection.getLatestBlockhash();
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.feePayer = new PublicKey(data.feePayer);

    data.instructions.forEach((instr: any) => {
        const instruction = new TransactionInstruction({
            keys: instr.keys.map((key: any) => ({
                pubkey: new PublicKey(key.pubkey),
                isSigner: key.isSigner,
                isWritable: key.isWritable,
            })),
            programId: new PublicKey(instr.programId),
            data: instr.data,
        });
        transaction.add(instruction);
    });
    return transaction;
}
/**
 * Initialize user account on backend
 */
export async function createInitTransactionOnServer(userKey: string): Promise<ServerTransactionResponse> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/initialize-user/${userKey}`);
  if (!response.ok) {
    throw new Error(`Failed to initialize user: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Create transaction for sending data
 */


export async function createDbCodeTransactionOnserver( connection:Connection, userKey: string,
    handle: string, tail_tx: string, type: string, offset: string
) {


    try {
        const response = await fetch(`${IQ_CONFIG.backendHost}/create-db-code-transaction`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userKeyString: userKey,
                handle: handle,
                tail_tx: tail_tx,
                type: type,
                offset: offset,
                // Extra metadata (ignored by current backend but kept for compatibility)

            }),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        const data: any = await response.json();
        return _translate_transaction(connection, data.transaction);

    } catch (error) {
        console.error("Failed to create transaction:", error);
        throw error;
    }
}

export async function createCodeInTransactionOnServer(
    connection:Connection,
  userKey: string,
  chunkData: string,
  beforeTx: string,
): Promise<Transaction> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/create-send-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userKeyString: userKey,
      code: chunkData,
      before_tx: beforeTx,
      method: 0,
      decode_break: 0,
      // Extra metadata (ignored by current backend but kept for compatibility)

    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create transaction: ${response.statusText}`);
  }
    const data: any = await response.json();

    return await _translate_transaction(connection, data.transaction);
}

export async function createDbPingTransactionToPDAOnServer(
  userKey: string,
  receiverPDAString: string,
  sendAmount: number,
  handle: string,
  tailTx: string,
  type: string,
  offset: string
): Promise<ServerTransactionResponse> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/create-db-ping-transaction-to-pda`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userKeyString: userKey,
      pingPdaString: receiverPDAString,
      pingAmount: sendAmount,
      handle,
      tail_tx: tailTx,
      type,
      offset,
    }),
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(`Failed to create DB ping transaction: ${details || response.statusText}`);
  }

  return await response.json();
}

/**
 * Get transaction chunks
 */
export async function getTransactionChunks(txId: string): Promise<any> {
  try {
    const response = await fetch(`${IQ_CONFIG.backendHost}/get_transaction_chunks/${txId}`);
    if (!response.ok) {
      return null;
    }
    return await response.json();
  } catch (error) {
    // Handle JSON parse errors gracefully
    return null;
  }
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
    body: JSON.stringify({ data: chunks }),
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

  try {
    const response = await fetch(`${IQ_CONFIG.backendHost}/getCache?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    // Handle JSON parse errors or network errors gracefully
    return null;
  }
}

export async function makeMerkleRootFromServer(dataList: Array<string>) {
    const url = IQ_CONFIG.backendHost + "/generate-merkle-root";
    const requestData = {
        data: dataList,
    };
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(requestData),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }

        const data: any = await response.json();

        return data.merkleRoot;

    } catch (error) {
        console.error("Failed to get Merkle Root:", error);
        throw error;
    }
}
/**
 * Put data in cache
 */
export async function putCache(chunks: string[], merkleRoot: string): Promise<void> {
  const response = await fetch(`${IQ_CONFIG.backendHost}/putCache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chunks, merkleRoot }),
  });

  if (!response.ok) {
    throw new Error(`Failed to put cache: ${response.statusText}`);
  }
}
