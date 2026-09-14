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
import { OPT_OUT_FOOTER } from "./procto/whatsapp.metaTemplates.js";

const PREVIEW_MAX = 280;

function last10(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
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

  const phone =
    last10(booking.patientPhone || "") ||
    last10(patient.patient?.contactNumber || "") ||
    last10(patient.phone || "");
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
): string {
  return (
    `*${providerName}* (${practiceName}):\n` +
    `${message.trim()}\n\n` +
    `Reply here on WhatsApp, or in the GlucoGuide app / patient portal.` +
    OPT_OUT_FOOTER
  );
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
      lineSource: line.source,
    };

    let lastSession: WhatsAppSendResult | null = null;
    let delivered = false;
    for (const phoneNumberId of candidates) {
      const session = await sendWhatsAppText(
        ctx.patientPhone,
        sessionBody(ctx.providerName, ctx.practiceName, content),
        phoneNumberId,
      );
      logResult("session text", session, { ...extraBase, phoneNumberId });
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

    // Park the booking bot so patient replies land in care chat, not bot flows.
    if (delivered) {
      void import("./chat.whatsappInbound.js")
        .then(({ markWhatsAppConversationHandedOff }) =>
          markWhatsAppConversationHandedOff({
            practiceId: ctx.practiceId,
            patientPhone: ctx.patientPhone,
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
