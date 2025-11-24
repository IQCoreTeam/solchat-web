/**
 * RPC-specific throttling config for getTransaction backfills.
 * Defaults:
 * - Public Solana RPC: 1 tx/sec
 * - Custom RPC: 8 tx per batch, 1s pause between batches
 *
 * Override with:
 * - NEXT_PUBLIC_RPC_SLOW_BATCH
 * - NEXT_PUBLIC_RPC_SLOW_DELAY_MS
 * - NEXT_PUBLIC_RPC_FAST_BATCH
 * - NEXT_PUBLIC_RPC_FAST_DELAY_MS
 */

/**
 * TODO: Centralize RPC throttle with shared queue.
 * Readers now consume getRpcThrottle.
 * - Public RPC (solana.com): 1 tx/sec
 * - Custom RPC: 8 tx/batch, 1s pause
 * TODO: add shared queue to coordinate multiple concurrent read loops.
 */

export type RpcThrottle = {
  batchSize: number;
  delayMs: number;
  isDefault: boolean;
};

export function getRpcThrottle(endpoint: string): RpcThrottle {
  // Placeholder: mirrors current defaults until the shared queue is implemented.
  const isDefault = endpoint.includes('solana.com');
  return {
    batchSize: isDefault ? 1 : 8,
    delayMs: 1000,
    isDefault,
  };
}
