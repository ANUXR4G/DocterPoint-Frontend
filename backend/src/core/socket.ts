import type { WebSocket } from "ws";

const HEARTBEAT_MS = 30_000;

type AliveSocket = WebSocket & { isAlive?: boolean };

export class WebSocketManager {
  rooms: Record<string, WebSocket[]> = {};
  adminConnections: WebSocket[] = [];
  online: string[] = [];
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      const all = [
        ...Object.values(this.rooms).flat(),
        ...this.adminConnections,
      ] as AliveSocket[];
      for (const ws of all) {
        if (ws.isAlive === false) {
          try {
            ws.terminate();
          } catch {
            /* ignore */
          }
          continue;
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch {
          /* ignore */
        }
      }
    }, HEARTBEAT_MS);
    // Don't keep the process awake solely for heartbeats in tests.
    if (typeof this.heartbeatTimer.unref === "function") {
      this.heartbeatTimer.unref();
    }
  }

  async connect(websocket: WebSocket, roomId?: string): Promise<void> {
    this.startHeartbeat();
    const alive = websocket as AliveSocket;
    alive.isAlive = true;
    websocket.on("pong", () => {
      alive.isAlive = true;
    });

    if (roomId) {
      if (!this.rooms[roomId]) {
        this.rooms[roomId] = [];
      }
      this.rooms[roomId].push(websocket);
      this.online.push(roomId);
    } else {
      this.adminConnections.push(websocket);
    }
  }

  disconnect(websocket: WebSocket, roomId?: string): void {
    if (roomId) {
      if (this.rooms[roomId]) {
        this.rooms[roomId] = this.rooms[roomId].filter((ws) => ws !== websocket);
        if (this.rooms[roomId].length === 0) {
          delete this.rooms[roomId];
        }
        const index = this.online.indexOf(roomId);
        if (index >= 0) {
          this.online.splice(index, 1);
        }
      }
    } else {
      this.adminConnections = this.adminConnections.filter(
        (ws) => ws !== websocket,
      );
    }
  }

  async broadcastToRoom(roomId: string, message: string): Promise<void> {
    if (!this.rooms[roomId]) return;
    for (const connection of this.rooms[roomId]) {
      if (connection.readyState === connection.OPEN) {
        connection.send(message);
      }
    }
  }

  async sendPrivateMsg(
    roomId: string,
    msg: Record<string, unknown>,
  ): Promise<void> {
    if (!this.rooms[roomId]) return;
    const payload = JSON.stringify(msg);
    for (const ws of this.rooms[roomId]) {
      if (ws.readyState === ws.OPEN) {
        ws.send(payload);
      }
    }
  }

  async broadcastToAdmins(msg: Record<string, unknown>): Promise<void> {
    const payload = JSON.stringify(msg);
    for (const adminWs of this.adminConnections) {
      if (adminWs.readyState === adminWs.OPEN) {
        adminWs.send(payload);
      }
    }
  }
}

export const socketManager = new WebSocketManager();

export function serializedMessage(msg: {
  id: string;
  senderId: string;
  receiverId?: string | null;
  content: string;
  isSeen?: boolean | null;
  type?: string | null;
  createdAt: Date;
}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    type: msg.type,
    id: msg.id,
    sender_id: msg.senderId,
    content: msg.content,
    is_seen: msg.isSeen,
    created_at: msg.createdAt,
  };
  if (msg.receiverId) {
    data.receiver_id = msg.receiverId;
  }
  return data;
}
