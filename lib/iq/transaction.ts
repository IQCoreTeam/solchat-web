import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import type { SendTransactionOptions } from '@solana/wallet-adapter-base';
import {
  createCodeInTransactionOnServer,
  createDbPingTransactionToPDAOnServer,
  createInitTransactionOnServer,
  createServerInitTransactionOnServer,
  buildTransactionFromServerPayload,
  getServerPDA,
} from './client';
import type { ServerTransactionPayload } from './client';
import { chunkData } from './utils';
import { generateMerkleRoot } from './client';

export type WalletExecutor = {
  publicKey: PublicKey;
  signTransaction?: (tx: Transaction) => Promise<Transaction>;
  sendTransaction?: (
    tx: Transaction,
    connection: Connection,
    options?: SendTransactionOptions
  ) => Promise<string>;
};

/**
 * Sign and send a transaction
 */
type TransactionPayload = string | Transaction | ServerTransactionPayload;

const isServerPayload = (payload: unknown): payload is ServerTransactionPayload => {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    Array.isArray((payload as ServerTransactionPayload).instructions)
  );
};

export async function appTxSend(
  connection: Connection,
  txPayload: TransactionPayload,
  wallet: WalletExecutor
): Promise<string> {
  try {
    let transaction: Transaction;
    if (typeof txPayload === 'string') {
      const txBuffer = Buffer.from(txPayload, 'base64');
      transaction = Transaction.from(txBuffer);
    } else if (txPayload instanceof Transaction) {
      transaction = txPayload;
    } else if (isServerPayload(txPayload)) {
      transaction = buildTransactionFromServerPayload(txPayload);
    } else {
      throw new Error('Unsupported transaction payload format');
    }

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    let signature: string;
    if (wallet.sendTransaction) {
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'finalized',
      });
    } else if (wallet.signTransaction) {
      const signedTx = await wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'finalized',
      });
    } else {
      throw new Error('Wallet must support sendTransaction or signTransaction');
    }

    // Confirm transaction
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'finalized');

    return signature;
  } catch (error) {
    console.error('Transaction failed:', error);
    throw error;
  }
}

/**
 * Initialize user account (create PDA)
 */
export async function initializeUser(
  connection: Connection,
  wallet: WalletExecutor
): Promise<string> {
  try {
    const userKey = wallet.publicKey.toBase58();
    const { transaction } = await createInitTransactionOnServer(userKey);
    const txid = await appTxSend(connection, transaction, wallet);
    console.log('User initialized:', txid);
    return txid;
  } catch (error) {
    console.error('Failed to initialize user:', error);
    throw error;
  }
}

/**
 * Initialize server/room
 */
export async function initializeServer(
  connection: Connection,
  wallet: WalletExecutor,
  serverId: string
): Promise<{ pda: string; txid: string }> {
  try {
    const userKey = wallet.publicKey.toBase58();
    const { transaction } = await createServerInitTransactionOnServer(userKey, serverId);
    const txid = await appTxSend(connection, transaction, wallet);
    const pda = await getServerPDA(userKey, serverId);
    console.log('Server initialized:', { pda, txid });
    return { pda, txid };
  } catch (error) {
    console.error('Failed to initialize server:', error);
    throw error;
  }
}

/**
 * Send data to PDA (chat message)
 */
export async function codeToPDA(
  connection: Connection,
  wallet: WalletExecutor,
  data: string,
  transactionType: string,
  handle: string,
  pdaString: string,
  sendAmount: number = 0
): Promise<string> {
  try {
    const userKey = wallet.publicKey.toBase58();
    const chunks = chunkData(data);
    const chunkList = chunks.length ? chunks : [''];
    const { merkleRoot } = await generateMerkleRoot(chunkList);

    let previousTxSignature = 'Genesis';

    for (let i = 0; i < chunkList.length; i++) {
      let sent = false;
      while (!sent) {
        try {
          const { transaction } = await createCodeInTransactionOnServer(
            userKey,
            chunkList[i],
            previousTxSignature,
            i,
            chunkList.length,
            merkleRoot,
            transactionType,
            handle
          );
          previousTxSignature = await appTxSend(connection, transaction, wallet);
          sent = true;
        } catch (error) {
          console.error('Chunk transaction failed, retrying...', error);
        }
      }
    }

    const { transaction } = await createDbPingTransactionToPDAOnServer(
      userKey,
      pdaString,
      sendAmount,
      handle,
      previousTxSignature,
      transactionType,
      merkleRoot
    );

    return await appTxSend(connection, transaction, wallet);
  } catch (error) {
    console.error('Failed to send data to PDA:', error);
    throw error;
  }
}

/**
 * Send chat message
 */
export async function sendChat(
  connection: Connection,
  wallet: WalletExecutor,
  pdaString: string,
  message: string,
  handle: string = 'default-handle',
  sendAmount: number = 0
): Promise<string> {
  try {
    const txid = await codeToPDA(connection, wallet, message, 'group_chat', handle, pdaString, sendAmount);
    console.log(`txid: ${txid}`);
    console.log(`Message sent to PDA ${pdaString}: ${message}`);
    return txid;
  } catch (error) {
    console.error('Failed to send chat:', error);
    throw error;
  }
}

/**
 * Request airdrop
 */
export async function requestAirdrop(
  connection: Connection,
  publicKey: PublicKey,
  amount: number = 1
): Promise<string> {
  try {
    const signature = await connection.requestAirdrop(
      publicKey,
      amount * LAMPORTS_PER_SOL
    );

    await connection.confirmTransaction(signature, 'finalized');
    return signature;
  } catch (error) {
    console.error('Airdrop failed:', error);
    throw error;
  }
}

/**
 * Send SOL
 */
export async function sendSol(
  connection: Connection,
  wallet: WalletExecutor,
  to: PublicKey,
  amount: number
): Promise<string> {
  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: to,
        lamports: amount * LAMPORTS_PER_SOL,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    let signature: string;
    if (wallet.sendTransaction) {
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'finalized',
      });
    } else if (wallet.signTransaction) {
      const signed = await wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error('Wallet must support sendTransaction or signTransaction');
    }

    await connection.confirmTransaction(signature, 'finalized');

    return signature;
  } catch (error) {
    console.error('Failed to send SOL:', error);
    throw error;
  }
}
