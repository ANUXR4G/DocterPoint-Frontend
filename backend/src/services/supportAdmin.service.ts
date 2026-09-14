import { prisma } from "../db/prisma.js";
import { uuidToBase64, base64ToUuid } from "../core/security.js";
import { socketManager, serializedMessage } from "../core/socket.js";
import { AppError } from "../core/response.js";

function serializeMessage(msg: {
  id: string;
  senderId: string;
  receiverId: string | null;
  content: string;
  isSeen: boolean | null;
  type: string | null;
  createdAt: Date;
}) {
  return {
    id: uuidToBase64(msg.id),
    sender_id: uuidToBase64(msg.senderId),
    receiver_id: msg.receiverId ? uuidToBase64(msg.receiverId) : null,
    content: msg.content,
    is_seen: msg.isSeen,
    type: msg.type,
    created_at: msg.createdAt.toISOString(),
  };
}

export class SupportAdminService {
  static async listHelpThreads() {
    const senders = await prisma.message.findMany({
      where: { type: "help" },
      select: { senderId: true },
      distinct: ["senderId"],
    });

    const threads = await Promise.all(
      senders.map(async ({ senderId }) => {
        const [latest, unreadCount, messageCount, user] = await Promise.all([
          prisma.message.findFirst({
            where: {
              senderId,
              type: { in: ["help", "reply"] },
            },
            orderBy: { createdAt: "desc" },
          }),
          prisma.message.count({
            where: { senderId, type: "help", isSeen: { not: true } },
          }),
          prisma.message.count({
            where: {
              senderId,
              type: { in: ["help", "reply"] },
            },
          }),
          prisma.user.findUnique({
            where: { id: senderId },
            select: { id: true, name: true, email: true, role: true },
          }),
        ]);

        return {
          userId: uuidToBase64(senderId),
          user,
          latestMessage: latest ? serializeMessage(latest) : null,
          unreadCount,
          messageCount,
        };
      }),
    );

    threads.sort((a, b) => {
      const aTime = a.latestMessage?.created_at ?? "";
      const bTime = b.latestMessage?.created_at ?? "";
      return bTime.localeCompare(aTime);
    });

    const totalUnread = threads.reduce((sum, t) => sum + t.unreadCount, 0);

    return { threads, totalUnread };
  }

  static async getHelpThread(userIdB64: string, page = 1, limit = 50) {
    const senderId = base64ToUuid(userIdB64);
    const user = await prisma.user.findUnique({
      where: { id: senderId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw new AppError(404, "User not found");

    const offset = (Math.max(1, page) - 1) * limit;
    const where = {
      senderId,
      type: { in: ["help", "reply"] as string[] },
    };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        skip: offset,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      prisma.message.count({ where }),
    ]);

    return {
      user,
      userId: uuidToBase64(senderId),
      total,
      messages: messages.map(serializeMessage),
    };
  }

  static async markHelpThreadSeen(userIdB64: string) {
    const senderId = base64ToUuid(userIdB64);
    await prisma.message.updateMany({
      where: { senderId, type: "help", isSeen: { not: true } },
      data: { isSeen: true },
    });
    return { ok: true };
  }

  static async postAdminReply(userIdB64: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) throw new AppError(400, "Message cannot be empty");

    const created = await prisma.message.create({
      data: {
        type: "reply",
        senderId: base64ToUuid(userIdB64),
        content: trimmed,
      },
    });

    const payload = {
      ...serializedMessage(created),
      id: uuidToBase64(created.id),
      sender_id: uuidToBase64(created.senderId),
    };

    await socketManager.sendPrivateMsg(`${userIdB64}_CHAT`, payload);
    await socketManager.broadcastToAdmins(payload);
    const { broadcastOpsInvalidate } = await import("./opsSocket.js");
    void broadcastOpsInvalidate("support").catch(() => undefined);

    return { message: payload };
  }

  static async listNotifications(opts: {
    status?: string;
    take?: number;
    skip?: number;
  }) {
    const take = Math.min(opts.take ?? 50, 100);
    const skip = opts.skip ?? 0;
    const where =
      opts.status && opts.status !== "ALL"
        ? { status: opts.status }
        : undefined;

    const [items, total, pendingCount, failedCount] = await Promise.all([
      prisma.notificationEvent.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: "desc" },
        include: {
          practice: { select: { id: true, name: true, slug: true } },
          booking: {
            select: {
              id: true,
              patientPhone: true,
              status: true,
              slotStart: true,
              sessionDate: true,
            },
          },
        },
      }),
      prisma.notificationEvent.count({ where }),
      prisma.notificationEvent.count({ where: { status: "PENDING" } }),
      prisma.notificationEvent.count({ where: { status: "FAILED" } }),
    ]);

    return {
      total,
      pendingCount,
      failedCount,
      items: items.map((n) => ({
        id: n.id,
        type: n.type,
        channel: n.channel,
        status: n.status,
        payload: n.payload,
        sentAt: n.sentAt?.toISOString() ?? null,
        createdAt: n.createdAt.toISOString(),
        practice: n.practice,
        booking: n.booking,
      })),
    };
  }
}
