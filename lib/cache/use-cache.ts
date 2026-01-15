/**
 * React Hooks for Cache Integration
 *
 * Provides React hooks to easily integrate caching into components.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { getCacheManager, type MessageCacheOptions, type LoadMessagesResult } from './cache-manager';
import type { Row } from '@/lib/shared/message-helpers';

/**
 * Hook to use the cache manager
 */
export function useCacheManager() {
  const [isReady, setIsReady] = useState(false);
  const manager = useRef(getCacheManager());

  useEffect(() => {
    manager.current.initialize().then(() => {
      setIsReady(true);
    }).catch((error) => {
      console.error('[useCacheManager] Failed to initialize:', error);
    });
  }, []);

  return {
    manager: manager.current,
    isReady,
  };
}

/**
 * Hook to load room messages with caching
 */
export function useCachedRoomMessages(
  roomId: string | null,
  fetchFn: (() => Promise<Row[]>) | null,
  options?: MessageCacheOptions & { enabled?: boolean }
) {
  const [result, setResult] = useState<LoadMessagesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { manager, isReady } = useCacheManager();
  const { enabled = true, ...cacheOptions } = options ?? {};

  useEffect(() => {
    if (!enabled || !roomId || !fetchFn) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await manager.loadRoomMessages(roomId, fetchFn, cacheOptions);

        if (!cancelled) {
          setResult(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [roomId, enabled, manager, isReady]);

  const refresh = async () => {
    if (!roomId || !fetchFn) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await manager.syncRoom(roomId, fetchFn);
      setResult({
        messages: result,
        fromCache: false,
        refreshing: false,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const invalidate = async () => {
    if (!roomId) {
      return;
    }

    await manager.invalidateRoom(roomId);
  };

  return {
    messages: result?.messages ?? [],
    fromCache: result?.fromCache ?? false,
    refreshing: result?.refreshing ?? false,
    loading,
    error,
    refresh,
    invalidate,
  };
}

/**
 * Hook to load DM messages with caching
 */
export function useCachedDmMessages(
  dmSeedHex: string | null,
  fetchFn: (() => Promise<Row[]>) | null,
  options?: MessageCacheOptions & { enabled?: boolean }
) {
  const [result, setResult] = useState<LoadMessagesResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const { manager, isReady } = useCacheManager();
  const { enabled = true, ...cacheOptions } = options ?? {};

  useEffect(() => {
    if (!enabled || !dmSeedHex || !fetchFn) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await manager.loadDmMessages(dmSeedHex, fetchFn, cacheOptions);

        if (!cancelled) {
          setResult(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [dmSeedHex, enabled, manager, isReady]);

  const refresh = async () => {
    if (!dmSeedHex || !fetchFn) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await manager.syncDm(dmSeedHex, fetchFn);
      setResult({
        messages: result,
        fromCache: false,
        refreshing: false,
      });
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  };

  const invalidate = async () => {
    if (!dmSeedHex) {
      return;
    }

    await manager.invalidateDm(dmSeedHex);
  };

  return {
    messages: result?.messages ?? [],
    fromCache: result?.fromCache ?? false,
    refreshing: result?.refreshing ?? false,
    loading,
    error,
    refresh,
    invalidate,
  };
}
