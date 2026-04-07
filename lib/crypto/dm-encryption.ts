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
  multiEncrypt,
  multiDecrypt,
  bytesToHex,
} from 'iqlabs-sdk/crypto';
import type { MultiEncryptResult } from 'iqlabs-sdk/crypto';

export type EncryptedDmPayload = {
  enc: 'dh-multi';
  r: MultiEncryptResult['recipients'];
  iv: string;
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
 * Encrypt a DM for both sender and recipient (both can decrypt).
 * Uses multi-recipient encryption: content encrypted once, key wrapped per participant.
 */
export async function encryptDmPayload(
  senderPubHex: string,
  recipientPubHex: string,
  payload: Record<string, unknown>
): Promise<string> {
  const plaintext = encoder.encode(JSON.stringify(payload));
  const result = await multiEncrypt([senderPubHex, recipientPubHex], plaintext);

  return JSON.stringify({
    enc: 'dh-multi',
    r: result.recipients,
    iv: result.iv,
    ct: result.ciphertext,
  });
}

export async function decryptDmPayload(
  privKey: Uint8Array,
  pubHex: string,
  data: string
): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(data);
    if (parsed?.enc !== 'dh-multi') return null;
    const { r, iv, ct } = parsed;
    if (!r || !iv || !ct) return null;
    const plainBytes = await multiDecrypt(privKey, pubHex, { recipients: r, iv, ciphertext: ct });
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
    return parsed?.enc === 'dh-multi';
  } catch {
    return false;
  }
}
