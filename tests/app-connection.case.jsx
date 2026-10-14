import { test, expect, mock } from 'bun:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const setRpcUrl = mock(() => {});
mock.module('iqlabs-sdk', () => ({ setRpcUrl }));
mock.module('@privy-io/react-auth/solana', () => ({
  useWallets: () => ({ wallets: [] }),
}));
mock.module('../lib/wallet/wallet-mode', () => ({
  useWalletMode: () => ({ mode: null }),
}));
const { AppConnectionProvider, useAppConnection } = await import(
  '../lib/wallet/app-connection'
);
const { createRoot } = await import('react-dom/client');

test('RPC changes update every consumer and the SDK together using one connection state', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    Event: dom.window.Event,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const connections = [];
  function Consumer({ index }) {
    connections[index] = useAppConnection();
    return null;
  }
  const root = createRoot(document.getElementById('root'));
  try {
    await act(async () =>
      root.render(
        <AppConnectionProvider>
          <Consumer index={0} />
          <Consumer index={1} />
        </AppConnectionProvider>,
      ),
    );
    const initialEndpoint = connections[0].rpcEndpoint;
    expect(connections[0]).toBe(connections[1]);
    expect(setRpcUrl).toHaveBeenCalledTimes(1);
    await act(async () =>
      connections[0].setCustomRpcEndpoint('http://localhost:19899'),
    );
    expect(connections[0]).toBe(connections[1]);
    expect(connections[1].connection.rpcEndpoint).toBe(
      'http://localhost:19899',
    );
    expect(connections[1].readConnection.rpcEndpoint).toBe(
      'http://localhost:19899',
    );
    expect(setRpcUrl).toHaveBeenLastCalledWith('http://localhost:19899');
    expect(setRpcUrl).toHaveBeenCalledTimes(2);
    await act(async () => connections[1].setCustomRpcEndpoint(null));
    expect(connections[0].rpcEndpoint).toBe(initialEndpoint);
    expect(dom.window.localStorage.getItem('solchat:rpc-endpoint')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
  }
});
