'use client';

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { Connection } from '@solana/web3.js';
import { useWallets } from '@privy-io/react-auth/solana';
import { setRpcUrl } from 'iqlabs-sdk';
import { RPC_URL, HELIUS_RPC_URL } from '@/lib/constants';
import { useWalletMode } from './wallet-mode';

/**
 * Connection hook - returns consistent Solana connection
 */
const RPC_STORAGE_KEY = 'solchat:rpc-endpoint';

function extractWalletRpcEndpoint(wallet: unknown): string | null {
  if (!wallet || typeof wallet !== 'object') return null;
  const fields = wallet as Record<string, unknown>;
  const provider =
    fields.provider && typeof fields.provider === 'object'
      ? (fields.provider as Record<string, unknown>)
      : null;
  for (const endpoint of [
    fields.rpcUrl,
    fields.rpcEndpoint,
    fields.endpoint,
    provider?.rpcUrl,
    provider?.endpoint,
  ]) {
    if (typeof endpoint === 'string' && /^https?:\/\//.test(endpoint))
      return endpoint;
  }
  return null;
}

function readCustomRpc(): string | null {
  try {
    return window.localStorage.getItem(RPC_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeCustomRpc(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === RPC_STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener('solchat:rpc-endpoint-change', listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('solchat:rpc-endpoint-change', listener);
  };
}

function useConnectionState() {
  const { mode } = useWalletMode();
  const { wallets } = useWallets();
  const customRpc = useSyncExternalStore(
    subscribeCustomRpc,
    readCustomRpc,
    () => null,
  );
  const providerRpc =
    mode === 'privy' ? extractWalletRpcEndpoint(wallets[0]) : null;

  const setCustomRpcEndpoint = useCallback((endpoint: string | null) => {
    if (endpoint) window.localStorage.setItem(RPC_STORAGE_KEY, endpoint);
    else window.localStorage.removeItem(RPC_STORAGE_KEY);
    window.dispatchEvent(new Event('solchat:rpc-endpoint-change'));
  }, []);

  const endpoint = customRpc || providerRpc || RPC_URL;
  const endpointSource: 'custom' | 'provider' | 'default' = customRpc
    ? 'custom'
    : providerRpc
      ? 'provider'
      : 'default';

  // Preserve the RPC's normal preflight validation for every SDK submission.
  const connection = useMemo(
    () => new Connection(endpoint, 'confirmed'),
    [endpoint],
  );

  // An explicit user/provider endpoint also governs reads and SDK fallbacks.
  const readEndpoint = customRpc || providerRpc || HELIUS_RPC_URL || RPC_URL;
  const readConnection = useMemo(
    () =>
      readEndpoint === endpoint
        ? connection
        : new Connection(readEndpoint, 'confirmed'),
    [connection, endpoint, readEndpoint],
  );

  useEffect(() => {
    setRpcUrl(readEndpoint);
  }, [readEndpoint]);

  return {
    connection,
    readConnection,
    rpcEndpoint: endpoint,
    endpointSource,
    setCustomRpcEndpoint,
  };
}

const AppConnectionContext = createContext<ReturnType<
  typeof useConnectionState
> | null>(null);

export function AppConnectionProvider({ children }: { children: ReactNode }) {
  const value = useConnectionState();
  return (
    <AppConnectionContext.Provider value={value}>
      {children}
    </AppConnectionContext.Provider>
  );
}

export function useAppConnection() {
  const connection = useContext(AppConnectionContext);
  if (!connection) throw new Error('AppConnectionProvider is required');
  return connection;
}
