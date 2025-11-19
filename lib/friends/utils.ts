/**
 * Friends Feature Utilities
 * - Helper functions for DM/friends operations
 */

import { PublicKey } from '@solana/web3.js';

/**
 * Sort two public keys alphabetically
 */
export function sortPubkeys(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/**
 * Derive deterministic DM seed from two wallet addresses
 * - Seeds are derived from sorted addresses for consistency
 */
export function deriveDmSeed(userA: string, userB: string): Uint8Array {
  const [sortedA, sortedB] = sortPubkeys(userA, userB);
  const pubkeyA = new PublicKey(sortedA);
  const pubkeyB = new PublicKey(sortedB);

  // Use first 16 bytes of each pubkey to create 32-byte seed
  const seed = new Uint8Array(32);
  seed.set(pubkeyA.toBytes().slice(0, 16), 0);
  seed.set(pubkeyB.toBytes().slice(0, 16), 16);

  return seed;
}

/**
 * Convert bytes to hex string
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Shorten wallet address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/**
 * Derive avatar color from wallet address
 * - Generates consistent color hue for each address
 */
export function deriveAvatarHue(address: string): number {
  if (!address) return 160;

  let hash = 0;
  for (let i = 0; i < address.length; i += 1) {
    hash = (hash << 5) - hash + address.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return Math.abs(hash) % 360;
}
