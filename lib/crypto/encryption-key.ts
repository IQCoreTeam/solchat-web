'use client';

/**
 * DH encryption public key publishing + lookup, backed by UserInventory.metadata.
 *
 * The pattern matches iqprofilenet: profile JSON is uploaded via codeIn and the
 * resulting txId is stored as a pointer in UserInventory.metadata via
 * updateUserMetadata. Discovery is two RPCs: getAccountInfo on the user
 * inventory PDA, then readCodeIn on the tx signature pointed to.
 *
 * The X25519 keypair derivation (deriveX25519Keypair + HKDF constants inside
 * the SDK) is unchanged; only where we store/read the resulting public key
 * is different.
 */

import { Buffer } from 'buffer';
import { PublicKey, type Connection } from '@solana/web3.js';
import iqlabs from 'iqlabs-sdk';
import type { SignerInput } from 'iqlabs-sdk/utils';
import { getOrDeriveKeypair } from '@/lib/crypto/dm-encryption';
import { extractUserMetadata, parseMetadata } from '@/components/users/profile-helpers';
import { ROOT_ID_BYTES } from '@/lib/iqlabs/constants';

type ProfileJson = {
  name?: string;
  bio?: string;
  profilePicture?: string;
  encryptionPubKey?: string;
  [key: string]: unknown;
};

const pubKeyCache = new Map<string, string>();
const inFlightLookups = new Map<string, Promise<string | null>>();

async function readProfileJson(connection: Connection, userAddress: string): Promise<ProfileJson | null> {
  const userPda = iqlabs.contract.getUserPda(new PublicKey(userAddress));
  const info = await connection.getAccountInfo(userPda);
  if (!info) return null;
  const metadataStr = extractUserMetadata(info);
  if (!metadataStr) return null;
  return (await parseMetadata(metadataStr)) as ProfileJson | null;
}

export async function lookupEncryptionKey(
  connection: Connection,
  userAddress: string,
): Promise<string | null> {
  const cached = pubKeyCache.get(userAddress);
  if (cached) return cached;

  const existing = inFlightLookups.get(userAddress);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const profile = await readProfileJson(connection, userAddress);
      const key = typeof profile?.encryptionPubKey === 'string' ? profile.encryptionPubKey : null;
      if (key) pubKeyCache.set(userAddress, key);
      return key;
    } catch (err) {
      console.warn('[encryption-key] lookup failed for', userAddress, err);
      return null;
    }
  })().finally(() => {
    inFlightLookups.delete(userAddress);
  });
  inFlightLookups.set(userAddress, promise);
  return promise;
}

export async function ensureEncryptionKey(
  connection: Connection,
  signer: SignerInput,
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>,
): Promise<{ pubHex: string; created: boolean; signature?: string }> {
  const myAddress = signer.publicKey.toBase58();

  const existingProfile = (await readProfileJson(connection, myAddress)) ?? {};
  if (typeof existingProfile.encryptionPubKey === 'string' && existingProfile.encryptionPubKey) {
    pubKeyCache.set(myAddress, existingProfile.encryptionPubKey);
    return { pubHex: existingProfile.encryptionPubKey, created: false };
  }

  // Only derive the X25519 keypair (wallet signature prompt) when we actually
  // need to publish one. Same derivation path as before — never change this.
  const kp = await getOrDeriveKeypair(signMessage);

  const mergedProfile: ProfileJson = { ...existingProfile, encryptionPubKey: kp.pubHex };
  const txId = await iqlabs.writer.codeIn(
    { connection, signer: signer as any },
    [JSON.stringify(mergedProfile)],
    'profile-metadata',
    0,
  );
  if (!txId) throw new Error('codeIn returned no txId');

  await iqlabs.writer.updateUserMetadata(
    connection,
    signer as any,
    ROOT_ID_BYTES as unknown as Buffer,
    txId,
  );

  pubKeyCache.set(myAddress, kp.pubHex);
  return { pubHex: kp.pubHex, created: true, signature: txId };
}
