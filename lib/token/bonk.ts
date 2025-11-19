import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { BONK_MINT } from '../constants';

/**
 * Send BONK tokens to a recipient
 */
export async function sendBonk(
  connection: Connection,
  wallet: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> },
  recipientAddress: string,
  amount: number
): Promise<string> {
  try {
    const recipient = new PublicKey(recipientAddress);
    const bonkMint = new PublicKey(BONK_MINT);

    // BONK has 9 decimals
    const bonkDecimals = 9;
    const bonkAmount = Math.floor(amount * Math.pow(10, bonkDecimals));

    // Get or create sender's ATA
    const senderAta = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet as any, // Type compatibility
      bonkMint,
      wallet.publicKey
    );

    // Get or create recipient's ATA
    const recipientAta = await getOrCreateAssociatedTokenAccount(
      connection,
      wallet as any,
      bonkMint,
      recipient
    );

    // Create transfer instruction
    const transaction = new Transaction().add(
      createTransferInstruction(
        senderAta.address,
        recipientAta.address,
        wallet.publicKey,
        bonkAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('processed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;

    // Sign and send
    const signed = await wallet.signTransaction(transaction);
    const signature = await connection.sendRawTransaction(signed.serialize());
    await connection.confirmTransaction(signature, 'processed');

    console.log(`Sent ${amount} BONK to ${recipientAddress}:`, signature);
    return signature;
  } catch (error) {
    console.error('Failed to send BONK:', error);
    throw error;
  }
}

/**
 * Get BONK token balance
 */
export async function getBonkBalance(
  connection: Connection,
  publicKey: PublicKey
): Promise<number> {
  try {
    const bonkMint = new PublicKey(BONK_MINT);
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
      mint: bonkMint,
    });

    if (tokenAccounts.value.length === 0) {
      return 0;
    }

    const balance = tokenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
    return balance || 0;
  } catch (error) {
    console.error('Failed to get BONK balance:', error);
    return 0;
  }
}
