import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { getToken, getApiUrl } from "@/lib/api";

export type LiveEvent =
  | {
      event: "booking_created" | "booking_updated";
      booking: Record<string, unknown>;
    }
  | {
      event: "conversation_updated";
      conversation: Record<string, unknown>;
    }
  | { event: "ops_invalidate"; domain: string }
  | Record<string, unknown>;

function buildWsUrl(path: string, token: string): string {
  const api = getApiUrl().replace(/\/$/, "");
  const wsBase = api.replace(/^http/, "ws");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const sep = normalized.includes("?") ? "&" : "?";
  return `${wsBase}${normalized}${sep}token=${encodeURIComponent(token)}`;
}

type Options = {
  path: string | null;
  onEvent: (event: LiveEvent) => void;
  onReconnect?: () => void;
  enabled?: boolean;
};

/** Shared live socket for Expo dashboards (not Mira). Silent — never surfaces errors. */
export function useLiveSocket({
  path,
  onEvent,
  onReconnect,
  enabled = true,
}: Options) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;

  useEffect(() => {
    if (!enabled || !path) return;

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectNotifyTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempt = 0;
    let everOpened = false;
    let appSub: { remove: () => void } | null = null;

    function scheduleReconnectNotify() {
      if (reconnectNotifyTimer) clearTimeout(reconnectNotifyTimer);
      // Debounce so flapping sockets don't spam soft refetches.
      reconnectNotifyTimer = setTimeout(() => {
        reconnectRef.current?.();
      }, 400);
    }

    async function connect() {
      if (closed) return;
      if (
        ws &&
        (ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING)
      ) {
        return;
      }

      const token = await getToken();
      if (!token) {
        // Wait for auth — no error UI.
        attempt += 1;
        const delay = Math.min(15_000, 1500 * 2 ** Math.min(attempt, 4));
        retryTimer = setTimeout(() => {
          void connect();
        }, delay);
        return;
      }

      try {
        ws = new WebSocket(buildWsUrl(path!, token));
      } catch {
        attempt += 1;
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        retryTimer = setTimeout(() => {
          void connect();
        }, delay);
        return;
      }

      ws.onopen = () => {
        if (everOpened) scheduleReconnectNotify();
        everOpened = true;
        attempt = 0;
      };

      ws.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(String(event.data)) as LiveEvent);
        } catch {
          /* ignore malformed */
        }
      };

      ws.onerror = () => {
        /* silent — onclose handles retry */
      };

      ws.onclose = () => {
        if (closed) return;
        const delay = Math.min(30_000, 1000 * 2 ** attempt);
        attempt += 1;
        retryTimer = setTimeout(() => {
          void connect();
        }, delay);
      };
    }

    void connect();

    appSub = AppState.addEventListener("change", (state) => {
      if (state !== "active" || closed) return;
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        void connect();
      }
    });

    return () => {
      closed = true;
      appSub?.remove();
      if (retryTimer) clearTimeout(retryTimer);
      if (reconnectNotifyTimer) clearTimeout(reconnectNotifyTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [path, enabled]);
}

export function usePatientLiveSocket(
  enabled: boolean,
  onEvent: (event: LiveEvent) => void,
  onReconnect?: () => void,
) {
  useLiveSocket({
    path: "/api/v1/ws/patient",
    enabled,
    onEvent,
    onReconnect,
  });
}

export function useProctoLiveSocket(
  practiceId: string | null,
  onEvent: (event: LiveEvent) => void,
  onReconnect?: () => void,
) {
  useLiveSocket({
    path: practiceId ? `/api/v1/ws/procto/${practiceId}` : null,
    onEvent,
    onReconnect,
  });
}
