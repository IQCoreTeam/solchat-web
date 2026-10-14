import { test, expect, mock } from 'bun:test';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
const listeners = new Map();
let state,
  connectCalls = 0,
  pickerCalls = 0;
const adapter = {
  on: (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
  },
  off: (event, fn) => listeners.get(event)?.delete(fn),
};
const emit = (event, arg) => {
  for (const fn of listeners.get(event) || []) fn(arg);
};
mock.module('@solana/wallet-adapter-react', () => ({ useWallet: () => state }));
mock.module('@solana/wallet-adapter-react-ui', () => ({
  useWalletModal: () => ({ setVisible: () => pickerCalls++ }),
}));
const { WalletConnectionStatus } = await import(
  '../components/ui/wallet-connection-status'
);
const { createRoot } = await import('react-dom/client');
async function setup() {
  listeners.clear();
  connectCalls = 0;
  pickerCalls = 0;
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  state = {
    wallet: { adapter },
    wallets: [{ adapter }],
    connected: false,
    connecting: true,
    connect: async () => {
      connectCalls++;
    },
  };
  const root = createRoot(document.getElementById('root'));
  const render = async () =>
    act(async () => root.render(<WalletConnectionStatus />));
  await render();
  return {
    render,
    close: async () => {
      await act(async () => root.unmount());
      expect([...listeners.values()].every((s) => s.size === 0)).toBe(true);
      dom.window.close();
    },
  };
}
test('pending wallet unlock is visible and creates no duplicate connection request', async () => {
  const v = await setup();
  try {
    expect(document.querySelector('[role=status]').textContent).toContain(
      'unlock',
    );
    expect(document.querySelector('button')).toBeNull();
    expect(connectCalls).toBe(0);
    state = { ...state, connecting: false, connected: true };
    await v.render();
    expect(document.body.textContent).toBe('');
  } finally {
    await v.close();
  }
});
test('rejection remains visible and retries the selected wallet without refreshing', async () => {
  const v = await setup();
  try {
    state = { ...state, connecting: false };
    await act(async () => emit('error', Error('User rejected the request')));
    await v.render();
    expect(document.querySelector('[role=alert]').textContent).toContain(
      'User rejected',
    );
    const retry = [...document.querySelectorAll('button')].find(
      (b) => b.textContent === 'Retry connection',
    );
    await act(async () => retry.click());
    expect(connectCalls).toBe(1);
    expect(document.querySelector('[role=alert]')).toBeNull();
  } finally {
    await v.close();
  }
});
test('when provider clears a rejected selection retry reopens picker', async () => {
  const v = await setup();
  try {
    await act(async () => emit('error', Error('Locked wallet')));
    state = { ...state, connecting: false, wallet: null };
    await v.render();
    await act(async () =>
      [...document.querySelectorAll('button')]
        .find((b) => b.textContent === 'Retry connection')
        .click(),
    );
    expect(pickerCalls).toBe(1);
    expect(connectCalls).toBe(0);
  } finally {
    await v.close();
  }
});
