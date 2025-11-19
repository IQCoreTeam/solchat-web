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
  signAllTransactions?: (txs: Transaction[]) => Promise<Transaction[]>;
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
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    let signature: string;
    if (wallet.sendTransaction) {
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
    } else if (wallet.signTransaction) {
      const signedTx = await wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
    } else {
      throw new Error('Wallet must support sendTransaction or signTransaction');
    }

    // Confirm transaction
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'processed');

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
 * Optimized with parallel prep and faster transaction flow
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

    // Parallelize independent operations (merkleRoot generation and blockhash fetching)
    console.log('Preparing transaction data...');
    const [{ merkleRoot }, { blockhash, lastValidBlockHeight }] = await Promise.all([
      generateMerkleRoot(chunkList),
      connection.getLatestBlockhash('processed'),
    ]);

    console.log(`Sending ${chunkList.length} chunk(s)...`);
    let previousTxSignature = 'Genesis';

    // Process chunks: build, sign, and send immediately
    // This minimizes latency by not waiting for confirmations between build and send
    for (let i = 0; i < chunkList.length; i++) {
      let sent = false;
      let retryCount = 0;
      const MAX_RETRIES = 3;

      while (!sent && retryCount < MAX_RETRIES) {
        try {
          // Build transaction with actual previous signature
          const { transaction: txPayload } = await createCodeInTransactionOnServer(
            userKey,
            chunkList[i],
            previousTxSignature,
            i,
            chunkList.length,
            merkleRoot,
            transactionType,
            handle
          );

          const tx = buildTransactionFromServerPayload(txPayload);
          tx.recentBlockhash = blockhash;
          tx.feePayer = wallet.publicKey;

          // Sign transaction
          let signedTx: Transaction;
          if (wallet.sendTransaction && i === 0) {
            // For first chunk, use sendTransaction if available (wallet handles signing)
            const signature = await wallet.sendTransaction(tx, connection, {
              skipPreflight: false,
              preflightCommitment: 'processed',
            });

            await connection.confirmTransaction({
              signature,
              blockhash,
              lastValidBlockHeight,
            }, 'processed');

            console.log(`Chunk ${i + 1}/${chunkList.length} sent:`, signature);
            previousTxSignature = signature;
            sent = true;
            continue;
          } else if (wallet.signTransaction) {
            signedTx = await wallet.signTransaction(tx);
          } else {
            throw new Error('Wallet must support signTransaction or sendTransaction');
          }

          // Send and confirm
          const signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'processed',
          });

          await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
          }, 'processed');

          console.log(`Chunk ${i + 1}/${chunkList.length} sent:`, signature);
          previousTxSignature = signature;
          sent = true;
        } catch (error: any) {
          const errorMessage = error?.message || String(error);

          // Check for fatal errors that shouldn't retry
          if (
            errorMessage.includes('Attempt to debit an account but found no record of a prior credit') ||
            errorMessage.includes('insufficient funds') ||
            errorMessage.includes('insufficient lamports')
          ) {
            console.error('❌ Insufficient balance - cannot send transaction');
            throw new Error('Insufficient SOL balance. Please add SOL to your wallet and try again.');
          }

          // Check for program/account errors that won't resolve with retries
          if (
            errorMessage.includes('AccountNotInitialized') ||
            errorMessage.includes('account to be already initialized') ||
            errorMessage.includes('custom program error') ||
            errorMessage.includes('AccountNotFound') ||
            errorMessage.includes('InvalidAccountData')
          ) {
            console.error('❌ Program/Account error - retrying will not help');
            throw new Error('Chat room not properly initialized. Please create or join a valid room first.');
          }

          retryCount++;
          console.error(`Chunk ${i + 1} failed (attempt ${retryCount}/${MAX_RETRIES}):`, errorMessage);

          if (retryCount >= MAX_RETRIES) {
            throw new Error(`Failed to send chunk ${i + 1} after ${MAX_RETRIES} attempts: ${errorMessage}`);
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Build and send final DbCodeIn transaction with the actual last chunk signature
    console.log('Sending final DbCodeIn transaction...');
    const { transaction: finalTxPayload } = await createDbPingTransactionToPDAOnServer(
      userKey,
      pdaString,
      sendAmount,
      handle,
      previousTxSignature,
      transactionType,
      merkleRoot
    );

    const finalSignature = await appTxSend(connection, finalTxPayload, wallet);
    console.log('Message sent successfully:', finalSignature);
    return finalSignature;
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

    await connection.confirmTransaction(signature, 'processed');
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

    const { blockhash } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    let signature: string;
    if (wallet.sendTransaction) {
      signature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: 'processed',
      });
    } else if (wallet.signTransaction) {
      const signed = await wallet.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize());
    } else {
      throw new Error('Wallet must support sendTransaction or signTransaction');
    }

    await connection.confirmTransaction(signature, 'processed');

    return signature;
  } catch (error) {
    console.error('Failed to send SOL:', error);
    throw error;
  }
}
