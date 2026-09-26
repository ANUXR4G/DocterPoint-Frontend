/**
 * Fan-out clinic → patient care-chat messages to WhatsApp.
 * In-app Message rows + WebSocket remain the source of truth for dashboard/app.
 * WhatsApp is best-effort (must not fail the chat HTTP response).
 */
import { prisma } from "../db/prisma.js";
import { settings } from "../config/index.js";
import {
  sendWhatsAppTemplate,
  sendWhatsAppText,
  type WhatsAppSendResult,
} from "./procto/whatsapp.client.js";
import { OPT_OUT_FOOTER, CARE_REPLY_HINT } from "./procto/whatsapp.metaTemplates.js";

/** How long session footers stay suppressed after first show (WhatsApp CS window). */
const SESSION_HINTS_TTL_MS = 24 * 60 * 60 * 1000;
const PREVIEW_MAX = 280;

/** Keep full WhatsApp MSISDN (country + national); bare 10-digit stays legacy India. */
function normalizePhone(from: string): string {
  const digits = from.replace(/\D/g, "");
  if (digits.length >= 11 && digits.length <= 15) return digits;
  if (digits.length === 10) return digits;
  return digits.slice(-15);
}

/**
 * Resolve the Meta `to` number for care-chat fan-out.
 * Prefer WhatsAppConversation.patientPhone (webhook MSISDN) over profile/booking
 * fields that may still be last-10 or wrongly prefixed with 91.
 */
async function resolveWhatsAppMsisdn(
  practiceId: string,
  ...candidates: Array<string | null | undefined>
): Promise<string> {
  const normalized = candidates
    .map((c) => (c ? normalizePhone(c) : ""))
    .filter((d) => d.length >= 10);

  const last10s = [...new Set(normalized.map((d) => d.slice(-10)))];
  for (const last10 of last10s) {
    if (last10.length !== 10) continue;
    const conv = await prisma.whatsAppConversation.findFirst({
      where: {
        practiceId,
        OR: [{ patientPhone: last10 }, { patientPhone: { endsWith: last10 } }],
      },
      orderBy: { updatedAt: "desc" },
      select: { patientPhone: true },
    });
    const fromConv = conv?.patientPhone
      ? normalizePhone(conv.patientPhone)
      : "";
    // Authoritative Meta destination (e.g. 9715… / 9198…).
    if (fromConv.length >= 11 && fromConv.length <= 15) return fromConv;
  }

  // Prefer any full international candidate (booking phone usually correct).
  const intl = normalized.find((d) => d.length >= 11 && d.length <= 15);
  if (intl) return intl;

  // Legacy bare 10-digit India — formatE164 will prepend 91 on send.
  return normalized[0] || "";
}

function truncate(text: string, max = PREVIEW_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function isOutsideWindowError(err?: string): boolean {
  const e = (err || "").toLowerCase();
  return (
    /131047/.test(err || "") ||
    /outside.*allowed.*window/.test(e) ||
    /re-engagement/.test(e) ||
    /24.?hour/.test(e)
  );
}

function isDisplayNameBlocked(err?: string): boolean {
  return /131037/.test(err || "") || /display name/i.test(err || "");
}

async function resolveStaffToPatientContext(
  staffUserId: string,
  patientUserId: string,
): Promise<{
  practiceId: string;
  practiceName: string;
  providerName: string;
  patientPhone: string;
} | null> {
  const [staff, patient] = await Promise.all([
    prisma.user.findUnique({
      where: { id: staffUserId },
      select: { id: true, name: true, role: true },
    }),
    prisma.user.findUnique({
      where: { id: patientUserId },
      select: {
        id: true,
        role: true,
        phone: true,
        patient: { select: { contactNumber: true } },
      },
    }),
  ]);
  if (!staff || !patient) {
    console.warn("[care-chat-wa] skip: user not found", {
      staffUserId,
      patientUserId,
    });
    return null;
  }
  if (patient.role !== "user") {
    console.warn(
      `[care-chat-wa] skip: receiver role=${patient.role} (expected user)`,
    );
    return null;
  }

  const isStaffRole =
    staff.role === "doctor" ||
    staff.role === "admin" ||
    staff.role === "hospital";

  const memberships = await prisma.practiceMember.findMany({
    where: {
      userId: staffUserId,
      isActive: true,
      role: {
        in: ["DOCTOR", "PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST"],
      },
    },
    select: { practiceId: true },
  });

  if (!isStaffRole && memberships.length === 0) {
    console.warn(
      `[care-chat-wa] skip: sender ${staffUserId} is not clinic staff`,
    );
    return null;
  }

  const practiceIds = memberships.map((m) => m.practiceId);

  // Prefer a booking that links this doctor/staff with this patient.
  const booking = await prisma.practiceBooking.findFirst({
    where: {
      patientId: patientUserId,
      OR: [
        { providerId: staffUserId },
        ...(practiceIds.length
          ? [{ practiceId: { in: practiceIds } }]
          : [
              {
                practice: {
                  members: {
                    some: { userId: staffUserId, isActive: true },
                  },
                },
              },
            ]),
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      patientPhone: true,
      practiceId: true,
      providerId: true,
      practice: { select: { id: true, name: true } },
    },
  });

  if (!booking?.practice) {
    // Fallback: open WhatsApp support thread at a practice this staff belongs to
    // (Talk to Support before any booking exists).
    if (practiceIds.length && patient.phone) {
      const last10 = normalizePhone(
        patient.patient?.contactNumber || patient.phone || "",
      ).slice(-10);
      if (last10.length === 10) {
        const conv = await prisma.whatsAppConversation.findFirst({
          where: {
            practiceId: { in: practiceIds },
            OR: [
              { patientPhone: last10 },
              { patientPhone: { endsWith: last10 } },
            ],
          },
          orderBy: { updatedAt: "desc" },
          select: {
            practiceId: true,
            patientPhone: true,
            practice: { select: { id: true, name: true } },
          },
        });
        if (conv?.practice) {
          const phone = await resolveWhatsAppMsisdn(
            conv.practiceId,
            conv.patientPhone,
            patient.patient?.contactNumber,
            patient.phone,
          );
          if (phone.length >= 10) {
            return {
              practiceId: conv.practiceId,
              practiceName: conv.practice.name,
              providerName: staff.name || "Your clinic",
              patientPhone: phone,
            };
          }
        }
      }
    }
    console.warn(
      `[care-chat-wa] skip: no shared booking for staff=${staffUserId} patient=${patientUserId}`,
    );
    return null;
  }

  const provider =
    booking.providerId === staffUserId
      ? staff
      : await prisma.user.findUnique({
          where: { id: booking.providerId },
          select: { name: true },
        });

  // Prefer booking phone (WhatsApp book path), then profile; conversation MSISDN wins inside resolver.
  const phone = await resolveWhatsAppMsisdn(
    booking.practiceId,
    booking.patientPhone,
    patient.patient?.contactNumber,
    patient.phone,
  );
  if (phone.length < 10) {
    console.warn(
      `[care-chat-wa] skip: patient phone missing for booking practice=${booking.practiceId}`,
    );
    return null;
  }

  return {
    practiceId: booking.practiceId,
    practiceName: booking.practice.name,
    providerName: staff.name || provider?.name || "Your clinic",
    patientPhone: phone,
  };
}

async function isOptedOut(practiceId: string, patientPhone: string): Promise<boolean> {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: {
      practiceId,
      patientPhone: { endsWith: patientPhone.slice(-10) },
    },
    orderBy: { updatedAt: "desc" },
    select: { state: true },
  });
  const state = (conv?.state ?? {}) as { waOptOut?: boolean };
  return state.waOptOut === true;
}

/**
 * Resolve Meta Cloud API phone_number_id for this clinic.
 * Prefer the practice LIVE line; fall back to platform env only as last resort.
 */
async function practicePhoneNumberId(practiceId: string): Promise<{
  phoneNumberId?: string;
  source: "practice" | "env" | "none";
}> {
  const wa = await prisma.whatsAppNumber.findFirst({
    where: {
      practiceId,
      status: { in: ["LIVE", "TEMPLATES_PENDING", "DISPLAY_NAME_PENDING"] },
      AND: [
        { wabaPhoneNumberId: { not: null } },
        { NOT: { wabaPhoneNumberId: "" } },
      ],
    },
    orderBy: [{ status: "asc" }, { activatedAt: "desc" }],
    select: { wabaPhoneNumberId: true, phoneNumber: true },
  });
  if (wa?.wabaPhoneNumberId) {
    return { phoneNumberId: wa.wabaPhoneNumberId, source: "practice" };
  }

  const envId = settings.whatsappPhoneNumberId?.trim();
  if (envId) {
    console.warn(
      `[care-chat-wa] practice ${practiceId} has no Meta phone id — using env WHATSAPP_PHONE_NUMBER_ID`,
    );
    return { phoneNumberId: envId, source: "env" };
  }

  return { phoneNumberId: undefined, source: "none" };
}

function sessionBody(
  providerName: string,
  practiceName: string,
  message: string,
  includeHints: boolean,
): string {
  const core =
    `*${providerName}* (${practiceName}):\n` + `${message.trim()}`;
  if (!includeHints) return core;
  return core + CARE_REPLY_HINT + OPT_OUT_FOOTER;
}

function hintsStillFresh(shownAt: unknown): boolean {
  if (typeof shownAt !== "string" || !shownAt.trim()) return false;
  const t = Date.parse(shownAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < SESSION_HINTS_TTL_MS;
}

async function shouldIncludeSessionHints(
  practiceId: string,
  patientPhone: string,
): Promise<boolean> {
  const digits = patientPhone.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (last10.length < 10) return true;

  const conv = await prisma.whatsAppConversation.findFirst({
    where: {
      practiceId,
      OR: [
        ...(digits.length >= 11 ? [{ patientPhone: digits }] : []),
        { patientPhone: last10 },
        { patientPhone: { endsWith: last10 } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: { state: true },
  });
  if (!conv) return true;

  const state =
    conv.state && typeof conv.state === "object" && !Array.isArray(conv.state)
      ? (conv.state as Record<string, unknown>)
      : {};
  return !hintsStillFresh(state.careSessionHintsShownAt);
}
function logResult(
  label: string,
  result: WhatsAppSendResult,
  extra?: Record<string, unknown>,
): void {
  if (result.ok || result.simulated) {
    console.log(`[care-chat-wa] ${label} ok`, {
      simulated: Boolean(result.simulated),
      usedTemplate: Boolean(result.usedTemplate),
      messageId: result.messageId,
      ...extra,
    });
  } else {
    console.warn(`[care-chat-wa] ${label} failed: ${result.error}`, extra);
  }
}

/**
 * Best-effort WhatsApp delivery for clinic → patient care chat.
 * Never throws to the chat caller.
 */
export async function fanOutCareMessageToWhatsApp(
  senderId: string,
  receiverId: string,
  content: string,
): Promise<void> {
  try {
    const ctx = await resolveStaffToPatientContext(senderId, receiverId);
    if (!ctx) return;

    // Park the bot immediately (before Meta latency) so the patient's next
    // free-text reply lands in care chat, not a leftover awaiting_* wizard.
    try {
      const { markWhatsAppConversationHandedOff } = await import(
        "./chat.whatsappInbound.js"
      );
      await markWhatsAppConversationHandedOff({
        practiceId: ctx.practiceId,
        patientPhone: ctx.patientPhone,
        carePatientId: receiverId,
        careProviderId: senderId,
      });
    } catch (err) {
      console.warn(
        "[care-chat-wa] early handoff mark failed:",
        err instanceof Error ? err.message : err,
      );
    }

    if (await isOptedOut(ctx.practiceId, ctx.patientPhone)) {
      console.log(
        `[care-chat-wa] skip opt-out patient …${ctx.patientPhone.slice(-4)} practice ${ctx.practiceId}`,
      );
      return;
    }

    const line = await practicePhoneNumberId(ctx.practiceId);
    if (line.source === "none") {
      console.warn(
        `[care-chat-wa] skip: no Meta phone id for practice ${ctx.practiceId} and no env fallback`,
      );
      return;
    }

    console.log("[care-chat-wa] sending", {
      practiceId: ctx.practiceId,
      to: `…${ctx.patientPhone.slice(-4)}`,
      toLen: ctx.patientPhone.length,
      lineSource: line.source,
      phoneNumberId: line.phoneNumberId?.slice(-6),
    });

    const preview = truncate(content);
    const envFallback = settings.whatsappPhoneNumberId?.trim() || undefined;
    const candidates = [
      line.phoneNumberId,
      ...(envFallback && envFallback !== line.phoneNumberId
        ? [envFallback]
        : []),
    ].filter(Boolean) as string[];

    const extraBase = {
      practiceId: ctx.practiceId,
      to: `…${ctx.patientPhone.slice(-4)}`,
      toLen: ctx.patientPhone.length,
      lineSource: line.source,
    };

    const includeHints = await shouldIncludeSessionHints(
      ctx.practiceId,
      ctx.patientPhone,
    );
    const body = sessionBody(
      ctx.providerName,
      ctx.practiceName,
      content,
      includeHints,
    );

    let lastSession: WhatsAppSendResult | null = null;
    let delivered = false;
    for (const phoneNumberId of candidates) {
      const session = await sendWhatsAppText(
        ctx.patientPhone,
        body,
        phoneNumberId,
      );
      logResult("session text", session, {
        ...extraBase,
        phoneNumberId,
        hints: includeHints,
      });
      lastSession = session;
      if (session.ok || session.simulated) {
        delivered = true;
        break;
      }
      // US / unverified display names (#131037) → try next line (usually env India).
      if (!isDisplayNameBlocked(session.error) && !isOutsideWindowError(session.error)) {
        // Other hard failures still attempt template on this line below.
        break;
      }
    }

    if (!delivered) {
      const templateLine =
        candidates.find((id) => id !== lastSession?.error) || candidates[0];
      const templated = await sendWhatsAppTemplate(
        ctx.patientPhone,
        "CLINIC_CARE_MESSAGE",
        {
          practiceName: ctx.practiceName,
          providerName: ctx.providerName,
          messagePreview: preview,
        },
        templateLine || line.phoneNumberId,
      );
      logResult("CLINIC_CARE_MESSAGE template", templated, extraBase);
      delivered = Boolean(templated.ok || templated.simulated);

      if (!templated.ok && !templated.simulated) {
        if (isOutsideWindowError(lastSession?.error)) {
          console.warn(
            "[care-chat-wa] patient outside 24h window and care-message template not usable — " +
              "ask patient to message the clinic WhatsApp once, or wait for Meta to APPROVE docline_clinic_care_message",
          );
        }
        if (
          isDisplayNameBlocked(lastSession?.error) ||
          isDisplayNameBlocked(templated.error)
        ) {
          console.warn(
            "[care-chat-wa] Meta display name not approved (#131037) on this line — use India LIVE number or wait for Meta approval",
          );
        }
      }
    }

    // Refresh handoff + session-hint stamp after a successful delivery.
    if (delivered) {
      void import("./chat.whatsappInbound.js")
        .then(({ markWhatsAppConversationHandedOff }) =>
          markWhatsAppConversationHandedOff({
            practiceId: ctx.practiceId,
            patientPhone: ctx.patientPhone,
            markSessionHintsShown: includeHints,
            carePatientId: receiverId,
            careProviderId: senderId,
          }),
        )
        .catch((err) =>
          console.warn(
            "[care-chat-wa] handoff mark failed:",
            err instanceof Error ? err.message : err,
          ),
        );
    }
  } catch (err) {
    console.warn(
      "[care-chat-wa] fan-out failed:",
      err instanceof Error ? err.message : err,
    );
  }
}
