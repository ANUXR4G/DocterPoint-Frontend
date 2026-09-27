/**
 * Proactive WhatsApp mid-flow idle handling:
 * 1) Reminder when the patient stops replying
 * 2) Chat-closed message + reset to idle if still silent
 *
 * Timings (ms): WA_IDLE_REMINDER_MS (default 10m), WA_IDLE_CLOSE_MS (default 30m).
 * Free-form text is OK — these fire within an open customer-service window.
 */
import { prisma } from "../../db/prisma.js";
import {
  sendWhatsAppInteractiveButtons,
  sendWhatsAppInteractiveList,
  sendWhatsAppText,
} from "./whatsapp.client.js";
import { BotPrompts } from "./whatsapp.templates.js";
import type { ConversationState } from "./whatsapp.orchestrator.js";
import { resolveLang, type WaLang } from "./whatsapp.i18n.js";

export const IDLE_REMINDER_MS =
  Number(process.env.WA_IDLE_REMINDER_MS) > 0
    ? Number(process.env.WA_IDLE_REMINDER_MS)
    : 10 * 60_000;

export const IDLE_CLOSE_MS =
  Number(process.env.WA_IDLE_CLOSE_MS) > 0
    ? Number(process.env.WA_IDLE_CLOSE_MS)
    : 30 * 60_000;

export type IdleTimeoutAction = "none" | "remind" | "close";

export function decideIdleTimeoutAction(
  ageMs: number,
  reminderAlreadySent: boolean,
  opts?: { reminderMs?: number; closeMs?: number },
): IdleTimeoutAction {
  const reminderMs = opts?.reminderMs ?? IDLE_REMINDER_MS;
  const closeMs = opts?.closeMs ?? IDLE_CLOSE_MS;
  if (ageMs >= closeMs) return "close";
  if (ageMs >= reminderMs && !reminderAlreadySent) return "remind";
  return "none";
}

function isActiveAwaitingReply(state: ConversationState): boolean {
  if (state.waOptOut) return false;
  if (state.handedOff && !state.postBookingCare) return false;
  if (state.step === "agent_transfer") return false;
  const step = state.step;
  return Boolean(step && step !== "idle");
}

/** What the patient was doing, for the idle reminder ("…while *booking…*"). */
export function idleActivityLabel(
  state: ConversationState,
): { en: string; hi: string } | null {
  const step = state.step ?? "";
  if (step.startsWith("awaiting_register_")) {
    if (state.registeringFamily) {
      const name = state.regName?.trim();
      return name
        ? { en: `adding ${name} to your family`, hi: `${name} को परिवार में जोड़ते समय` }
        : { en: "adding a family member", hi: "परिवार सदस्य जोड़ते समय" };
    }
    return { en: "creating your patient profile", hi: "प्रोफ़ाइल बनाते समय" };
  }
  if (step.startsWith("awaiting_cancel_")) {
    return { en: "cancelling a booking", hi: "बुकिंग रद्द करते समय" };
  }
  if (step.startsWith("awaiting_reschedule_")) {
    return { en: "rescheduling a booking", hi: "बुकिंग बदलते समय" };
  }
  if (step.startsWith("awaiting_manage_")) {
    return { en: "managing your booking", hi: "बुकिंग मैनेज करते समय" };
  }
  if (step.startsWith("awaiting_message_doctor_")) {
    return { en: "messaging your doctor", hi: "डॉक्टर को संदेश भेजते समय" };
  }
  if (
    step.startsWith("awaiting_document_") ||
    step.startsWith("awaiting_report") ||
    step === "awaiting_attach_offer"
  ) {
    return { en: "attaching a document", hi: "दस्तावेज़ भेजते समय" };
  }
  if (
    [
      "awaiting_book_whom",
      "awaiting_book_patient",
      "awaiting_family_pick",
      "awaiting_specialty",
      "awaiting_provider",
      "awaiting_date",
      "awaiting_mode",
      "awaiting_slot",
      "awaiting_confirm",
      "awaiting_nlu_book_confirm",
    ].includes(step)
  ) {
    return { en: "booking an appointment", hi: "अपॉइंटमेंट बुक करते समय" };
  }
  return null;
}

function activityAgeMs(state: ConversationState, now: number): number | null {
  if (!state.updatedAt) return null;
  const t = Date.parse(state.updatedAt);
  if (Number.isNaN(t)) return null;
  return now - t;
}

const MAIN_MENU_ROWS = [
  {
    id: "menu:book",
    title: "1 · Book appt",
    description: "Book a new appointment",
  },
  {
    id: "menu:bookings",
    title: "2 · My bookings",
    description: "View or manage visits",
  },
  {
    id: "menu:family",
    title: "3 · My family",
    description: "View or add family members",
  },
  {
    id: "menu:support",
    title: "4 · Support",
    description: "Talk to an agent",
  },
  {
    id: "menu:message_doctor",
    title: "5 · Msg doctor",
    description: "Message your doctor",
  },
  {
    id: "menu:report",
    title: "6 · Attach doc",
    description: "Send a report to doctor",
  },
];

async function resolvePhoneNumberId(
  practiceId: string,
): Promise<string | undefined> {
  const waNumber = await prisma.whatsAppNumber.findFirst({
    where: {
      practiceId,
      status: { in: ["LIVE", "TEMPLATES_PENDING", "DISPLAY_NAME_PENDING"] },
    },
    select: { wabaPhoneNumberId: true },
  });
  return waNumber?.wabaPhoneNumberId ?? undefined;
}

async function sendReminder(
  to: string,
  lang: WaLang,
  state: ConversationState,
  phoneNumberId?: string,
): Promise<boolean> {
  const body = BotPrompts.idleReminder(lang, idleActivityLabel(state));
  const btnSent = await sendWhatsAppInteractiveButtons(
    to,
    {
      body,
      buttons: [
        { id: "continue:flow", title: "Continue" },
        { id: "idle:main", title: "Main Menu" },
      ],
    },
    phoneNumberId,
  );
  if (btnSent.ok && !btnSent.simulated) return true;
  const textSent = await sendWhatsAppText(
    to,
    `${body}\n\nReply *Continue* or *Main Menu*.`,
    phoneNumberId,
  );
  return textSent.ok;
}

async function sendChatClosed(
  to: string,
  lang: WaLang,
  phoneNumberId?: string,
): Promise<boolean> {
  const body = BotPrompts.chatClosed(lang);
  const listSent = await sendWhatsAppInteractiveList(
    to,
    {
      header: "Menu",
      body: body.slice(0, 400),
      buttonLabel: "Menu",
      sectionTitle: "Options",
      rows: MAIN_MENU_ROWS.map((r) => ({
        id: r.id,
        title: r.title.slice(0, 24),
        description: r.description.slice(0, 72),
      })),
    },
    phoneNumberId,
  );
  if (listSent.ok && !listSent.simulated) return true;
  const textSent = await sendWhatsAppText(to, body, phoneNumberId);
  return textSent.ok;
}

/**
 * Scan active mid-flow conversations and send reminder / chat-closed.
 * Safe to run every ~60s.
 */
export async function processWhatsAppIdleTimeouts(now = Date.now()): Promise<{
  reminded: number;
  closed: number;
}> {
  const stats = { reminded: 0, closed: 0 };

  // Only rows touched recently enough to still be mid-flow (close window + buffer)
  const since = new Date(now - IDLE_CLOSE_MS - 24 * 60_000);
  const conversations = await prisma.whatsAppConversation.findMany({
    where: {
      status: "bot_active",
      updatedAt: { gte: since },
    },
    take: 200,
    orderBy: { updatedAt: "asc" },
  });

  for (const conv of conversations) {
    const state = (conv.state ?? {}) as ConversationState;
    if (!isActiveAwaitingReply(state)) continue;

    const age = activityAgeMs(state, now);
    if (age == null) continue;

    const action = decideIdleTimeoutAction(age, Boolean(state.idleReminderSentAt));
    if (action === "none") continue;

    const lang = resolveLang(state.preferredLanguage);
    const phoneNumberId = await resolvePhoneNumberId(conv.practiceId);

    if (action === "remind") {
      const ok = await sendReminder(conv.patientPhone, lang, state, phoneNumberId);
      if (!ok) {
        console.warn(
          `[wa-idle] reminder failed conv=${conv.id} to=${conv.patientPhone}`,
        );
        continue;
      }
      // Preserve updatedAt so the close clock does not reset
      await prisma.whatsAppConversation.update({
        where: { id: conv.id },
        data: {
          state: {
            ...state,
            idleReminderSentAt: new Date(now).toISOString(),
          },
        },
      });
      stats.reminded += 1;
      continue;
    }

    // close
    const ok = await sendChatClosed(conv.patientPhone, lang, phoneNumberId);
    if (!ok) {
      console.warn(
        `[wa-idle] close failed conv=${conv.id} to=${conv.patientPhone}`,
      );
      continue;
    }
    const closedState: ConversationState = {
      preferredLanguage: state.preferredLanguage,
      aiDisclosed: true,
      waOptOut: state.waOptOut,
      handedOff: false,
      postBookingCare: false,
      lastBookingId: state.lastBookingId,
      bookPatientId: state.bookPatientId,
      bookPatientName: state.bookPatientName,
      step: "idle",
      idleReminderSentAt: undefined,
      updatedAt: new Date(now).toISOString(),
    };
    await prisma.whatsAppConversation.update({
      where: { id: conv.id },
      data: { state: closedState },
    });
    stats.closed += 1;
  }

  return stats;
}
