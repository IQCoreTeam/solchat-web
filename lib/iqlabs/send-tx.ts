import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/utils';

export type { SignerInput };

function toSignable(signer: SignerInput) {
    if ('signTransaction' in signer) return signer;
    const kp = signer as Keypair;
    return {
        publicKey: kp.publicKey,
        signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
    };
}

export async function sendTx(
    connection: Connection,
    signer: SignerInput,
    instructions: TransactionInstruction | TransactionInstruction[],
): Promise<string> {
    const wallet = toSignable(signer);
    const tx = new Transaction();
    if (Array.isArray(instructions)) tx.add(...instructions);
    else tx.add(instructions);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = wallet.publicKey;
    const signed = await wallet.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false, preflightCommitment: 'confirmed',
    });
    let error;
    try {
        const confirmation = await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight }, 'confirmed',
        );
        error = confirmation.value.err;
    } catch (expiry) {
        if (!(expiry instanceof Error) || expiry.name !== 'TransactionExpiredBlockheightExceededError') throw expiry;
        // Wallets can augment the transaction. A finalized receipt outranks
        // expiration of the blockhash used before the wallet signed it.
        const receipt = (await connection.getSignatureStatuses([signature], { searchTransactionHistory: true })).value[0];
        if (!receipt || !['confirmed', 'finalized'].includes(receipt.confirmationStatus ?? '')) throw expiry;
        error = receipt.err;
    }
    if (error) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(error)}`);
    }
    return signature;
}

export async function ensureUserInitialized(
    connection: Connection,
    signer: SignerInput,
    builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>,
    accounts: {
        user: PublicKey;
        code_account: PublicKey;
        user_state: PublicKey;
        user_inventory: PublicKey;
        system_program: PublicKey;
    },
): Promise<void> {
    const info = await connection.getAccountInfo(accounts.user_inventory);
    if (info) return;
    const ix = iqlabs.contract.userInitializeInstruction(builder, accounts);
    await sendTx(connection, signer, ix);
}
