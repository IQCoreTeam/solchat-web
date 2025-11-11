'use client';

import { Keypair } from '@solana/web3.js';

const STORAGE_KEY = 'solchat-app-wallet';

declare global {
  interface Window {
    crypto: Crypto;
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

export function getStoredAppWallet(): Keypair | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const secret = Uint8Array.from(JSON.parse(raw));
    return Keypair.fromSecretKey(secret);
  } catch (error) {
    console.warn('Failed to parse stored wallet, regenerating.', error);
    storage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function createAppWallet(): Keypair {
  const keypair = Keypair.generate();
  const storage = getStorage();
  if (storage) {
    storage.setItem(STORAGE_KEY, JSON.stringify(Array.from(keypair.secretKey)));
  }
  return keypair;
}

export function ensureAppWallet(): Keypair {
  return getStoredAppWallet() ?? createAppWallet();
}
