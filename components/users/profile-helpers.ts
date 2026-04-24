import { Buffer } from 'buffer';
import type { AccountInfo } from '@solana/web3.js';
import { readCodeIn } from '@/lib/gateway/reader';

export function extractUserMetadata(info?: AccountInfo<Buffer> | null): string {
  if (!info?.data) return '';
  try {
    const data = Buffer.from(info.data);
    let offset = 8; // discriminator
    offset += 32; // owner
    if (offset + 4 > data.length) return '';
    const dataLen = data.readUInt32LE(offset);
    offset += 4 + dataLen;
    if (offset + 4 > data.length) return '';
    const metadataLen = data.readUInt32LE(offset);
    offset += 4;
    if (metadataLen <= 0 || offset + metadataLen > data.length) return '';
    return data.slice(offset, offset + metadataLen).toString('utf8').trim();
  } catch {
    return '';
  }
}

export async function parseMetadata(
  metadataStr: string
): Promise<{ name: string; bio: string; profilePicture: string; encryptionPubKey?: string } | null> {
  if (!metadataStr || metadataStr.length <= 2) return null;

  try {
    if (metadataStr.length <= 100 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(metadataStr)) {
      const result = await readCodeIn(metadataStr);
      if (!result?.data || result.data.startsWith('[unable')) return null;
      return JSON.parse(result.data);
    }
    return JSON.parse(metadataStr);
  } catch {
    return null;
  }
}
