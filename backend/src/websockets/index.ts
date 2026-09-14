import type { Server } from "http";
import type { IncomingMessage } from "http";
import { WebSocketServer } from "ws";
import type { WebSocket } from "ws";
import { prisma } from "../db/prisma.js";
import {
  base64ToUuid,
  decodeToken,
  uuidToBase64,
  type TokenPayload,
} from "../core/security.js";
import { socketManager, serializedMessage } from "../core/socket.js";
import { ADMIN_OPS_ROOM } from "../services/opsSocket.js";
import { ChatService, resolveUserId } from "../services/chat.js";
import { patientRoomId } from "../services/procto/proctoSocket.js";

function serializeWsMessage(msg: {
  id: string;
  senderId: string;
  receiverId?: string | null;
  content: string;
  isSeen?: boolean | null;
  type?: string | null;
  createdAt: Date;
}) {
  return {
    ...serializedMessage(msg),
    id: uuidToBase64(msg.id),
    sender_id: uuidToBase64(msg.senderId),
    receiver_id: msg.receiverId ? uuidToBase64(msg.receiverId) : undefined,
    idUuid: msg.id,
    senderId: msg.senderId,
    receiverId: msg.receiverId ?? null,
  };
}

async function handleChatMessage(userId: string, data: Record<string, unknown>) {
  if (data.type === "help") {
    await ChatService.sendHelpMessage(userId, String(data.content ?? ""));
    return;
  }

  if (data.type === "direct") {
    await ChatService.sendDirectMessage(
      userId,
      String(data.receiver_id ?? data.receiverId ?? ""),
      String(data.content ?? ""),
    );
  }
}

async function handleAdminReply(data: Record<string, unknown>) {
  const { SupportAdminService } = await import(
    "../services/supportAdmin.service.js"
  );
  await SupportAdminService.postAdminReply(
    String(data.user_id),
    String(data.content ?? ""),
  );
}

function bindSocketLifecycle(
  ws: WebSocket,
  roomId: string | undefined,
  onMessage?: (payload: Record<string, unknown>) => Promise<void>,
) {
  void socketManager.connect(ws, roomId);

  ws.on("message", (raw) => {
    if (!onMessage) return;
    try {
      const payload = JSON.parse(raw.toString()) as Record<string, unknown>;
      void onMessage(payload).catch((err) => {
        console.error("WebSocket handler error", err);
      });
    } catch (error) {
      console.error("Invalid websocket payload", error);
    }
  });

  ws.on("close", () => {
    socketManager.disconnect(ws, roomId);
  });
}

function parseCookieToken(cookieHeader?: string): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("access_token="));
  if (!match) return undefined;
  return decodeURIComponent(match.slice("access_token=".length));
}

function extractWsToken(
  request: IncomingMessage,
  url: URL,
): string | undefined {
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) return fromQuery;
  const auth = request.headers.authorization;
  if (auth?.toLowerCase().startsWith("bearer ")) {
    return auth.slice(7).trim();
  }
  return parseCookieToken(request.headers.cookie);
}

function requireTokenPayload(
  request: IncomingMessage,
  url: URL,
): TokenPayload {
  const token = extractWsToken(request, url);
  if (!token) {
    throw Object.assign(new Error("unauthorized"), { code: 4401 });
  }
  try {
    return decodeToken(token);
  } catch {
    throw Object.assign(new Error("unauthorized"), { code: 4401 });
  }
}

function isAdminPayload(payload: TokenPayload): boolean {
  // Platform admin scopes only (doctors also have practice:admin).
  return payload.scopes.includes("users:delete");
}

function closeUnauthorized(ws: WebSocket, code = 4401) {
  try {
    ws.close(code, code === 4403 ? "forbidden" : "unauthorized");
  } catch {
    /* ignore */
  }
}

export function setupWebSockets(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "", "http://localhost");
    const pathname = url.pathname;

    if (!pathname.startsWith("/api/v1/ws/")) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      void (async () => {
        const parts = pathname
          .replace("/api/v1/ws/", "")
          .split("/")
          .filter(Boolean);

        try {
          if (parts[0] === "patient") {
            const payload = requireTokenPayload(request, url);
            bindSocketLifecycle(ws, patientRoomId(payload.sub));
            return;
          }

          if (parts[0] === "monitoring" && parts[1]) {
            const payload = requireTokenPayload(request, url);
            const targetId = parts[1];
            const self =
              payload.sub === targetId ||
              uuidToBase64(payload.sub) === targetId ||
              payload.sub ===
                (() => {
                  try {
                    return base64ToUuid(targetId);
                  } catch {
                    return "";
                  }
                })();
            if (!self && !isAdminPayload(payload)) {
              closeUnauthorized(ws, 4403);
              return;
            }
            const roomKey =
              targetId.includes("-") ? targetId : base64ToUuid(targetId);
            bindSocketLifecycle(ws, `${roomKey}_MONITORING`);
            return;
          }

          if (parts[0] === "chats" && parts[1]) {
            const payload = requireTokenPayload(request, url);
            const pathUser = parts[1];
            let pathUuid: string;
            try {
              pathUuid = resolveUserId(pathUser);
            } catch {
              closeUnauthorized(ws, 4401);
              return;
            }
            if (payload.sub !== pathUuid && !isAdminPayload(payload)) {
              closeUnauthorized(ws, 4403);
              return;
            }
            const roomUser = uuidToBase64(pathUuid);
            bindSocketLifecycle(ws, `${roomUser}_CHAT`, (msg) =>
              handleChatMessage(pathUuid, msg),
            );
            return;
          }

          if (parts[0] === "procto" && parts[1]) {
            const practiceId = parts[1];
            const payload = requireTokenPayload(request, url);
            const member = await prisma.practiceMember.findUnique({
              where: {
                practiceId_userId: {
                  practiceId,
                  userId: payload.sub,
                },
              },
            });
            if (!member?.isActive) {
              closeUnauthorized(ws, 4403);
              return;
            }
            bindSocketLifecycle(ws, `${practiceId}_PROCTO`);
            return;
          }

          if (
            parts[0] === "appointment" &&
            parts[1] === "requests" &&
            parts[2]
          ) {
            const payload = requireTokenPayload(request, url);
            const doctorId = parts[2];
            let doctorUuid = doctorId;
            try {
              if (!doctorId.includes("-")) doctorUuid = base64ToUuid(doctorId);
            } catch {
              closeUnauthorized(ws, 4401);
              return;
            }
            if (payload.sub !== doctorUuid && !isAdminPayload(payload)) {
              closeUnauthorized(ws, 4403);
              return;
            }
            bindSocketLifecycle(ws, `${doctorId}_RA`);
            return;
          }

          if (parts[0] === "admin" && parts[1] === "help") {
            const payload = requireTokenPayload(request, url);
            if (!isAdminPayload(payload)) {
              closeUnauthorized(ws, 4403);
              return;
            }
            bindSocketLifecycle(ws, undefined, handleAdminReply);
            return;
          }

          if (parts[0] === "admin" && parts[1] === "ops") {
            const payload = requireTokenPayload(request, url);
            if (!isAdminPayload(payload)) {
              closeUnauthorized(ws, 4403);
              return;
            }
            bindSocketLifecycle(ws, ADMIN_OPS_ROOM);
            return;
          }

          ws.close();
        } catch (err) {
          const code =
            err && typeof err === "object" && "code" in err
              ? Number((err as { code: number }).code)
              : 4401;
          closeUnauthorized(ws, code);
        }
      })();
    });
  });
}
