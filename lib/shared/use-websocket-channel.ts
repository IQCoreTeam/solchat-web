/**
 * WebSocket Channel Hook
 * - Unified WebSocket connection management for both DM and Chat features
 * - Extracted from friends-list.tsx (DM) and chat-client.tsx (Chat)
 * - All timing values, backoff logic, and ping/pong handling preserved exactly
 */

import { useEffect, useRef, useState } from 'react';

export interface UseWebSocketChannelParams {
  /**
   * URL of the WebSocket server
   * Default: process.env.NEXT_PUBLIC_NOTI_WS_URL || 'ws://localhost:8080'
   */
  url?: string;

  /**
   * Handler for incoming WebSocket messages
   * Called with parsed JSON data from the server
   */
  onMessage: (data: unknown) => void | Promise<void>;

  /**
   * Component name for logging (e.g., 'FriendsList', 'ChatClient')
   */
  logPrefix: string;
}

export interface UseWebSocketChannelReturn {
  /**
   * Current WebSocket instance (ref)
   */
  socketRef: React.MutableRefObject<WebSocket | null>;

  /**
   * Set of currently subscribed room IDs (ref)
   */
  subscribedIdsRef: React.MutableRefObject<Set<string>>;

  /**
   * Whether the WebSocket is currently connected
   */
  isConnected: boolean;

  /**
   * Backoff ref for reconnection timing
   */
  backoffRef: React.MutableRefObject<number>;

  /**
   * Last pong timestamp ref
   */
  lastPongRef: React.MutableRefObject<number>;

  /**
   * Ping interval ref
   */
  pingIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

/**
 * WebSocket connection hook with automatic reconnection and ping/pong
 *
 * Features:
 * - Exponential backoff reconnection (2000ms → 30000ms)
 * - Ping every 15 seconds
 * - Pong timeout check (45 seconds)
 * - Visibility change handling (reconnect when tab becomes visible)
 * - Automatic cleanup on unmount
 */
export function useWebSocketChannel(params: UseWebSocketChannelParams): UseWebSocketChannelReturn {
  const { url: urlParam, onMessage, logPrefix } = params;

  const socketRef = useRef<WebSocket | null>(null);
  const subscribedIdsRef = useRef<Set<string>>(new Set());
  const backoffRef = useRef<number>(0);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const messageHandlerRef = useRef<typeof onMessage | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Update message handler ref when it changes
  useEffect(() => {
    messageHandlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = urlParam || process.env.NEXT_PUBLIC_NOTI_WS_URL;
    if (!url) {
      console.log(`[${logPrefix}] WS disabled (NEXT_PUBLIC_NOTI_WS_URL not set)`);
      return;
    }
    let active = true;

    const clearPing = () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      setIsConnected(false);
      clearPing();
      subscribedIdsRef.current.clear();
      socketRef.current = null;
      if (!active) return;
      backoffRef.current = Math.min(
        backoffRef.current ? backoffRef.current * 2 : 2000,
        30000
      );
      setTimeout(connect, backoffRef.current);
    };

    const connect = () => {
      if (!active) return;
      try {
        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.addEventListener('open', () => {
          if (!active) return;
          console.log(`[${logPrefix}] WS connected to`, url);
          backoffRef.current = 0;
          lastPongRef.current = Date.now();
          setIsConnected(true);
          clearPing();

          // Ping every 15 seconds
          pingIntervalRef.current = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              // Check if we got a pong recently (within 45 seconds)
              if (Date.now() - lastPongRef.current > 45000) {
                console.warn(`[${logPrefix}] WS no pong in 45s, forcing reconnect`);
                socket.close();
                return;
              }
              socket.send(JSON.stringify({ type: 'ping' }));
              console.log(`[${logPrefix}] WS ping sent`);
            }
          }, 15000);
        });

        const handleMessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);
            if (data?.type === 'pong') {
              lastPongRef.current = Date.now();
              return;
            }
            console.log(`[${logPrefix}] WS message:`, data);
            if (data && (data.type === 'roomUpdated' || data.type === 'roomSnapshot' || data.type === 'messageSent')) {
              const handler = messageHandlerRef.current;
              if (handler) {
                void handler(data);
              }
            }
          } catch (error) {
            console.warn(`[${logPrefix}] Failed to parse notification payload`, error);
          }
        };

        socket.addEventListener('message', handleMessage);

        socket.addEventListener('close', () => {
          console.log(`[${logPrefix}] WS connection closed`);
          scheduleReconnect();
        });

        socket.addEventListener('error', (error) => {
          console.warn(`[${logPrefix}] WS error`, error);
        });
      } catch (error) {
        console.warn(`[${logPrefix}] Failed to connect notification socket`, error);
        scheduleReconnect();
      }
    };

    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const socket = socketRef.current;
        if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
          console.log(`[${logPrefix}] Tab visible, reconnecting WS...`);
          scheduleReconnect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      clearPing();
      subscribedIdsRef.current.clear();
      socketRef.current?.close();
      socketRef.current = null;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // We intentionally avoid including onMessage in deps to keep the socket alive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlParam, logPrefix]);

  return {
    socketRef,
    subscribedIdsRef,
    isConnected,
    backoffRef,
    lastPongRef,
    pingIntervalRef,
  };
}
