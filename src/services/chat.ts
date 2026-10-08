import { prisma } from "../db/prisma.js";
import { AppError } from "../core/response.js";
import { base64ToUuid, uuidToBase64 } from "../core/security.js";
import { socketManager } from "../core/socket.js";
import { isUuid } from "../core/params.js";

/** Accept either UUID or legacy base64 user ids. */
export function resolveUserId(id: string): string {
  const raw = String(id || "").trim();
  if (!raw) throw new AppError(400, "Invalid user id.");
  if (isUuid(raw)) return raw;
  try {
    return base64ToUuid(raw);
  } catch {
    throw new AppError(400, "Invalid user id.");
  }
}

function serializedMsg(data: {
  id: string;
  senderId: string;
  receiverId: string | null;
  content: string;
  isSeen: boolean | null;
  type: string | null;
  createdAt: Date;
}) {
  const result: Record<string, unknown> = {
    id: uuidToBase64(data.id),
    sender_id: uuidToBase64(data.senderId),
    content: data.content,
    is_seen: data.isSeen,
    type: data.type,
    created_at: data.createdAt,
    // Also expose raw UUIDs for Procto UI (patient/doctor portals).
    idUuid: data.id,
    senderId: data.senderId,
    receiverId: data.receiverId,
  };

  if (data.receiverId) {
    result.receiver_id = uuidToBase64(data.receiverId);
  }

  return result;
}

/**
 * Patient ↔ doctor chat is allowed when they share a practice booking
 * (or the actor is a clinic staff member for that patient's practice).
 */
export async function assertCareChatAllowed(
  actorUserId: string,
  peerUserId: string,
): Promise<void> {
  if (actorUserId === peerUserId) {
    throw new AppError(400, "Cannot message yourself.");
  }

  const [actor, peer] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorUserId },
      select: { id: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: peerUserId },
      select: {
        id: true,
        role: true,
        phone: true,
        patient: { select: { contactNumber: true } },
      },
    }),
  ]);
  if (!actor || !peer) throw new AppError(404, "User not found.");

  // Direct booking link: patient booked with this provider
  const sharedBooking = await prisma.practiceBooking.findFirst({
    where: {
      OR: [
        { patientId: actorUserId, providerId: peerUserId },
        { patientId: peerUserId, providerId: actorUserId },
      ],
    },
    select: { id: true },
  });
  if (sharedBooking) return;

  // Clinic staff can message a patient who has any booking at their practice
  const staffMemberships = await prisma.practiceMember.findMany({
    where: {
      userId: actorUserId,
      isActive: true,
      role: { in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST",
              "NURSE"] },
    },
    select: { practiceId: true },
  });
  if (staffMemberships.length) {
    const practiceIds = staffMemberships.map((m) => m.practiceId);
    const patientBooking = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: { in: practiceIds },
        patientId: peerUserId,
      },
      select: { id: true },
    });
    if (patientBooking) return;

    // Support inbox: patient has an open WhatsApp thread at this practice
    // (Talk to Support) even before/without a booking.
    const phoneCandidates = [peer.phone, peer.patient?.contactNumber]
      .map((p) => String(p || "").replace(/\D/g, ""))
      .filter((d) => d.length >= 10);
    const last10s = [...new Set(phoneCandidates.map((d) => d.slice(-10)))];
    if (last10s.length) {
      const wa = await prisma.whatsAppConversation.findFirst({
        where: {
          practiceId: { in: practiceIds },
          OR: last10s.flatMap((last10) => [
            { patientPhone: last10 },
            { patientPhone: { endsWith: last10 } },
          ]),
        },
        select: { id: true },
      });
      if (wa) return;
    }
  }

  // Patient messaging any doctor in a practice they booked at
  if (actor.role === "user") {
    const patientPracticeIds = await prisma.practiceBooking.findMany({
      where: { patientId: actorUserId },
      select: { practiceId: true },
      distinct: ["practiceId"],
    });
    if (patientPracticeIds.length) {
      const member = await prisma.practiceMember.findFirst({
        where: {
          userId: peerUserId,
          isActive: true,
          practiceId: { in: patientPracticeIds.map((p) => p.practiceId) },
          role: { in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN"] },
        },
        select: { id: true },
      });
      if (member) return;
    }
  }

  throw new AppError(
    403,
    "You can only message doctors/patients linked by a clinic visit.",
  );
}

export class ChatService {
  static async sendHelpMessage(userId: string, content: string) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new AppError(400, "Message content is required.");
    }

    const senderId = resolveUserId(userId);
    const created = await prisma.message.create({
      data: {
        senderId,
        content: trimmed,
        type: "help",
        isSeen: false,
      },
    });

    const newHelpMsg = serializedMsg(created);
    await socketManager.broadcastToAdmins(newHelpMsg);
    await socketManager.sendPrivateMsg(
      `${uuidToBase64(senderId)}_CHAT`,
      newHelpMsg,
    );
    const { broadcastOpsInvalidate } = await import("./opsSocket.js");
    void broadcastOpsInvalidate("support").catch(() => undefined);
    return newHelpMsg;
  }

  static async sendDirectMessage(
    senderIdRaw: string,
    receiverIdRaw: string,
    content: string,
    opts?: { whatsappFanOut?: boolean },
  ) {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new AppError(400, "Message content is required.");
    }
    if (trimmed.length > 4000) {
      throw new AppError(400, "Message is too long (max 4000 characters).");
    }

    const senderId = resolveUserId(senderIdRaw);
    const receiverId = resolveUserId(receiverIdRaw);
    await assertCareChatAllowed(senderId, receiverId);

    const created = await prisma.message.create({
      data: {
        type: "direct",
        senderId,
        receiverId,
        content: trimmed,
        isSeen: false,
      },
    });

    const newDirectMsg = serializedMsg(created);
    const senderRoom = `${uuidToBase64(senderId)}_CHAT`;
    const receiverRoom = `${uuidToBase64(receiverId)}_CHAT`;
    await socketManager.sendPrivateMsg(receiverRoom, newDirectMsg);
    await socketManager.sendPrivateMsg(senderRoom, newDirectMsg);

    // Clinic → patient: mirror to WhatsApp and surface delivery on the chat UI.
    let whatsapp: { status: string; error?: string } | undefined;
    if (opts?.whatsappFanOut !== false) {
      try {
        const { fanOutCareMessageToWhatsApp } = await import(
          "./chat.whatsappFanout.js"
        );
        whatsapp = await fanOutCareMessageToWhatsApp(
          senderId,
          receiverId,
          trimmed,
        );
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.warn("[care-chat-wa] fan-out import/send error:", error);
        whatsapp = { status: "failed", error };
      }
    }

    // Staff → patient: surface on practice Notifications tab (message to patient).
    void (async () => {
      try {
        const sender = await prisma.user.findUnique({
          where: { id: senderId },
          select: { role: true, name: true },
        });
        // Patients are handled below; only staff outbound goes here.
        if (!sender || sender.role === "user") return;

        const membership = await prisma.practiceMember.findFirst({
          where: {
            userId: senderId,
            isActive: true,
            role: {
              in: [
                "DOCTOR",
                "PRACTICE_OWNER",
                "PRACTICE_ADMIN",
                "RECEPTIONIST",
              "NURSE",
              ],
            },
          },
          select: { practiceId: true },
        });
        if (!membership) return;

        const booking = await prisma.practiceBooking.findFirst({
          where: {
            practiceId: membership.practiceId,
            OR: [
              { patientId: receiverId, providerId: senderId },
              { patientId: receiverId },
            ],
          },
          orderBy: [{ updatedAt: "desc" }],
          select: {
            id: true,
            practiceId: true,
            patientName: true,
            patientPhone: true,
            providerId: true,
          },
        });
        if (!booking) return;

        const { NotificationService } = await import(
          "./procto/notification.service.js"
        );
        await NotificationService.enqueueClinicOutboundMessage({
          practiceId: booking.practiceId,
          bookingId: booking.id,
          messagePreview: trimmed,
          channel: "app",
          patientName: booking.patientName,
          patientPhone: booking.patientPhone,
          providerName: sender.name,
        });
      } catch (err) {
        console.warn(
          "[clinic-inbox] outbound message notify failed:",
          err instanceof Error ? err.message : err,
        );
      }
    })();

    // Patient → doctor/staff: surface on practice Notifications tab.
    void (async () => {
      try {
        const sender = await prisma.user.findUnique({
          where: { id: senderId },
          select: {
            role: true,
            name: true,
            phone: true,
            patient: { select: { contactNumber: true } },
          },
        });
        if (sender?.role !== "user") return;

        const booking = await prisma.practiceBooking.findFirst({
          where: {
            OR: [
              { patientId: senderId, providerId: receiverId },
              {
                patientId: senderId,
                practice: {
                  members: {
                    some: {
                      userId: receiverId,
                      isActive: true,
                      role: {
                        in: [
                          "DOCTOR",
                          "PRACTICE_OWNER",
                          "PRACTICE_ADMIN",
                          "RECEPTIONIST",
              "NURSE",
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
          orderBy: [{ updatedAt: "desc" }],
          select: {
            id: true,
            practiceId: true,
            patientName: true,
            patientPhone: true,
            providerId: true,
          },
        });
        if (!booking) return;

        const provider = await prisma.user.findUnique({
          where: { id: booking.providerId },
          select: { name: true },
        });

        const { NotificationService } = await import(
          "./procto/notification.service.js"
        );
        await NotificationService.enqueueClinicPatientMessage({
          practiceId: booking.practiceId,
          bookingId: booking.id,
          messagePreview: trimmed,
          channel: "app",
          patientName: booking.patientName || sender.name,
          patientPhone:
            booking.patientPhone ||
            sender.patient?.contactNumber ||
            sender.phone,
          providerName: provider?.name,
        });
      } catch (err) {
        console.warn(
          "[clinic-inbox] patient app message notify failed:",
          err instanceof Error ? err.message : err,
        );
      }
    })();

    return whatsapp ? { ...newDirectMsg, whatsapp } : newDirectMsg;
  }

  static async getUserHelpMessages(page = 1, limit = 10, userId: string) {
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const senderId = resolveUserId(userId);

    const where = {
      senderId,
      type: { in: ["help", "reply"] },
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
      total,
      messages: messages.map(serializedMsg),
    };
  }

  /**
   * Visit pages pass bookingId so chat shows only messages for that appointment
   * window (from booking creation until the next booking for the same patient),
   * not the entire patient↔doctor history from earlier visits.
   */
  static async resolveBookingChatWindow(
    bookingIdRaw: string,
    actorUserId: string,
  ): Promise<{ since: Date; until: Date | null }> {
    const bookingId = String(bookingIdRaw || "").trim();
    if (!isUuid(bookingId)) {
      throw new AppError(400, "Invalid booking id.");
    }

    const booking = await prisma.practiceBooking.findUnique({
      where: { id: bookingId },
      select: {
        id: true,
        createdAt: true,
        patientId: true,
        providerId: true,
        practiceId: true,
        patientPhone: true,
      },
    });
    if (!booking) throw new AppError(404, "Booking not found.");

    const isPatient = booking.patientId === actorUserId;
    const isProvider = booking.providerId === actorUserId;
    let isStaff = false;
    if (!isPatient && !isProvider) {
      const membership = await prisma.practiceMember.findFirst({
        where: {
          userId: actorUserId,
          practiceId: booking.practiceId,
          isActive: true,
          role: {
            in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST",
              "NURSE"],
          },
        },
        select: { id: true },
      });
      isStaff = Boolean(membership);
    }
    if (!isPatient && !isProvider && !isStaff) {
      throw new AppError(403, "Not allowed to open this visit chat.");
    }

    const nextWhere: {
      practiceId: string;
      createdAt: { gt: Date };
      id: { not: string };
      OR?: Array<Record<string, unknown>>;
      patientId?: string;
    } = {
      practiceId: booking.practiceId,
      createdAt: { gt: booking.createdAt },
      id: { not: booking.id },
    };

    if (booking.patientId) {
      nextWhere.patientId = booking.patientId;
    } else {
      const digits = String(booking.patientPhone || "").replace(/\D/g, "");
      const last10 = digits.length >= 10 ? digits.slice(-10) : "";
      if (last10) {
        nextWhere.OR = [
          { patientPhone: { endsWith: last10 } },
          ...(digits.length >= 11 ? [{ patientPhone: digits }] : []),
        ];
      } else {
        // No patient identity to scope a "next" visit — open-ended until now.
        return { since: booking.createdAt, until: null };
      }
    }

    const next = await prisma.practiceBooking.findFirst({
      where: nextWhere,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });

    return { since: booking.createdAt, until: next?.createdAt ?? null };
  }

  static async getUserDirectMessages(
    page = 1,
    limit = 10,
    userId: string,
    receiverId: string,
    opts?: { bookingId?: string | null },
  ) {
    page = Math.max(1, page);
    const offset = (page - 1) * limit;
    const senderUuid = resolveUserId(userId);
    const receiverUuid = resolveUserId(receiverId);

    await assertCareChatAllowed(senderUuid, receiverUuid);

    const where: {
      type: string;
      OR: Array<{ senderId: string; receiverId: string }>;
      createdAt?: { gte?: Date; lt?: Date };
    } = {
      type: "direct",
      OR: [
        { senderId: senderUuid, receiverId: receiverUuid },
        { senderId: receiverUuid, receiverId: senderUuid },
      ],
    };

    if (opts?.bookingId) {
      const window = await ChatService.resolveBookingChatWindow(
        opts.bookingId,
        senderUuid,
      );
      where.createdAt = {
        gte: window.since,
        ...(window.until ? { lt: window.until } : {}),
      };
    }

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
      total,
      messages: messages.map(serializedMsg),
    };
  }

  /** Recent care-chat peers for the signed-in user. */
  static async listThreads(userIdRaw: string, take = 40) {
    const userId = resolveUserId(userIdRaw);
    const rows = await prisma.message.findMany({
      where: {
        type: "direct",
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        content: true,
        createdAt: true,
        senderId: true,
        receiverId: true,
        isSeen: true,
      },
    });

    const peerMap = new Map<
      string,
      {
        peerId: string;
        lastMessage: string;
        lastAt: Date;
        unread: number;
      }
    >();

    for (const row of rows) {
      const peerId =
        row.senderId === userId ? row.receiverId : row.senderId;
      if (!peerId) continue;
      const existing = peerMap.get(peerId);
      if (!existing) {
        peerMap.set(peerId, {
          peerId,
          lastMessage: row.content,
          lastAt: row.createdAt,
          unread:
            row.receiverId === userId && row.isSeen === false ? 1 : 0,
        });
      } else if (row.receiverId === userId && row.isSeen === false) {
        existing.unread += 1;
      }
    }

    const peerIds = Array.from(peerMap.keys()).slice(0, take);
    const users = peerIds.length
      ? await prisma.user.findMany({
          where: { id: { in: peerIds } },
          select: { id: true, name: true, role: true, email: true },
        })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));

    return peerIds.map((id) => {
      const t = peerMap.get(id)!;
      const u = byId.get(id);
      return {
        peerId: id,
        name: u?.name ?? "User",
        role: u?.role ?? null,
        email: u?.email ?? null,
        lastMessage: t.lastMessage,
        lastAt: t.lastAt,
        unread: t.unread,
      };
    });
  }
}
