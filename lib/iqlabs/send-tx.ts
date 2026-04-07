commit 05cfbe3f31f2f35f2f9aca04eeef3d7983d14c25
Author: sumin <dwckey5356@gmail.com>
Date:   Mon Apr 6 18:44:55 2026 +0900

    feat: upgrade SDK, remove IDL/programId boilerplate, add table_hint, local sendTx

diff --git a/lib/iqlabs/send-tx.ts b/lib/iqlabs/send-tx.ts
new file mode 100644
index 0000000..f7bbd72
--- /dev/null
+++ b/lib/iqlabs/send-tx.ts
@@ -0,0 +1,52 @@
+import { Connection, Keypair, PublicKey, Transaction, type TransactionInstruction } from '@solana/web3.js';
+import iqlabs from 'iqlabs-sdk';
+import type { SignerInput } from 'iqlabs-sdk/utils';
+
+export type { SignerInput };
+
+function toSignable(signer: SignerInput) {
+    if ('signTransaction' in signer) return signer;
+    const kp = signer as Keypair;
+    return {
+        publicKey: kp.publicKey,
+        signTransaction: async (tx: Transaction) => { tx.partialSign(kp); return tx; },
+    };
+}
+
+export async function sendTx(
+    connection: Connection,
+    signer: SignerInput,
+    instructions: TransactionInstruction | TransactionInstruction[],
+    skipConfirmation = false,
+): Promise<string> {
+    const wallet = toSignable(signer);
+    const tx = new Transaction();
+    if (Array.isArray(instructions)) tx.add(...instructions);
+    else tx.add(instructions);
+    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
+    tx.feePayer = wallet.publicKey;
+    const signed = await wallet.signTransaction(tx);
+    const sig = await connection.sendRawTransaction(signed.serialize());
+    if (!skipConfirmation) {
+        await connection.confirmTransaction(sig, 'confirmed');
+    }
+    return sig;
+}
+
+export async function ensureUserInitialized(
+    connection: Connection,
+    signer: SignerInput,
+    builder: ReturnType<typeof iqlabs.contract.createInstructionBuilder>,
+    accounts: {
+        user: PublicKey;
+        code_account: PublicKey;
+        user_state: PublicKey;
+        user_inventory: PublicKey;
+        system_program: PublicKey;
+    },
+): Promise<void> {
+    const info = await connection.getAccountInfo(accounts.user_inventory);
+    if (info) return;
+    const ix = iqlabs.contract.userInitializeInstruction(builder, accounts);
+    await sendTx(connection, signer, ix);
+}
