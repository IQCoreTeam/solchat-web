import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicKey, type Connection } from '@solana/web3.js';
import type { LoaderOptions } from './useMessageLoader';
import { useMessageLoader } from './useMessageLoader';
import type { MessageRow } from '../utils/message-helpers';
import { getCachedSignatures } from '@/lib/rpc/cache';

export type FetchConfig = {
  maxTx?: number;
  knownSignatures?: Set<string> | string[];
  signatures?: string[];
  onProgress?: (rows: MessageRow[]) => void;
};

type ChannelMeta = {
  channelKey: string;
  seedHex: string;
  tableAddress: string;
};

type RowsAppliedPayload = {
  channelKey: string;
  seedHex: string;
  rows: MessageRow[];
  mode: 'prepend' | 'append';
};

type UseMessageIndexLoaderParams = {
  channelKey: string | null;
  resolveChannelMeta: (channelKey: string) => ChannelMeta | null;
  fetcher: (channelKey: string, fetchConfig?: FetchConfig) => Promise<MessageRow[]>;
  connection: Connection;
  endpointSource: string;
  decodeWindow?: number;
  maxSignatureIndex?: number;
  roomRateLimit?: number;
  onRowsApplied?: (payload: RowsAppliedPayload) => void;
  runWithRpcRateLimit?: <T>(
    fn: () => Promise<T>,
    options: { enabled: boolean; maxPerSecond: number; queueKey: string }
  ) => Promise<T>;
};

const defaultRateLimiter = async <T>(
  fn: () => Promise<T>,
  _options?: { enabled: boolean; maxPerSecond: number; queueKey: string }
) => {
  void _options;
  return fn();
};

export function useMessageIndexLoader({
  channelKey,
  resolveChannelMeta,
  fetcher,
  connection,
  endpointSource,
  decodeWindow = 40,
  maxSignatureIndex = 5000,
  roomRateLimit = 3,
  onRowsApplied,
  runWithRpcRateLimit = defaultRateLimiter,
}: UseMessageIndexLoaderParams) {
  const activeChannelKeyRef = useRef<string | null>(channelKey);
  useEffect(() => {
    activeChannelKeyRef.current = channelKey;
  }, [channelKey]);

  const [messages, setMessages] = useState<MessageRow[]>([]);

  const knownSignaturesRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const sigs = new Set<string>();
    messages.forEach((msg) => {
      if (msg.signature) {
        sigs.add(msg.signature);
      }
    });
    knownSignaturesRef.current = sigs;
  }, [messages]);

  const signatureIndexRef = useRef<Record<string, string[]>>({});
  const signatureCursorRef = useRef<Record<string, string | null>>({});
  const signatureExhaustedRef = useRef<Record<string, boolean>>({});
  const decodeCursorRef = useRef<Record<string, number>>({});
  const lastInsertModeRef = useRef<Record<string, 'prepend' | 'append' | null>>({});
  const backfillTaskRef = useRef<Record<string, Promise<void> | null>>({});
  const liveTaskRef = useRef<Record<string, Promise<void> | null>>({});
  const liveDirtyRef = useRef<Record<string, boolean>>({});
  const runLiveLatestRef = useRef<(channel: string, options?: LoaderOptions) => Promise<void> | null>(null);

  const {
    loadMessages: loadChannelMessages,
    messagesLoading,
    messagesError,
    showLoadingSpinner,
  } = useMessageLoader<[string, FetchConfig?]>({
    fetcher: fetcher as (channelKey: string, config?: FetchConfig) => Promise<MessageRow[]>,
  });

  const dedupeKeepOrder = useCallback((list: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const sig of list) {
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      out.push(sig);
    }
    return out;
  }, []);

  const resetChannelState = useCallback(
    (targetChannelKey: string | null, opts?: { resetMessages?: boolean }) => {
      if (!targetChannelKey) {
        if (opts?.resetMessages) {
          setMessages([]);
        }
        return;
      }
      signatureIndexRef.current[targetChannelKey] = [];
      signatureCursorRef.current[targetChannelKey] = null;
      signatureExhaustedRef.current[targetChannelKey] = false;
      decodeCursorRef.current[targetChannelKey] = 0;
      lastInsertModeRef.current[targetChannelKey] = null;
      backfillTaskRef.current[targetChannelKey] = null;
      liveTaskRef.current[targetChannelKey] = null;
      liveDirtyRef.current[targetChannelKey] = false;
      if (opts?.resetMessages && activeChannelKeyRef.current === targetChannelKey) {
        setMessages([]);
      }
    },
    []
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      resetChannelState(channelKey, { resetMessages: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [channelKey, resetChannelState]);

  const upsertMessages = useCallback((incoming: MessageRow[], targetChannelKey?: string) => {
    if (!incoming.length) return;
    const activeKey = activeChannelKeyRef.current;
    if (!activeKey || (targetChannelKey && targetChannelKey !== activeKey)) {
      return;
    }
    setMessages((prev) => {
      const map = new Map<string, MessageRow>();
      [...prev, ...incoming].forEach((msg) => {
        if (!msg) return;
        const key = msg.id || msg.signature || `${msg.timestamp ?? 0}-${msg.sender ?? ''}`;
        map.set(key, msg);
      });
      return Array.from(map.values()).sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
    });
  }, []);

  const applyLoadedRows = useCallback(
    (targetChannelKey: string, rows: MessageRow[], mode: 'prepend' | 'append') => {
      if (!rows.length) return;
      const activeKey = activeChannelKeyRef.current;
      lastInsertModeRef.current[targetChannelKey] = mode;
      upsertMessages(rows, targetChannelKey);
      if (!activeKey || activeKey !== targetChannelKey) return;

      const latestTimestamp = rows.reduce((max, msg) => {
        const ts = msg.timestamp ?? 0;
        return ts > max ? ts : max;
      }, 0);

      if (latestTimestamp) {
        onRowsApplied?.({
          channelKey: targetChannelKey,
          seedHex: resolveChannelMeta(targetChannelKey)?.seedHex ?? '',
          rows,
          mode,
        });
        if (mode === 'append' && (decodeCursorRef.current[targetChannelKey] ?? 0) < rows.length) {
          decodeCursorRef.current[targetChannelKey] = rows.length;
        }
      }
    },
    [onRowsApplied, resolveChannelMeta, upsertMessages]
  );

  const ensureSignatureIndex = useCallback(
    async (
      targetChannelKey: string,
      meta: ChannelMeta,
      opts?: { mode?: 'initial' | 'older' | 'refreshLatest'; limit?: number }
    ) => {
      const mode = opts?.mode ?? (signatureIndexRef.current[targetChannelKey]?.length ? 'refreshLatest' : 'initial');

      const baseLimit = 1000;
      const latestLimit = 1000;
      const limit =
        opts?.limit ??
        (mode === 'refreshLatest'
          ? latestLimit
          : baseLimit);

      const existing = signatureIndexRef.current[targetChannelKey] || [];
      let before: string | undefined;

      if (mode === 'initial') {
        signatureExhaustedRef.current[targetChannelKey] = false;
        signatureCursorRef.current[targetChannelKey] = null;
        decodeCursorRef.current[targetChannelKey] = 0;
      } else if (mode === 'older') {
        before = signatureCursorRef.current[targetChannelKey] || undefined;
      }

      try {
        const sigInfos = await getCachedSignatures(
          connection,
          new PublicKey(meta.tableAddress),
          limit,
          before
        );
        const fetched = sigInfos.map((s) => s.signature).filter(Boolean);
        let nextIndex: string[] = existing;

        if (mode === 'initial') {
          nextIndex = dedupeKeepOrder(fetched);
        } else if (mode === 'refreshLatest') {
          nextIndex = dedupeKeepOrder([...fetched, ...existing]);
        } else if (mode === 'older') {
          if (!fetched.length) {
            signatureExhaustedRef.current[targetChannelKey] = true;
          }
          nextIndex = dedupeKeepOrder([...existing, ...fetched]);
        }

        if (nextIndex.length > maxSignatureIndex) {
          nextIndex = nextIndex.slice(0, maxSignatureIndex);
        }

        signatureIndexRef.current[targetChannelKey] = nextIndex;
        signatureCursorRef.current[targetChannelKey] = nextIndex[nextIndex.length - 1] ?? null;
        decodeCursorRef.current[targetChannelKey] = Math.min(
          decodeCursorRef.current[targetChannelKey] ?? 0,
          nextIndex.length
        );
        lastInsertModeRef.current[targetChannelKey] = null;

        return nextIndex;
      } catch (error) {
        console.error('[useMessageIndexLoader] Failed to load signature index for', meta.seedHex.slice(0, 8), error);
        return signatureIndexRef.current[targetChannelKey] || [];
      }
    },
    [connection, dedupeKeepOrder, endpointSource, maxSignatureIndex]
  );

  const triggerBackfill = useCallback(
    async (targetChannelKey?: string) => {
      const channel = targetChannelKey ?? activeChannelKeyRef.current;
      if (!channel) return;
      const meta = resolveChannelMeta(channel);
      if (!meta) return;

      const existingTask = backfillTaskRef.current[channel];
      if (existingTask) return existingTask;

      const task = (async () => {
        if (!signatureIndexRef.current[channel]?.length) {
          await ensureSignatureIndex(channel, meta, { mode: 'initial' });
        }
        const index = signatureIndexRef.current[channel] || [];
        const knownSet = new Set(knownSignaturesRef.current);
        const start = decodeCursorRef.current[channel] ?? 0;
        let targetCount = Math.min(index.length, start + decodeWindow);

        if (index.length < start + decodeWindow && !signatureExhaustedRef.current[channel]) {
          const prevLen = index.length;
          let attempts = 0;
          while (attempts < 2 && index.length < start + decodeWindow && !signatureExhaustedRef.current[channel]) {
            await ensureSignatureIndex(channel, meta, { mode: 'older' });
            const refreshed = signatureIndexRef.current[channel] || [];
            if (refreshed.length === prevLen) {
              signatureExhaustedRef.current[channel] = true;
              break;
            }
            targetCount = Math.min(refreshed.length, start + decodeWindow);
            attempts += 1;
          }
        }

        const finalIndex = signatureIndexRef.current[channel] || index;
        targetCount = Math.min(finalIndex.length, start + decodeWindow);

        if (!finalIndex.length || targetCount <= start) {
          return;
        }

        try {
          const rows = await runWithRpcRateLimit(
            () =>
              loadChannelMessages(
                channel,
                {
                  maxTx: targetCount,
                  knownSignatures: knownSet,
                  signatures: finalIndex.slice(start, targetCount),
                  onProgress: (partial) => applyLoadedRows(channel, partial, 'prepend'),
                } as FetchConfig,
                { skipLoadingState: true } as LoaderOptions
              ),
            {
              enabled: endpointSource === 'default',
              maxPerSecond: 1,
              queueKey: 'backfill',
            }
          );
          applyLoadedRows(channel, rows, 'prepend');
          decodeCursorRef.current[channel] = targetCount;
        } catch (error) {
          console.error('[useMessageIndexLoader] Failed to load backfill for', meta.seedHex.slice(0, 8), error);
        }
      })().finally(() => {
        if (backfillTaskRef.current[channel] === task) {
          backfillTaskRef.current[channel] = null;
        }
      });

      backfillTaskRef.current[channel] = task;
      return task;
    },
    [applyLoadedRows, decodeWindow, endpointSource, ensureSignatureIndex, loadChannelMessages, runWithRpcRateLimit, resolveChannelMeta]
  );

  const runLiveLatest = useCallback(
    async (channel: string, options?: LoaderOptions) => {
      const meta = resolveChannelMeta(channel);
      if (!meta) return;

      const existingTask = liveTaskRef.current[channel];
      if (existingTask) {
        liveDirtyRef.current[channel] = true;
        return existingTask;
      }

      const task = (async () => {
        const index = await ensureSignatureIndex(channel, meta, {
          mode: 'refreshLatest',
        });
        if (!index.length) {
          return;
        }
        const knownSet = new Set(knownSignaturesRef.current);
        const targetCount = Math.min(index.length, decodeWindow);
        if (targetCount === 0) {
          return;
        }

        try {
          const rows = await runWithRpcRateLimit(
            () =>
              loadChannelMessages(
                channel,
                {
                  maxTx: targetCount,
                  knownSignatures: knownSet,
                  signatures: index.slice(0, targetCount),
                  onProgress: (partial) => applyLoadedRows(channel, partial, 'append'),
                } as FetchConfig,
                options
              ),
            {
              enabled: endpointSource === 'default',
              maxPerSecond: roomRateLimit,
              queueKey: 'live',
            }
          );
          applyLoadedRows(channel, rows, 'append');
          if ((decodeCursorRef.current[channel] ?? 0) < targetCount) {
            decodeCursorRef.current[channel] = targetCount;
          }
        } catch (error) {
          console.error('[useMessageIndexLoader] Failed to load live messages for', meta.seedHex.slice(0, 8), error);
        }
      })().finally(() => {
        if (liveTaskRef.current[channel] === task) {
          liveTaskRef.current[channel] = null;
        }
        if (liveDirtyRef.current[channel]) {
          liveDirtyRef.current[channel] = false;
          const rerun = runLiveLatestRef.current;
          if (rerun) {
            void rerun(channel, { skipLoadingState: true });
          }
        }
      });

      liveTaskRef.current[channel] = task;
      return task;
    },
    [applyLoadedRows, decodeWindow, endpointSource, ensureSignatureIndex, loadChannelMessages, resolveChannelMeta, roomRateLimit, runWithRpcRateLimit]
  );

  const triggerLiveLatest = useCallback(
    async (targetChannelKey?: string, options?: LoaderOptions) => {
      const channel = targetChannelKey ?? activeChannelKeyRef.current;
      if (!channel) return;
      return runLiveLatest(channel, options);
    },
    [runLiveLatest]
  );

  useEffect(() => {
    runLiveLatestRef.current = runLiveLatest;
  }, [runLiveLatest]);

  const targetedDecode = useCallback(
    async (targetChannelKey: string, signature: string) => {
      const meta = resolveChannelMeta(targetChannelKey);
      if (!meta) return;
      const knownSet = new Set(knownSignaturesRef.current);

      const rows = await loadChannelMessages(
        targetChannelKey,
        {
          maxTx: 1,
          signatures: [signature],
          knownSignatures: knownSet,
          onProgress: (partial) => applyLoadedRows(targetChannelKey, partial, 'append'),
        } as FetchConfig,
        { skipLoadingState: true }
      );
      applyLoadedRows(targetChannelKey, rows, 'append');
    },
    [applyLoadedRows, loadChannelMessages, resolveChannelMeta]
  );

  const applyLocalRows = useCallback(
    (targetChannelKey: string, rows: MessageRow[], mode: 'prepend' | 'append' = 'append') => {
      applyLoadedRows(targetChannelKey, rows, mode);
    },
    [applyLoadedRows]
  );

  return {
    messages,
    messagesLoading,
    messagesError,
    showLoadingSpinner,
    lastInsertModeRef,
    triggerBackfill,
    triggerLiveLatest,
    targetedDecode,
    resetChannelState,
    applyLocalRows,
  };
}
