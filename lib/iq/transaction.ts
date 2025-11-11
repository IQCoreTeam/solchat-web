import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { createCodeInTransactionOnServer, createInitTransactionOnServer, createServerInitTransactionOnServer } from './client';
import { chunkData } from './utils';
import { generateMerkleRoot } from './client';

/**
 * Sign and send a transaction
 */
export async function appTxSend(
  connection: Connection,
  txBase64: string,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }
): Promise<string> {
  try {
    const txBuffer = Buffer.from(txBase64, 'base64');
    const transaction = Transaction.from(txBuffer);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign transaction
    const signedTx = await wallet.signTransaction(transaction);

    // Send transaction
    const signature = await connection.sendRawTransaction(signedTx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'finalized',
    });

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
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> }
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
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  serverId: string
): Promise<{ pda: string; txid: string }> {
  try {
    const userKey = wallet.publicKey.toBase58();
    const { transaction, pda } = await createServerInitTransactionOnServer(userKey, serverId);
    const txid = await appTxSend(connection, transaction, wallet);
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
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  data: string,
  transactionType: string,
  handle: string,
  pdaString: string,
  threshold: number = 0
): Promise<string> {
  try {
    const userKey = wallet.publicKey.toBase58();
    const chunks = chunkData(data);

    if (chunks.length === 1 && chunks[0].length <= threshold) {
      // Single small transaction
      const { merkleRoot } = await generateMerkleRoot(chunks);
      const { transaction } = await createCodeInTransactionOnServer(
        userKey,
        pdaString,
        chunks[0],
        0,
        1,
        merkleRoot,
        transactionType,
        handle
      );
      return await appTxSend(connection, transaction, wallet);
    }

    // Multiple transactions
    const { merkleRoot } = await generateMerkleRoot(chunks);
    const txids: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const { transaction } = await createCodeInTransactionOnServer(
        userKey,
        pdaString,
        chunks[i],
        i,
        chunks.length,
        merkleRoot,
        transactionType,
        handle
      );
      const txid = await appTxSend(connection, transaction, wallet);
      txids.push(txid);
    }

    return txids[txids.length - 1]; // Return last txid
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
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  pdaString: string,
  message: string,
  handle: string = 'default-handle'
): Promise<string> {
  try {
    const txid = await codeToPDA(connection, wallet, message, 'group_chat', handle, pdaString, 0);
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
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
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

    const signed = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(signature, 'finalized');

    return signature;
  } catch (error) {
    console.error('Failed to send SOL:', error);
    throw error;
  }
}
