import { MerkleTree } from 'merkletreejs';
import keccak256 from 'keccak256';

/**
 * Build a Merkle tree from binary chunks
 * chunks Array of encrypted audio chunks
 * returns The MerkleTree object
 */
export function buildMerkleTree(chunks: Uint8Array[]): MerkleTree {
  const leaves = chunks.map((chunk) => keccak256(Buffer.from(chunk)));
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

/**
 * Get the Merkle root as a hex string
 * tree The MerkleTree object
 * returns The 32-byte hex root (0x...)
 */
export function getMerkleRoot(tree: MerkleTree): string {
  return tree.getHexRoot();
}

/**
 * Verify a chunk against the root
 * chunk The data chunk
 * proof The Merkle proof for this chunk
 * root The Merkle root
 * returns True if valid
 */
export function verifyChunk(chunk: Uint8Array, proof: string[], root: string): boolean {
  const leaf = keccak256(Buffer.from(chunk));
  return MerkleTree.verify(proof, leaf, root, keccak256, { sortPairs: true });
}
