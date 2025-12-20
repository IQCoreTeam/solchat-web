/**
 * SDP Chunking Utilities
 *
 * WebRTC SDP offers/answers are typically 2-4KB, too large for a single
 * Solana transaction (~1232 bytes max). This module handles splitting
 * SDPs into chunks and reassembling them.
 */

import { SDP_CHUNK_SIZE } from './types';

/**
 * Split an SDP string into chunks for on-chain transmission
 * Chunks at line boundaries to avoid corrupting SDP lines
 */
export function chunkSdp(sdp: string): string[] {
  const lines = sdp.split('\r\n');
  const chunks: string[] = [];
  let currentChunk = '';

  for (const line of lines) {
    const lineWithEnding = line + '\r\n';

    // If adding this line would exceed chunk size, start new chunk
    if (currentChunk.length + lineWithEnding.length > SDP_CHUNK_SIZE) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }

    currentChunk += lineWithEnding;
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * Reassemble SDP from chunks
 * Returns null if not all chunks are present
 */
export function reassembleSdp(
  chunks: Map<number, string>,
  totalChunks: number
): string | null {
  if (chunks.size !== totalChunks) {
    return null;
  }

  let sdp = '';
  for (let i = 0; i < totalChunks; i++) {
    const chunk = chunks.get(i);
    if (chunk === undefined) {
      return null;
    }
    sdp += chunk;
  }

  return sdp;
}

/**
 * Compress SDP by removing unnecessary lines
 * Removes optional attributes to minimize on-chain data
 * IMPORTANT: Keep lines needed for proper audio negotiation
 */
export function compressSdp(sdp: string): string {
  return sdp
    .split('\r\n')
    .filter(line => {
      // Remove empty lines
      if (!line.trim()) return false;
      // Remove bandwidth lines (optional QoS hints)
      if (line.startsWith('b=')) return false;
      // Remove SSRC lines (source identification, optional)
      if (line.startsWith('a=ssrc')) return false;
      // Remove extension maps (RTP header extensions, optional)
      if (line.startsWith('a=extmap')) return false;
      // Remove rtcp-fb lines (feedback mechanisms, optional)
      if (line.startsWith('a=rtcp-fb')) return false;
      // Remove candidate lines (we send these separately via ICE)
      if (line.startsWith('a=candidate')) return false;
      // Remove end-of-candidates
      if (line.startsWith('a=end-of-candidates')) return false;
      // KEEP a=group (BUNDLE is important for multiplexing)
      // KEEP a=msid (media stream identification helps track matching)
      return true;
    })
    .join('\r\n');
}

/**
 * Estimate number of transactions needed for an SDP
 */
export function estimateSdpTransactions(sdp: string): number {
  const compressed = compressSdp(sdp);
  return Math.ceil(compressed.length / SDP_CHUNK_SIZE);
}
