'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type WalletMode = 'privy' | 'wallet';

const STORAGE_KEY = 'solchat:wallet-mode';

function readStored(): WalletMode | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'privy' || raw === 'wallet' ? raw : null;
}

function subscribe(listener: () => void) {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('solchat:wallet-mode-change', listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('solchat:wallet-mode-change', listener);
  };
}

export function useWalletMode() {
  const mode = useSyncExternalStore(subscribe, readStored, () => null);

  const setMode = useCallback((next: WalletMode | null) => {
    if (typeof window === 'undefined') return;
    if (next) window.localStorage.setItem(STORAGE_KEY, next);
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('solchat:wallet-mode-change'));
  }, []);

  return { mode, setMode };
}
