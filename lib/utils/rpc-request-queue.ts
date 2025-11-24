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
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let queue: Promise<unknown> = Promise.resolve();
let timestamps: number[] = [];

async function waitForSlot(maxPerSecond: number, windowMs: number) {
  while (true) {
    const now = Date.now();
    timestamps = timestamps.filter((ts) => now - ts < windowMs);
    if (timestamps.length < maxPerSecond) {
      timestamps.push(now);
      return;
    }
    const waitTime = Math.max(50, windowMs - (now - timestamps[0]));
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

  if (!enabled) {
    return Promise.resolve().then(fn);
  }

  const task = queue.then(async () => {
    await waitForSlot(maxPerSecond, windowMs);
    return fn();
  });

  queue = task.then(
    () => undefined,
    () => undefined
  );

  return task;
}
