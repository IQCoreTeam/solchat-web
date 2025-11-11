/**
 * Storage for tracking SDK initialization per user
 * Ensures sdk.initialize() is only called once per wallet address
 */

const STORAGE_KEY_PREFIX = 'cloak-init:';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function getKey(address: string): string {
  return `${STORAGE_KEY_PREFIX}${address}`;
}

/**
 * Check if SDK has been initialized for this user
 */
export function isUserInitialized(address: string): boolean {
  const storage = getStorage();
  if (!storage) return false;
  
  const value = storage.getItem(getKey(address));
  return value === 'true';
}

/**
 * Mark SDK as initialized for this user
 */
export function markUserInitialized(address: string): void {
  const storage = getStorage();
  if (!storage) return;
  
  storage.setItem(getKey(address), 'true');
}

/**
 * Clear initialization status for a user (useful for reset/debugging)
 */
export function clearUserInitialization(address: string): void {
  const storage = getStorage();
  if (!storage) return;
  
  storage.removeItem(getKey(address));
}

/**
 * Clear all initialization data
 */
export function clearAllInitializations(): void {
  const storage = getStorage();
  if (!storage) return;
  
  const keys = Object.keys(storage);
  keys.forEach(key => {
    if (key.startsWith(STORAGE_KEY_PREFIX)) {
      storage.removeItem(key);
    }
  });
}
