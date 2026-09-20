import { prisma } from "../db/prisma.js";
import { uuidToBase64 } from "../core/security.js";
import { socketManager } from "../core/socket.js";

function looksLikeBotCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (/^(?:menu|post|booking|slot|date|mode):/i.test(t)) return true;
  if (
    /^(book|cancel|reschedule|status|help|menu|bot|resume|hi|hello|hey|start|register|stop|report|reports|my\s*docs?|document|documents|doctors?|faq|info|message|msg|new\s+book)\b/.test(
      t,
    )
  ) {
    return true;
  }
  // Explicit booking verbs mid-message still go to the bot.
  if (/\b(book|cancel|reschedule|status)\b/.test(t) && t.length < 80) return true;
  if (/\b(message|msg|chat|text)\s+(my\s+)?(the\s+)?doctor\b/.test(t)) {
    return true;
  }
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
 * Returns whether the bot should defer (doctor / message-doctor owns the thread).
 */
export async function ingestWhatsAppPatientReply(opts: {
  practiceId: string;
  patientPhone: string;
  text: string;
  conversationAlreadyHandedOff?: boolean;
  /** True after patient chose "Message doctor" — free text stays in care chat. */
  postBookingCare?: boolean;
  /** Doctor selected from multi-booking Message-doctor picker. */
  preferredProviderId?: string;
  preferredBookingId?: string;
}): Promise<{ ingested: boolean; shouldDeferToHuman: boolean }> {
  const text = String(opts.text || "").trim();
  if (!text || text.length > 4000) {
    return { ingested: false, shouldDeferToHuman: false };
  }

  // Menu / list taps and booking commands belong to the bot — never mirror them.
  if (looksLikeBotCommand(text)) {
    return { ingested: false, shouldDeferToHuman: false };
  }

  const digitsRaw = String(opts.patientPhone || "").replace(/\D/g, "");
  const digits = digitsRaw.slice(-10);
  if (digits.length < 10) {
    return { ingested: false, shouldDeferToHuman: false };
  }

  const patient = await prisma.user.findFirst({
    where: {
      role: "user",
      OR: [
        ...(digitsRaw.length >= 11
          ? [
              { phone: digitsRaw },
              { patient: { is: { contactNumber: digitsRaw } } },
            ]
          : []),
        { phone: digits },
        { phone: { endsWith: digits } },
        { patient: { is: { contactNumber: digits } } },
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

  const phoneOr = [
    { patientId: patient.id },
    { patientPhone: digits },
    { patientPhone: { endsWith: digits } },
    ...(digitsRaw.length >= 11
      ? [{ patientPhone: digitsRaw }, { patientPhone: { endsWith: digitsRaw } }]
      : []),
  ];

  // Prefer the booking/doctor the patient picked in Message-doctor flow.
  let booking: {
    providerId: string;
    patientId: string | null;
    status: string;
  } | null = null;

  if (opts.preferredBookingId) {
    const preferred = await prisma.practiceBooking.findFirst({
      where: {
        id: opts.preferredBookingId,
        practiceId: opts.practiceId,
        OR: phoneOr,
      },
      select: { providerId: true, patientId: true, status: true },
    });
    if (preferred?.providerId) booking = preferred;
  }

  if (!booking?.providerId && opts.preferredProviderId) {
    const preferred = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: opts.practiceId,
        providerId: opts.preferredProviderId,
        OR: phoneOr,
        status: {
          in: ["SCHEDULED", "REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"],
        },
      },
      orderBy: [{ slotStart: "desc" }, { updatedAt: "desc" }],
      select: { providerId: true, patientId: true, status: true },
    });
    if (preferred?.providerId) booking = preferred;
  }

  // Prefer an open visit; fall back to any recent booking so replies still land
  // in care chat after COMPLETED visits.
  if (!booking?.providerId) {
    booking = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: opts.practiceId,
        OR: phoneOr,
        status: {
          in: ["SCHEDULED", "REQUESTED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"],
        },
      },
      orderBy: [{ slotStart: "desc" }, { updatedAt: "desc" }],
      select: { providerId: true, patientId: true, status: true },
    });
  }
  if (!booking?.providerId) {
    booking = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: opts.practiceId,
        OR: [
          { patientId: patient.id },
          { patientPhone: { endsWith: digits } },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      select: { providerId: true, patientId: true, status: true },
    });
  }
  if (!booking?.providerId) {
    console.log("[care-chat-wa] inbound skip: no booking for patient", {
      practiceId: opts.practiceId,
      patientId: patient.id,
      from: `…${digits.slice(-4)}`,
    });
    return { ingested: false, shouldDeferToHuman: false };
  }

  // Keep patientId linked so doctor mobile visit chat can open the thread.
  if (!booking.patientId) {
    void prisma.practiceBooking
      .updateMany({
        where: {
          practiceId: opts.practiceId,
          patientId: null,
          OR: [
            { patientPhone: { endsWith: digits } },
            ...(digitsRaw.length >= 11 ? [{ patientPhone: digitsRaw }] : []),
          ],
        },
        data: { patientId: patient.id },
      })
      .catch(() => undefined);
  }

  const providerId = opts.preferredProviderId || booking.providerId;

  const deferFor = async (): Promise<boolean> => {
    // Booking commands / BOT resume / post-booking menu always go to orchestrator.
    if (looksLikeBotCommand(text)) return false;
    // Only park the bot after explicit "Message doctor".
    if (opts.postBookingCare === true) return true;
    // Doctor already chatting: still allow post-booking menu unless they
    // are mid care-only mode (postBookingCare). Recent doctor messages alone
    // must NOT swallow Reschedule/Cancel/New/Message-doctor prompts.
    if (opts.conversationAlreadyHandedOff === true && opts.postBookingCare) {
      return true;
    }
    return false;
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

  // Also nudge practice live socket so visit screens refresh.
  try {
    await socketManager.sendPrivateMsg(`${opts.practiceId}_PROCTO`, {
      event: "booking_updated",
      booking: { id: undefined, patientId: patient.id },
    });
  } catch {
    /* ignore */
  }

  console.log("[care-chat-wa] ingested patient WA reply", {
    practiceId: opts.practiceId,
    from: `…${digits.slice(-4)}`,
    messageId: created.id,
    providerId,
  });

  return { ingested: true, shouldDeferToHuman: await deferFor() };
}

/** After doctor→patient WhatsApp care send, park the bot so replies stay human. */
export async function markWhatsAppConversationHandedOff(opts: {
  practiceId: string;
  patientPhone: string;
}): Promise<void> {
  const digits = String(opts.patientPhone || "").replace(/\D/g, "");
  const last10Phone = digits.slice(-10);
  if (last10Phone.length < 10) return;

  // Prefer the real Meta conversation row (full MSISDN); fall back to legacy last-10 key.
  const existing = await prisma.whatsAppConversation.findFirst({
    where: {
      practiceId: opts.practiceId,
      OR: [
        ...(digits.length >= 11 ? [{ patientPhone: digits }] : []),
        { patientPhone: last10Phone },
        { patientPhone: { endsWith: last10Phone } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { id: true, patientPhone: true, state: true },
  });

  const phoneKey =
    existing?.patientPhone ||
    (digits.length >= 11 && digits.length <= 15 ? digits : last10Phone);

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
        patientPhone: phoneKey,
      },
    },
    create: {
      practiceId: opts.practiceId,
      patientPhone: phoneKey,
      status: "handed_off",
      state: { ...prev, handedOff: true },
    },
    update: {
      status: "handed_off",
      state: { ...prev, handedOff: true },
    },
  });
}
