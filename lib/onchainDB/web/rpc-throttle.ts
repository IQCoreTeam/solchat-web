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

export type RpcThrottle = {
  batchSize: number;
  delayMs: number;
  isDefault: boolean;
};

const parseEnvInt = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export function getRpcThrottle(endpoint: string): RpcThrottle {
  const isDefault = endpoint.includes('solana.com');

  if (isDefault) {
    const batchSize = parseEnvInt(process.env.NEXT_PUBLIC_RPC_SLOW_BATCH, 1);
    const delayMs = parseEnvInt(process.env.NEXT_PUBLIC_RPC_SLOW_DELAY_MS, 1000);
    return { batchSize, delayMs, isDefault };
  }

  const batchSize = parseEnvInt(process.env.NEXT_PUBLIC_RPC_FAST_BATCH, 8);
  const delayMs = parseEnvInt(process.env.NEXT_PUBLIC_RPC_FAST_DELAY_MS, 1000);
  return { batchSize, delayMs, isDefault };
}
