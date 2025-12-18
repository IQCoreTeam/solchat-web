/**
 * Shared RPC rate limiter.
 * - Enforces max requests per window (default 3 req / second) and serializes work.
 * - Opt-in via `enabled`; skip when user supplies their own RPC endpoint.
 */

const DEFAULT_MAX_PER_SECOND = 3;
const WINDOW_MS = 1000;

type RateLimitOptions = {
  enabled?: boolean;
  maxPerSecond?: number;
  windowMs?: number;
  queueKey?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const queues: Record<string, Promise<unknown>> = {};
const timestampsMap: Record<string, number[]> = {};

async function waitForSlot(key: string, maxPerSecond: number, windowMs: number) {
  const bucket = timestampsMap[key] || [];
  while (true) {
    const now = Date.now();
    const filtered = bucket.filter((ts) => now - ts < windowMs);
    timestampsMap[key] = filtered;
    if (filtered.length < maxPerSecond) {
      filtered.push(now);
      timestampsMap[key] = filtered;
      return;
    }
    const waitTime = Math.max(50, windowMs - (now - filtered[0]));
    await sleep(waitTime);
  }
}

/**
 * Run a task through the shared RPC limiter.
 * Tasks are serialized; if disabled, the task runs immediately.
 */
export async function runWithRpcRateLimit<T>(
  fn: () => Promise<T> | T,
  options?: RateLimitOptions
): Promise<T> {
  const enabled = options?.enabled ?? true;
  const maxPerSecond = options?.maxPerSecond ?? DEFAULT_MAX_PER_SECOND;
  const windowMs = options?.windowMs ?? WINDOW_MS;
  const queueKey = options?.queueKey ?? 'default';

  if (!enabled) {
    return Promise.resolve().then(fn);
  }

  const currentQueue = queues[queueKey] ?? Promise.resolve();
  const task = currentQueue.then(async () => {
    await waitForSlot(queueKey, maxPerSecond, windowMs);
    return fn();
  });

  queues[queueKey] = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}
