import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { ensureAccessToken, getApiUrl } from "@/lib/api";

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
  onOpen?: () => void;
  onClose?: () => void;
  enabled?: boolean;
};

/** Shared live socket for Expo dashboards (not Mira). Silent — never surfaces errors. */
export function useLiveSocket({
  path,
  onEvent,
  onReconnect,
  onOpen,
  onClose,
  enabled = true,
}: Options) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;
  const reconnectRef = useRef(onReconnect);
  reconnectRef.current = onReconnect;
  const openRef = useRef(onOpen);
  openRef.current = onOpen;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!enabled || !path) return;

    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectNotifyTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    let attempt = 0;
    let everOpened = false;
    let connectGen = 0;
    let appSub: { remove: () => void } | null = null;

    function scheduleReconnectNotify() {
      if (reconnectNotifyTimer) clearTimeout(reconnectNotifyTimer);
      reconnectNotifyTimer = setTimeout(() => {
        reconnectRef.current?.();
      }, 400);
    }

    function scheduleRetry() {
      if (closed) return;
      attempt += 1;
      const delay =
        attempt <= 6
          ? 400
          : Math.min(15_000, 1500 * 2 ** Math.min(attempt - 6, 4));
      retryTimer = setTimeout(() => {
        void connect();
      }, delay);
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

      const gen = ++connectGen;
      const token = await ensureAccessToken();
      if (closed || gen !== connectGen) return;

      if (!token) {
        scheduleRetry();
        return;
      }

      try {
        ws = new WebSocket(buildWsUrl(path!, token));
      } catch {
        scheduleRetry();
        return;
      }

      ws.onopen = () => {
        openRef.current?.();
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
        closeRef.current?.();
        scheduleRetry();
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
      connectGen += 1;
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
  onOpen?: () => void,
  onClose?: () => void,
) {
  useLiveSocket({
    path: "/api/v1/ws/patient",
    enabled,
    onEvent,
    onReconnect,
    onOpen,
    onClose,
  });
}

export function useProctoLiveSocket(
  practiceId: string | null,
  onEvent: (event: LiveEvent) => void,
  onReconnect?: () => void,
  onOpen?: () => void,
  onClose?: () => void,
) {
  useLiveSocket({
    path: practiceId ? `/api/v1/ws/procto/${practiceId}` : null,
    onEvent,
    onReconnect,
    onOpen,
    onClose,
  });
}
