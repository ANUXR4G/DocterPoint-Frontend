import { prisma } from "../db/prisma.js";
import { uuidToBase64 } from "../core/security.js";
import { socketManager } from "../core/socket.js";

function last10(phone: string): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

function looksLikeBotCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (
    /^(book|cancel|reschedule|status|help|menu|bot|resume|hi|hello|hey|start|register|stop|report|reports|my\s*docs?|document|documents|attach)\b/.test(
      t,
    )
  ) {
    return true;
  }
  // Explicit booking verbs mid-message still go to the bot.
  if (/\b(book|cancel|reschedule)\b/.test(t) && t.length < 80) return true;
  return false;
}

/** Same shape as ChatService.serializedMsg so portal/apps accept the socket event. */
function serializedCareMsg(data: {
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
 * Mirror a patient WhatsApp text into GlucoGuide care chat (portal + apps).
 * Returns whether the bot should defer (doctor already in the thread).
 */
export async function ingestWhatsAppPatientReply(opts: {
  practiceId: string;
  patientPhone: string;
  text: string;
  conversationAlreadyHandedOff?: boolean;
}): Promise<{ ingested: boolean; shouldDeferToHuman: boolean }> {
  const text = String(opts.text || "").trim();
  if (!text || text.length > 4000) {
    return { ingested: false, shouldDeferToHuman: false };
  }

  const digits = last10(opts.patientPhone);
  if (digits.length < 10) {
    return { ingested: false, shouldDeferToHuman: false };
  }

  const patient = await prisma.user.findFirst({
    where: {
      role: "user",
      OR: [
        { phone: { endsWith: digits } },
        { patient: { is: { contactNumber: { endsWith: digits } } } },
      ],
    },
    select: { id: true },
  });
  if (!patient) {
    console.log("[care-chat-wa] inbound skip: no patient user for phone", {
      practiceId: opts.practiceId,
      from: `…${digits.slice(-4)}`,
    });
    return { ingested: false, shouldDeferToHuman: false };
  }

  const booking = await prisma.practiceBooking.findFirst({
    where: {
      practiceId: opts.practiceId,
      OR: [
        { patientId: patient.id },
        { patientPhone: { endsWith: digits } },
      ],
      status: { notIn: ["CANCELED", "NO_SHOW"] },
    },
    orderBy: [{ slotStart: "desc" }, { updatedAt: "desc" }],
    select: { providerId: true },
  });
  if (!booking?.providerId) {
    console.log("[care-chat-wa] inbound skip: no open booking for patient", {
      practiceId: opts.practiceId,
      patientId: patient.id,
      from: `…${digits.slice(-4)}`,
    });
    return { ingested: false, shouldDeferToHuman: false };
  }

  const providerId = booking.providerId;

  const deferFor = async (): Promise<boolean> => {
    // Booking commands / BOT resume always go to the orchestrator.
    if (looksLikeBotCommand(text)) return false;
    if (opts.conversationAlreadyHandedOff === true) return true;
    return hasRecentDoctorCareMessage(patient.id, providerId);
  };

  const since = new Date(Date.now() - 30_000);
  const dup = await prisma.message.findFirst({
    where: {
      type: "direct",
      senderId: patient.id,
      receiverId: providerId,
      content: text,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  if (dup) {
    return { ingested: true, shouldDeferToHuman: await deferFor() };
  }

  const created = await prisma.message.create({
    data: {
      content: text,
      type: "direct",
      senderId: patient.id,
      receiverId: providerId,
      isSeen: false,
    },
  });

  const payload = serializedCareMsg(created);
  const patientRoom = `${uuidToBase64(patient.id)}_CHAT`;
  const providerRoom = `${uuidToBase64(providerId)}_CHAT`;
  await socketManager.sendPrivateMsg(providerRoom, payload);
  await socketManager.sendPrivateMsg(patientRoom, payload);

  console.log("[care-chat-wa] ingested patient WA reply", {
    practiceId: opts.practiceId,
    from: `…${digits.slice(-4)}`,
    messageId: created.id,
  });

  return { ingested: true, shouldDeferToHuman: await deferFor() };
}

async function hasRecentDoctorCareMessage(
  patientId: string,
  providerId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - 72 * 3600_000);
  const found = await prisma.message.findFirst({
    where: {
      type: "direct",
      senderId: providerId,
      receiverId: patientId,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(found);
}

/** After doctor→patient WhatsApp care send, park the bot so replies stay human. */
export async function markWhatsAppConversationHandedOff(opts: {
  practiceId: string;
  patientPhone: string;
}): Promise<void> {
  const phone = last10(opts.patientPhone);
  if (phone.length < 10) return;

  const existing = await prisma.whatsAppConversation.findUnique({
    where: {
      practiceId_patientPhone: {
        practiceId: opts.practiceId,
        patientPhone: phone,
      },
    },
    select: { id: true, state: true },
  });

  const prev =
    existing?.state &&
    typeof existing.state === "object" &&
    !Array.isArray(existing.state)
      ? (existing.state as Record<string, unknown>)
      : {};

  await prisma.whatsAppConversation.upsert({
    where: {
      practiceId_patientPhone: {
        practiceId: opts.practiceId,
        patientPhone: phone,
      },
    },
    create: {
      practiceId: opts.practiceId,
      patientPhone: phone,
      status: "handed_off",
      state: { ...prev, handedOff: true },
    },
    update: {
      status: "handed_off",
      state: { ...prev, handedOff: true },
    },
  });
}
