/**
 * Shared RPC rate limiter.
 * - Enforces max requests per window (default 3 req / second) and serializes work.
 * - Opt-in via `enabled`; skip when user supplies their own RPC endpoint.
 */

// Environment variable helpers
const getEnvNumber = (key: string, defaultVal: number) => {
  if (typeof process !== 'undefined' && process.env[key]) {
    const val = Number(process.env[key]);
    return isNaN(val) ? defaultVal : val;
  }
  return defaultVal;
};

const DEFAULT_SLOW_BATCH = 5;
const DEFAULT_FAST_BATCH = 8;
const DEFAULT_SLOW_DELAY_MS = 1000;

export interface QueueConfig {
  queueKey: string;
  maxPerSecond: number;
  windowMs: number;
}

export function getQueueConfig(endpoint: string): QueueConfig {
  const isDefault = endpoint.includes('solana.com');
  return {
    queueKey: isDefault ? 'rpc:public' : `rpc:${endpoint}`,
    maxPerSecond: isDefault
      ? getEnvNumber('NEXT_PUBLIC_RPC_SLOW_BATCH', DEFAULT_SLOW_BATCH)
      : getEnvNumber('NEXT_PUBLIC_RPC_FAST_BATCH', DEFAULT_FAST_BATCH),
    windowMs: getEnvNumber('NEXT_PUBLIC_RPC_SLOW_DELAY_MS', DEFAULT_SLOW_DELAY_MS),
  };
}

type RateLimitOptions = {
  enabled?: boolean;
  maxPerSecond?: number;
  windowMs?: number;
  queueKey?: string;
  // If provided, config is derived from endpoint automatically
  endpoint?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const queues: Record<string, Promise<unknown>> = {};
const timestampsMap: Record<string, number[]> = {};

const RPC_ERROR_EVENT = 'solchat:rpc-error';

function notifyRpcError(error: unknown, endpoint?: string) {
  if (typeof window === 'undefined') return;
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes('401')) return;
  window.dispatchEvent(
    new CustomEvent(RPC_ERROR_EVENT, {
      detail: { message, endpoint },
    })
  );
}

async function waitForSlot(key: string, maxPerSecond: number, windowMs: number) {
  if (!timestampsMap[key]) {
    timestampsMap[key] = [];
  }
  const bucket = timestampsMap[key];
  
  while (true) {
    const now = Date.now();
    // Remove timestamps older than windowMs
    while (bucket.length > 0 && now - bucket[0] >= windowMs) {
      bucket.shift();
    }
    
    if (bucket.length < maxPerSecond) {
      bucket.push(now);
      // Log for observability (can be verbose, maybe only on dev/debug)
      // console.debug(`[RPC-Queue:${key}] Slot acquired. Usage: ${bucket.length}/${maxPerSecond}`);
      return;
    }
    
    // Wait until the oldest timestamp expires
    const timeToWait = bucket[0] ? (windowMs - (now - bucket[0])) : 50;
    const waitTime = Math.max(50, timeToWait);
    await sleep(waitTime);
  }
}

/**
 * Run a task through the shared RPC limiter.
 * Tasks are serialized per queueKey.
 */
export async function runWithRpcRateLimit<T>(
  fn: () => Promise<T> | T,
  options?: RateLimitOptions
): Promise<T> {
  let { enabled = true, maxPerSecond, windowMs, queueKey, endpoint } = options || {};

  if (!enabled) {
    return Promise.resolve().then(fn);
  }

  // Auto-configure from endpoint if provided and specific config is missing
  if (endpoint && (!queueKey || maxPerSecond === undefined)) {
    const config = getQueueConfig(endpoint);
    queueKey = queueKey || config.queueKey;
    maxPerSecond = maxPerSecond ?? config.maxPerSecond;
    windowMs = windowMs ?? config.windowMs;
  }

  // Fallbacks
  maxPerSecond = maxPerSecond ?? 3;
  windowMs = windowMs ?? 1000;
  queueKey = queueKey ?? 'default';

  const currentQueue = queues[queueKey] ?? Promise.resolve();
  
  const task = currentQueue.then(async () => {
    await waitForSlot(queueKey, maxPerSecond!, windowMs!);
    try {
      return await fn();
    } catch (error) {
      notifyRpcError(error, endpoint);
      throw error;
    }
  });

  // Append to queue but swallow errors so the queue chain doesn't break
  queues[queueKey] = task.catch(() => undefined);

  return task;
}
