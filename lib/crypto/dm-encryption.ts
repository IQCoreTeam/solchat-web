'use client';

/**
 * DM encryption/decryption using iqlabs-sdk crypto primitives.
 *
 * Key derivation: wallet signMessage → deterministic X25519 keypair
 * Encryption: ephemeral ECDH → HKDF → AES-256-GCM
 * Key storage: encryption pubkey stored in user profile metadata on-chain
 */

import {
  deriveX25519Keypair,
  dhEncrypt,
  dhDecrypt,
  bytesToHex,
} from 'iqlabs-sdk/dist/sdk/crypto';
import type { DhEncryptResult } from 'iqlabs-sdk/dist/sdk/crypto';

export type EncryptedDmPayload = {
  /** Marks this as an encrypted DM */
  enc: 'dh';
  /** Ephemeral sender public key (hex) */
  sp: string;
  /** AES-GCM initialization vector (hex) */
  iv: string;
  /** Ciphertext (hex) */
  ct: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// In-memory cache for derived keypair (per session)
let cachedKeypair: { privKey: Uint8Array; pubKey: Uint8Array; pubHex: string } | null = null;

/**
 * Derive and cache the user's X25519 keypair from their wallet.
 * Only prompts for signature once per session.
 */
export async function getOrDeriveKeypair(
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>
): Promise<{ privKey: Uint8Array; pubKey: Uint8Array; pubHex: string }> {
  if (cachedKeypair) return cachedKeypair;

  const { privKey, pubKey } = await deriveX25519Keypair(signMessage);
  cachedKeypair = { privKey, pubKey, pubHex: bytesToHex(pubKey) };
  return cachedKeypair;
}

/** Clear cached keypair (on disconnect/logout). */
export function clearCachedKeypair() {
  cachedKeypair = null;
}

/** Check if keypair is already derived (no signature needed). */
export function hasKeypair(): boolean {
  return cachedKeypair !== null;
}

/**
 * Encrypt a DM message payload for a recipient.
 * Returns a JSON string ready for writeConnectionRow.
 */
export async function encryptDmPayload(
  recipientPubHex: string,
  payload: Record<string, unknown>
): Promise<string> {
  const plaintext = encoder.encode(JSON.stringify(payload));
  const result: DhEncryptResult = await dhEncrypt(recipientPubHex, plaintext);

  const encPayload: EncryptedDmPayload = {
    enc: 'dh',
    sp: result.senderPub,
    iv: result.iv,
    ct: result.ciphertext,
  };

  return JSON.stringify(encPayload);
}

/**
 * Try to decrypt a DM message. Returns the decrypted JSON object,
 * or null if decryption fails (wrong key, not encrypted, etc).
 */
export async function decryptDmPayload(
  privKey: Uint8Array,
  data: string
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(data);
    if (!parsed || parsed.enc !== 'dh') return null;

    const { sp, iv, ct } = parsed as EncryptedDmPayload;
    if (!sp || !iv || !ct) return null;

    const plainBytes = await dhDecrypt(privKey, sp, iv, ct);
    return JSON.parse(decoder.decode(plainBytes));
  } catch {
    return null;
  }
}

/**
 * Check if a data string looks like an encrypted DM payload.
 */
export function isEncryptedDm(data: string): boolean {
  try {
    const parsed = JSON.parse(data);
    return parsed?.enc === 'dh';
  } catch {
    return false;
  }
}
