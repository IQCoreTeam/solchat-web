import { test, expect } from 'bun:test';
import {
  Keypair,
  SystemProgram,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { signTransactionWithPreflight } from '../lib/wallet/transaction-preflight';
import { sendTx } from '../lib/iqlabs/send-tx';

const signer = Keypair.generate();
const blockhash = Keypair.generate().publicKey.toBase58();
const instruction = SystemProgram.transfer({
  fromPubkey: signer.publicKey,
  toPubkey: signer.publicKey,
  lamports: 1,
});
function transaction() {
  return new Transaction({
    feePayer: signer.publicKey,
    recentBlockhash: blockhash,
  }).add(instruction);
}

test('failed simulation stops before requesting a wallet signature', async () => {
  let prompts = 0;
  await expect(
    signTransactionWithPreflight(
      {
        simulateTransaction: async () => ({
          value: { err: 'AccountNotFound', logs: [] },
        }),
      },
      transaction(),
      async (tx) => {
        prompts++;
        return tx;
      },
    ),
  ).rejects.toThrow('AccountNotFound');
  expect(prompts).toBe(0);
});

test('RPC failure stops before signing; there is no silent skip fallback', async () => {
  let prompts = 0;
  await expect(
    signTransactionWithPreflight(
      {
        simulateTransaction: async () => {
          throw Error('RPC unavailable');
        },
      },
      transaction(),
      async (tx) => {
        prompts++;
        return tx;
      },
    ),
  ).rejects.toThrow('RPC unavailable');
  expect(prompts).toBe(0);
});

test('legacy simulation preserves the original message and existing signatures', async () => {
  const tx = transaction();
  tx.partialSign(signer);
  const original = tx.serialize();
  let simulated;
  const result = await signTransactionWithPreflight(
    {
      simulateTransaction: async (candidate, options) => {
        simulated = candidate;
        expect(options).toEqual({ sigVerify: false, commitment: 'confirmed' });
        return { value: { err: null } };
      },
    },
    tx,
    async (candidate) => candidate,
  );
  expect(result).toBe(tx);
  expect(tx.serialize()).toEqual(original);
  expect(Buffer.from(simulated.message.serialize())).toEqual(
    tx.serializeMessage(),
  );
});

test('versioned transactions are simulated before passing the original to the wallet', async () => {
  const tx = new VersionedTransaction(
    new TransactionMessage({
      payerKey: signer.publicKey,
      recentBlockhash: blockhash,
      instructions: [instruction],
    }).compileToV0Message(),
  );
  const order = [];
  await signTransactionWithPreflight(
    {
      simulateTransaction: async (candidate) => {
        expect(candidate).toBe(tx);
        order.push('simulate');
        return { value: { err: null } };
      },
    },
    tx,
    async (candidate) => {
      expect(candidate).toBe(tx);
      order.push('sign');
      return candidate;
    },
  );
  expect(order).toEqual(['simulate', 'sign']);
});

test('confirmed instruction failure cannot be reported as success', async () => {
  let options, strategy;
  const connection = {
    getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 10 }),
    sendRawTransaction: async (_, opts) => {
      options = opts;
      return 'synthetic-signature';
    },
    confirmTransaction: async (value) => {
      strategy = value;
      return { value: { err: { InstructionError: [0, 'Custom'] } } };
    },
  };
  await expect(sendTx(connection, signer, instruction)).rejects.toThrow(
    'Transaction failed on-chain',
  );
  expect(options).toEqual({
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });
  expect(strategy).toEqual({
    signature: 'synthetic-signature',
    blockhash,
    lastValidBlockHeight: 10,
  });
});

test('submission preflight errors stop before confirmation', async () => {
  let confirmations = 0;
  const connection = {
    getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 10 }),
    sendRawTransaction: async () => {
      throw Error('simulation rejected');
    },
    confirmTransaction: async () => {
      confirmations++;
    },
  };
  await expect(sendTx(connection, signer, instruction)).rejects.toThrow(
    'simulation rejected',
  );
  expect(confirmations).toBe(0);
});

test('successful submission returns only after successful confirmation', async () => {
  const order = [];
  const connection = {
    getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 10 }),
    sendRawTransaction: async () => {
      order.push('submit');
      return 'synthetic-signature';
    },
    confirmTransaction: async () => {
      order.push('confirm');
      return { value: { err: null } };
    },
  };
  expect(await sendTx(connection, signer, instruction)).toBe(
    'synthetic-signature',
  );
  expect(order).toEqual(['submit', 'confirm']);
});

for (const [name, receipt, succeeds] of [
  [
    'finalized successful receipt',
    { confirmationStatus: 'finalized', err: null },
    true,
  ],
  [
    'confirmed successful receipt',
    { confirmationStatus: 'confirmed', err: null },
    true,
  ],
  ['processed receipt', { confirmationStatus: 'processed', err: null }, false],
  ['missing receipt', null, false],
  [
    'failed finalized receipt',
    {
      confirmationStatus: 'finalized',
      err: { InstructionError: [0, 'Custom'] },
    },
    false,
  ],
])
  test(`expired confirmation checks ${name} without resending`, async () => {
    let submissions = 0,
      checks = 0;
    const expiry = new Error('block height exceeded');
    expiry.name = 'TransactionExpiredBlockheightExceededError';
    const connection = {
      getLatestBlockhash: async () => ({ blockhash, lastValidBlockHeight: 10 }),
      sendRawTransaction: async () => {
        submissions++;
        return 'synthetic-signature';
      },
      confirmTransaction: async () => {
        throw expiry;
      },
      getSignatureStatuses: async (signatures, options) => {
        checks++;
        expect(signatures).toEqual(['synthetic-signature']);
        expect(options).toEqual({ searchTransactionHistory: true });
        return { value: [receipt] };
      },
    };
    if (succeeds)
      expect(await sendTx(connection, signer, instruction)).toBe(
        'synthetic-signature',
      );
    else
      await expect(sendTx(connection, signer, instruction)).rejects.toThrow(
        receipt?.err ? 'Transaction failed on-chain' : 'block height exceeded',
      );
    expect(submissions).toBe(1);
    expect(checks).toBe(1);
  });
