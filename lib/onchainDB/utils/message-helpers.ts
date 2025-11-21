/**
 * Message and data transformation helpers for onchain DB
 */

import { Buffer } from 'buffer';
import { sortPubkeys, deriveDmSeed } from '@/lib/friends/utils';
import { deriveAvatarHue } from '@/lib/utils/message-utils';
import type { Row } from '@/lib/onchainDB/web/cached-reader-integration';

const DECODER = new TextDecoder();
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

export type MessageRow = {
  id: string;
  text: string;
  file?: string;
  signature?: string;
  sender?: string;
  displayName?: string;
  avatarHue?: number;
  timestamp?: number;
  status?: 'pending' | 'sent' | 'confirmed' | 'failed';
  room?: string;
};

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex');
}

export function normalizeBytes(value: any): Uint8Array {
  if (!value) return new Uint8Array();
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === 'object' && Array.isArray(value.data)) {
    return Uint8Array.from(value.data);
  }
  return new Uint8Array();
}

export function decodeBytes(value: any): string {
  try {
    const bytes = normalizeBytes(value);
    if (!bytes.length) return '';
    const decoded = DECODER.decode(bytes).replace(/\0+$/, '');
    if (decoded && PRINTABLE_ASCII.test(decoded)) {
      return decoded;
    }
    return bytesToHex(bytes);
  } catch {
    return '';
  }
}

export function deriveDmSeedPair(a: string, b: string) {
  const [userA, userB] = sortPubkeys(a, b);
  const seedBytes = deriveDmSeed(userA, userB);
  return { userA, userB, seedBytes, seedHex: bytesToHex(seedBytes) };
}

export function rowToMessage(row: Row): MessageRow {
  const record = row ?? {};
  const idCandidate =
    (record as any).id ??
    (record as any).__rowId ??
    (record as any).text ??
    crypto.randomUUID?.() ??
    Math.random().toString(36).slice(2, 10);

  const sender =
    record.sender != null
      ? String(record.sender)
      : (record as any).senderAddress
        ? String((record as any).senderAddress)
        : undefined;
  const displayName = sender || undefined;
  const avatarHue = sender ? deriveAvatarHue(sender) : undefined;

  return {
    id: String(idCandidate),
    text: record.text != null ? String(record.text) : '',
    file: record.file ? String(record.file) : '',
    signature: (record as any).__txSignature,
    sender,
    displayName,
    avatarHue,
    timestamp: record.timestamp != null ? Number(record.timestamp) : undefined,
    status: record.status ? (String(record.status) as MessageRow['status']) : 'confirmed',
    room: record.room ? String(record.room) : undefined,
  };
}
