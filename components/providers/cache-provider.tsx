/**
 * Cache Provider
 *
 * Initializes the cache system and provides it to the application.
 */

'use client';

import { ReactNode, useEffect } from 'react';
import { initCacheManager } from '@/lib/cache';

export function CacheProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Initialize cache on mount
    initCacheManager()
      .then(() => {
        console.log('[CacheProvider] Cache initialized');
      })
      .catch((error) => {
        console.error('[CacheProvider] Failed to initialize cache:', error);
        // App should still work without cache
      });
  }, []);

  // Don't block rendering - cache will be ready in background
  return <>{children}</>;
}
