import { useEffect, useRef } from 'react';
import { useServerStore } from '../store/serverStore.js';
import type {
  HubToViewerMessage,
  ViewerSnapshot,
  ViewerDelta,
  ViewerBucket,
  ViewerServerOnline,
  ViewerServerOffline,
  ViewerAlert,
} from '@nodepulse/protocol';

export function useHubSocket() {
  const {
    setConnectionStatus,
    handleSnapshot,
    handleDelta,
    handleBucket,
    handleServerOnline,
    handleServerOffline,
    handleAlert,
    checkStaleness,
  } = useServerStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;

    function connect() {
      if (!isMountedRef.current) return;
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      setConnectionStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/view`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current) return;
          setConnectionStatus('connected');
          reconnectAttemptRef.current = 0;
        };

        ws.onmessage = (evt) => {
          if (!isMountedRef.current) return;
          try {
            const data = JSON.parse(evt.data as string) as HubToViewerMessage;
            if (!data || typeof data !== 'object' || !('t' in data)) return;

            switch (data.t) {
              case 'snapshot': {
                const snap = data as ViewerSnapshot;
                handleSnapshot(snap.servers);
                break;
              }
              case 'delta': {
                const delta = data as ViewerDelta;
                handleDelta(delta.id, delta.ts, delta.s);
                break;
              }
              case 'bucket': {
                const bucket = data as ViewerBucket;
                handleBucket(bucket.id, bucket.p);
                break;
              }
              case 'server.online': {
                const online = data as ViewerServerOnline;
                handleServerOnline(online.id, online.ts, online.static);
                break;
              }
              case 'server.offline': {
                const offline = data as ViewerServerOffline;
                handleServerOffline(
                  offline.id,
                  offline.ts,
                  offline.last ?? null
                );
                break;
              }
              case 'alert': {
                const alert = data as ViewerAlert;
                handleAlert(alert.event);
                break;
              }
              case 'pong':
                break;
            }
          } catch {
            // Ignore malformed message frames
          }
        };

        ws.onclose = () => {
          if (!isMountedRef.current) return;
          setConnectionStatus('disconnected');
          scheduleReconnect();
        };

        ws.onerror = () => {
          if (!isMountedRef.current) return;
          setConnectionStatus('error');
        };
      } catch {
        setConnectionStatus('error');
        scheduleReconnect();
      }
    }

    function scheduleReconnect() {
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const attempt = reconnectAttemptRef.current;
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s, up to 30s
      const delay = Math.min(
        1000 * Math.pow(2, attempt) + Math.random() * 1000,
        30000
      );
      reconnectAttemptRef.current += 1;

      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    }

    // Ping interval to prevent quiet socket drops
    const pingInterval = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ t: 'ping' }));
      }
    }, 30000);

    // Staleness inspection interval every 5 seconds
    const staleInterval = window.setInterval(() => {
      const nowSec = Math.floor(Date.now() / 1000);
      checkStaleness(nowSec);
    }, 5000);

    connect();

    return () => {
      isMountedRef.current = false;
      clearInterval(pingInterval);
      clearInterval(staleInterval);
      if (reconnectTimeoutRef.current !== null) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [
    setConnectionStatus,
    handleSnapshot,
    handleDelta,
    handleBucket,
    handleServerOnline,
    handleServerOffline,
    handleAlert,
    checkStaleness,
  ]);
}
