'use client';

import { Buffer } from 'buffer';
import { Connection, PublicKey } from '@solana/web3.js';
import { BorshInstructionCoder } from '@coral-xyz/anchor';
import iqlabs from 'iqlabs-sdk';
import { IQ_IDL } from 'iqlabs-sdk/contract';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { runWithRpcRateLimit } from '@/lib/utils/rpc-request-queue';

const LOCKER_KEY_FILENAME = 'locker-key.json';
const LOCKER_KEY_TYPE = 'iq-locker-key-v1';

const CODE_IN_INSTRUCTION_NAMES = new Set([
  'user_inventory_code_in',
  'user_inventory_code_in_for_free',
  'db_code_in',
  'db_instruction_code_in',
  'wallet_connection_code_in',
]);

const NEGATIVE_CACHE_TTL = 60_000;
const dhKeyCache = new Map<string, string>();
const dhKeyNegativeCache = new Map<string, number>();
const inFlightLookups = new Map<string, Promise<string | null>>();

const instructionCoder = new BorshInstructionCoder(IQ_IDL as any);
const PROGRAM_ID = new PublicKey(iqlabs.contract.DEFAULT_ANCHOR_PROGRAM_ID);

function extractLockerKeyFromTx(tx: any): string | null {
  try {
    const message = tx?.transaction?.message;
    if (!message) return null;
    const accountKeys = message.getAccountKeys();
    for (const ix of message.compiledInstructions) {
      const programKey = accountKeys.get(ix.programIdIndex);
      if (!programKey || !programKey.equals(PROGRAM_ID)) continue;
      const decoded = instructionCoder.decode(Buffer.from(ix.data));
      if (!decoded || !CODE_IN_INSTRUCTION_NAMES.has(decoded.name)) continue;
      const data: any = decoded.data;

      // Peek at metadata only — avoid following any on_chain_path chunks.
      let metaStr: string | undefined;
      if (typeof data?.metadata === 'string') {
        metaStr = data.metadata;
      } else if (data?.metadata) {
        try {
          metaStr = Buffer.from(data.metadata).toString('utf8');
        } catch {
          continue;
        }
      }
      if (!metaStr) continue;

      let meta: any;
      try {
        meta = JSON.parse(metaStr);
      } catch {
        continue;
      }
      if (meta?.filename !== LOCKER_KEY_FILENAME) continue;

      // The payload is stored inline in the metadata under `data`.
      const inline = typeof meta.data === 'string' ? meta.data : null;
      if (!inline) return null;
      try {
        const parsed = JSON.parse(inline);
        if (parsed?.t === LOCKER_KEY_TYPE && typeof parsed.k === 'string') {
          return parsed.k;
        }
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

async function doLookup(connection: Connection, walletAddress: string): Promise<string | null> {
  const endpoint = connection.rpcEndpoint;
  try {
    const pubkey = new PublicKey(walletAddress);
    const inventoryPda = iqlabs.contract.getUserInventoryPda(pubkey);
    const signatures = await runWithRpcRateLimit(
      () => connection.getSignaturesForAddress(inventoryPda, { limit: 20 }),
      { endpoint, queueKey: 'dh-key-lookup', maxPerSecond: 3 },
    );
    for (const sig of signatures) {
      let tx;
      try {
        tx = await runWithRpcRateLimit(
          () => connection.getTransaction(sig.signature, { maxSupportedTransactionVersion: 0 }),
          { endpoint, queueKey: 'dh-key-lookup', maxPerSecond: 3 },
        );
      } catch {
        continue;
      }
      if (!tx) continue;
      const key = extractLockerKeyFromTx(tx);
      if (key) return key;
    }
  } catch (err) {
    console.warn('[dh-key] lookupDhKey failed for', walletAddress, err);
  }
  return null;
}

export async function lookupDhKey(connection: Connection, walletAddress: string): Promise<string | null> {
  const cached = dhKeyCache.get(walletAddress);
  if (cached) return cached;

  const negTs = dhKeyNegativeCache.get(walletAddress);
  if (negTs && Date.now() - negTs < NEGATIVE_CACHE_TTL) return null;

  const existing = inFlightLookups.get(walletAddress);
  if (existing) return existing;

  const promise = doLookup(connection, walletAddress).then((result) => {
    if (result) {
      dhKeyCache.set(walletAddress, result);
      dhKeyNegativeCache.delete(walletAddress);
    } else {
      dhKeyNegativeCache.set(walletAddress, Date.now());
    }
    return result;
  }).finally(() => {
    inFlightLookups.delete(walletAddress);
  });
  inFlightLookups.set(walletAddress, promise);
  return promise;
}

export async function registerDhKey(
  connection: Connection,
  signer: SignerInput,
  pubHex: string,
): Promise<string> {
  const payload = JSON.stringify({ t: LOCKER_KEY_TYPE, k: pubHex });
  return iqlabs.writer.codeIn(
    { connection, signer: signer as any },
    payload,
    LOCKER_KEY_FILENAME,
    0,
    'application/json',
  );
}

export async function ensureMyDhKey(
  connection: Connection,
  signer: SignerInput,
  pubHex: string,
): Promise<{ created: boolean; signature?: string }> {
  const myAddress = signer.publicKey.toBase58();
  const existing = await lookupDhKey(connection, myAddress);
  if (existing === pubHex) {
    return { created: false };
  }
  const signature = await registerDhKey(connection, signer, pubHex);
  dhKeyCache.set(myAddress, pubHex);
  return { created: true, signature };
}
