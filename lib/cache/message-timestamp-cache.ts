'use client';

/**
 * Local cache for the last known message timestamps per chat.
 * Used by notification/WS logic to avoid re-fetching entire histories.
 */

type TimestampMap = Record<string, number>;

const STORAGE_KEY = 'solchat:lastMessageTimestamps';

let timestampCache: TimestampMap | null = null;

function ensureHydrated() {
  if (timestampCache) {
    return;
  }
  timestampCache = {};

  if (typeof window === 'undefined') {
    return;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        timestampCache = parsed as TimestampMap;
      }
    }
  } catch (error) {
    console.warn('[TimestampCache] Failed to hydrate store', error);
  }
}

function persist() {
  if (typeof window === 'undefined' || !timestampCache) {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(timestampCache));
  } catch (error) {
    console.warn('[TimestampCache] Failed to persist store', error);
  }
}

export function makeRoomTimestampKey(seedHex: string) {
  return `room:${seedHex}`;
}

export function makeDmTimestampKey(dmSeedHex: string) {
  return `dm:${dmSeedHex}`;
}

export function getLastMessageTimestamp(key: string): number | null {
  ensureHydrated();
  return timestampCache?.[key] ?? null;
}

export function setLastMessageTimestamp(key: string, timestamp?: number | null) {
  if (timestamp == null) {
    return;
  }
  ensureHydrated();
  if (!timestampCache) {
    timestampCache = {};
  }
  const current = timestampCache[key];
  if (current && current >= timestamp) {
    return;
  }
  timestampCache[key] = timestamp;
  persist();
}

export function getTimestampSnapshot(): TimestampMap {
  ensureHydrated();
  return { ...(timestampCache || {}) };
}

export function clearTimestamp(key: string) {
  ensureHydrated();
  if (!timestampCache || !(key in timestampCache)) {
    return;
  }
  delete timestampCache[key];
  persist();
}
