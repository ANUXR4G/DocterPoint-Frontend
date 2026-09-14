import {
  BookingChannel,
  BookingStatus,
  ScheduleMode,
  type Practice,
  type ClinicLocation,
  type PracticeMember,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { settings } from "../../config/index.js";
import { BookingService } from "./booking.service.js";
import { PatientService } from "../patient.js";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  askPreferredLanguage,
  languageSetAck,
  parseLanguageChoice,
  resolveLang,
  wantsLanguageChange,
  type WaLang,
} from "./whatsapp.i18n.js";
import {
  exactMenuIntent,
  parsePatientDate,
  parseSlotsRegex,
  parseUtterance,
  stepUsesLlm,
  type BotIntent,
  type NluSlots,
} from "./whatsapp.nlu.js";
import { formatLocalDate } from "./slotEngine.js";
import { normalizeGender } from "../../core/gender.js";
import {
  aiDisclosure,
  escalateReply,
  faqReply,
  guardOutbound,
  isOptIn,
  isOptOut,
  looksClinical,
  optInAck,
  optOutAck,
  wantsHuman,
} from "./whatsapp.policy.js";
import type { IdScanFields } from "../idScan.js";

const IDLE_MS = 30 * 60_000;

export type ConversationStep =
  | "idle"
  | "awaiting_language"
  | "awaiting_date"
  | "awaiting_provider"
  | "awaiting_mode"
  | "awaiting_slot"
  | "awaiting_confirm"
  | "awaiting_cancel_confirm"
  | "awaiting_reschedule_booking"
  | "awaiting_reschedule_slot"
  | "awaiting_register_name"
  | "awaiting_register_gender"
  | "awaiting_register_email"
  | "awaiting_register_confirm";

export type ConversationState = {
  step?: ConversationStep;
  updatedAt?: string;
  date?: string;
  locationId?: string;
  providerId?: string;
  mode?: ScheduleMode;
  slotStart?: string;
  sessionDate?: string;
  tokenPreview?: number;
  cancelBookingId?: string;
  rescheduleBookingId?: string;
  pendingSummary?: string;
  slotChoices?: Array<{ start: string; label: string }>;
  providerChoices?: Array<{ id: string; name: string; detail?: string }>;
  bookingChoices?: Array<{ id: string; label: string }>;
  regName?: string;
  regGender?: string;
  regEmail?: string;
  regDob?: string | null;
  regAddress?: string | null;
  /** After register succeeds, auto-start booking */
  afterRegister?: "book";
  pendingBookSlots?: NluSlots;
  /** First-message AI disclosure already sent */
  aiDisclosed?: boolean;
  /** Patient replied STOP — skip proactive appointment alerts */
  waOptOut?: boolean;
  failedTurns?: number;
  handedOff?: boolean;
  /** Preferred reply language (set on first contact) */
  preferredLanguage?: "en" | "hi";
};

type PracticeCtx = Practice & {
  locations: ClinicLocation[];
  members: Array<PracticeMember & { user?: { id: string; name: string | null } | null }>;
};

function normalizePhone(from: string): string {
  return from.replace(/\D/g, "").slice(-10);
}

function isTimedOut(state: ConversationState): boolean {
  if (!state.updatedAt) return false;
  const t = Date.parse(state.updatedAt);
  if (Number.isNaN(t)) return false;
  return Date.now() - t > IDLE_MS;
}

function touch(state: ConversationState): ConversationState {
  return { ...state, updatedAt: new Date().toISOString() };
}

async function saveState(convId: string, state: ConversationState) {
  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { state: touch(state) },
  });
}

/** Preserve language / opt-out / disclosure when resetting booking flow. */
function keepPrefs(state: ConversationState): Pick<
  ConversationState,
  "preferredLanguage" | "aiDisclosed" | "waOptOut" | "handedOff"
> {
  return {
    preferredLanguage: state.preferredLanguage,
    aiDisclosed: state.aiDisclosed,
    waOptOut: state.waOptOut,
    handedOff: state.handedOff,
  };
}

function idleState(state: ConversationState): ConversationState {
  return { ...keepPrefs(state), step: "idle", aiDisclosed: true };
}

function bookingWhenLabel(b: {
  mode: ScheduleMode;
  tokenNumber?: number | null;
  sessionDate?: Date | null;
  slotStart?: Date | null;
}): string {
  if (b.mode === ScheduleMode.TOKEN_BASED) {
    return `Token #${b.tokenNumber ?? "?"} on ${b.sessionDate?.toISOString().slice(0, 10) ?? "?"}`;
  }
  return b.slotStart?.toLocaleString() ?? "scheduled time";
}

async function replyStatus(
  practice: PracticeCtx,
  patientPhone: string,
  lang: WaLang,
): Promise<{ reply: string }> {
  const bookings = await BookingService.listForPatient({ phone: patientPhone });
  const mine = bookings.filter((b) => b.practiceId === practice.id);
  if (!mine.length) {
    const patient = await PatientService.findByPhone(patientPhone);
    if (!patient) {
      return {
        reply:
          lang === "hi"
            ? "अभी कोई अपॉइंटमेंट नहीं — और आप रजिस्टर्ड नहीं हैं।\nएक साथ रजिस्टर और शेड्यूल के लिए *BOOK* लिखें।"
            : "No appointments yet — and you're not registered.\nReply *BOOK* to register and schedule in one flow.",
      };
    }
    return {
      reply:
        lang === "hi"
          ? "इस क्लिनिक पर आपकी कोई अपॉइंटमेंट नहीं है। शेड्यूल के लिए *BOOK* लिखें।"
          : "You have no appointments at this clinic. Reply *BOOK* to schedule.",
    };
  }
  const lines = mine.slice(0, 5).map((b) => {
    const docs = Array.isArray(b.documents) ? b.documents.length : 0;
    const docBit =
      docs > 0
        ? lang === "hi"
          ? ` · ${docs} फ़ाइल`
          : ` · ${docs} file(s)`
        : "";
    return `• ${b.status}: ${bookingWhenLabel(b)}${docBit}`;
  });
  return {
    reply:
      lang === "hi"
        ? `*${practice.name}* पर आपकी अपॉइंटमेंट:\n${lines.join("\n")}\n\nरिपोर्ट जोड़ने के लिए फ़ोटो/PDF भेजें, या *REPORT* लिखें।`
        : `Your appointments at ${practice.name}:\n${lines.join("\n")}\n\nSend a photo/PDF to attach a report, or reply *REPORT*.`,
  };
}

async function dispatchMenuIntent(opts: {
  intent: BotIntent;
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<{ reply: string } | null> {
  const { intent, convId, practice, patientPhone, state, lang } = opts;
  switch (intent) {
    case "status":
      return replyStatus(practice, patientPhone, lang);
    case "book":
      return ensureRegisteredThenBook(convId, practice, patientPhone, {}, state);
    case "register":
      return startRegisterFlow(convId, patientPhone, state);
    case "doctors": {
      const providers = await loadProviders(practice.id);
      return {
        reply: BotPrompts.doctorsList(
          practice.name,
          providers.map((p, i) => ({
            index: i + 1,
            name: p.name,
            detail: p.detail,
          })),
          practiceClinicUrl(practice.slug),
          lang,
        ),
      };
    }
    case "help": {
      const patient = await PatientService.findByPhone(patientPhone);
      return { reply: BotPrompts.help(practice.name, patient?.name, lang) };
    }
    case "report":
      return { reply: BotPrompts.visitDocHowTo(lang) };
    case "my_docs": {
      const { listWhatsAppVisitDocuments } = await import("./whatsapp.visitDocs.js");
      return {
        reply: await listWhatsAppVisitDocuments({
          practiceId: practice.id,
          patientPhone,
          lang,
        }),
      };
    }
    case "faq": {
      const loc = practice.locations?.[0];
      const faqExtras = {
        consultationFee: practice.consultationFee,
        address: loc
          ? [loc.address, loc.city].filter(Boolean).join(", ")
          : null,
        phone: practice.phone,
        specialty: practice.specialty,
        email: practice.email,
      };
      const faq =
        faqReply(practice.faqKb, practice.name, "FAQ", lang, faqExtras) ||
        faqReply(practice.faqKb, practice.name, "fee", lang, faqExtras);
      if (faq) return { reply: faq };
      return null;
    }
    case "cancel":
    case "reschedule":
      // Handled below with booking lookups (same as NLU path)
      return null;
    default:
      return null;
  }
}

/** Providers linked to this clinic only (PracticeMember rows for practiceId). */
async function loadProviders(practiceId: string) {
  const members = await prisma.practiceMember.findMany({
    where: {
      practiceId,
      isActive: true,
      role: { in: ["DOCTOR", "PRACTICE_OWNER"] },
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          doctor: { select: { description: true, experience: true } },
        },
      },
    },
    orderBy: { role: "asc" },
  });
  const doctors = members.filter((m) => m.role === "DOCTOR");
  const doctorMembers = doctors.length ? doctors : members;
  const withProfile = doctorMembers.filter((m) => m.user?.doctor);
  const list = withProfile.length ? withProfile : doctorMembers;
  return list.map((m) => {
    const name = m.user?.name?.trim() || "Doctor";
    const desc = m.user?.doctor?.description?.trim();
    const years = m.user?.doctor?.experience;
    const detailParts: string[] = [];
    if (desc) detailParts.push(desc.length > 80 ? `${desc.slice(0, 77)}…` : desc);
    if (years != null && years > 0) detailParts.push(`${years} yrs experience`);
    return {
      id: m.userId,
      name,
      detail: detailParts.length ? detailParts.join(" · ") : undefined,
    };
  });
}

function practiceClinicUrl(slug: string): string | null {
  const origin = settings.frontendOrigins
    .split(",")[0]
    ?.trim()
    .replace(/\/$/, "");
  if (!origin) return null;
  return `${origin}/practices/${slug}`;
}

function pickProvider(
  choices: Array<{ id: string; name: string }>,
  slots: NluSlots,
  text: string,
): { id: string; name: string } | null {
  if (slots.providerIndex != null) {
    const hit = choices[slots.providerIndex - 1];
    if (hit) return hit;
  }
  if (slots.providerName) {
    const q = slots.providerName.toLowerCase();
    const hit = choices.find((c) => c.name.toLowerCase().includes(q));
    if (hit) return hit;
  }
  const q = text.trim().toLowerCase();
  const byName = choices.find((c) => c.name.toLowerCase().includes(q));
  if (byName) return byName;
  const n = Number(q);
  if (Number.isFinite(n) && n >= 1 && n <= choices.length) return choices[n - 1]!;
  return null;
}

/** Prefer next weekday with openings; falls back to tomorrow. */
async function suggestDefaultDate(
  practice: PracticeCtx,
  providerId: string,
  locationId: string,
): Promise<string> {
  const start = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0) continue; // skip Sunday by default
    const dateStr = formatLocalDate(d);
    try {
      const avail = await BookingService.getAvailability(
        practice.id,
        providerId,
        locationId,
        dateStr,
      );
      const open =
        avail.timeSlots.some((s) => s?.available) ||
        avail.tokenSessions.some((s) => s?.available);
      if (open) return dateStr;
    } catch {
      /* try next day */
    }
  }
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return formatLocalDate(t);
}

/** Keep booking date step alive and suggest another day. */
async function reaskDateNoSlots(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  const next: ConversationState = {
    ...state,
    step: "awaiting_date",
    date: undefined,
    mode: undefined,
    slotStart: undefined,
    slotChoices: undefined,
    sessionDate: undefined,
    tokenPreview: undefined,
    pendingSummary: undefined,
  };
  let suggested: string | undefined;
  if (next.providerId && next.locationId) {
    suggested = await suggestDefaultDate(
      practice,
      next.providerId,
      next.locationId,
    );
  }
  await saveState(convId, next);
  return { reply: BotPrompts.noSlots(lang, suggested) };
}

async function handleAwaitingDate(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
  text: string,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  const trimmed = text.trim();

  // Escape hatches so users aren't trapped if they change their mind
  if (/^(help|menu|\?)$/i.test(trimmed)) {
    const patient = await PatientService.findByPhone(patientPhone);
    return { reply: BotPrompts.help(practice.name, patient?.name, lang) };
  }
  if (/^(cancel|stop|nevermind|never mind|abort)$/i.test(trimmed)) {
    await saveState(convId, idleState(state));
    return { reply: BotPrompts.bookingFlowCanceled(lang) };
  }

  const parsed = parsePatientDate(text);
  if (!parsed.ok) {
    await saveState(convId, { ...state, step: "awaiting_date", failedTurns: 0 });
    if (parsed.reason === "past") return { reply: BotPrompts.datePast(lang) };
    if (parsed.reason === "far") return { reply: BotPrompts.dateTooFar(lang) };
    return { reply: BotPrompts.dateInvalid(lang) };
  }

  const date = parsed.date;

  if (state.rescheduleBookingId) {
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: state.rescheduleBookingId },
    });
    if (!booking) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.bookingNotFound(lang) };
    }

    if (booking.mode === ScheduleMode.TOKEN_BASED) {
      try {
        const updated = await BookingService.reschedule(booking.id, {
          sessionDate: date,
          phone: patientPhone,
          skipPatientNotification: true,
        });
        await saveState(convId, idleState(state));
        return { reply: BotPrompts.rescheduled(bookingWhenLabel(updated), lang) };
      } catch (err) {
        await saveState(convId, {
          ...state,
          step: "awaiting_date",
          failedTurns: 0,
        });
        return {
          reply:
            (err instanceof Error ? err.message : "Could not reschedule.") +
            "\n" +
            BotPrompts.askDate(lang),
        };
      }
    }

    const availability = await BookingService.getAvailability(
      practice.id,
      booking.providerId,
      booking.locationId,
      date,
    );
    const open = availability.timeSlots.filter((s) => s.available).slice(0, 12);
    if (!open.length) {
      return reaskDateNoSlots(convId, practice, {
        ...state,
        providerId: booking.providerId,
        locationId: booking.locationId,
      });
    }

    if (open.length === 1) {
      try {
        const updated = await BookingService.reschedule(booking.id, {
          slotStart: open[0]!.start.toISOString(),
          phone: patientPhone,
          skipPatientNotification: true,
        });
        await saveState(convId, idleState(state));
        return { reply: BotPrompts.rescheduled(bookingWhenLabel(updated), lang) };
      } catch (err) {
        await saveState(convId, {
          ...state,
          step: "awaiting_date",
          failedTurns: 0,
        });
        return {
          reply:
            (err instanceof Error ? err.message : "Could not reschedule.") +
            "\n" +
            BotPrompts.askDate(lang),
        };
      }
    }

    const slotChoices = open.map((s) => ({
      start: s.start.toISOString(),
      label: s.start.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
    await saveState(convId, {
      ...state,
      date,
      step: "awaiting_reschedule_slot",
      slotChoices,
      providerId: booking.providerId,
      locationId: booking.locationId,
      mode: booking.mode,
      failedTurns: 0,
    });
    return {
      reply: BotPrompts.askSlot(
        slotChoices.map((s, i) => ({ index: i + 1, label: s.label })),
        lang,
      ),
    };
  }

  state.date = date;
  state.failedTurns = 0;
  return advanceAfterDate(convId, practice, state);
}

async function advanceAfterDate(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  const providers = state.providerChoices?.length
    ? state.providerChoices
    : await loadProviders(practice.id);
  state.providerChoices = providers;

  // Auto-select sole doctor
  if (providers.length === 1) {
    state.providerId = providers[0]!.id;
    return askModeForDay(convId, practice, state);
  }

  state.step = "awaiting_provider";
  await saveState(convId, state);
  return {
    reply: BotPrompts.askProvider(
      providers.map((p, i) => ({
        index: i + 1,
        name: p.name,
        detail: p.detail,
      })),
      lang,
    ),
  };
}

async function startBookFlow(
  convId: string,
  practice: PracticeCtx,
  slots: NluSlots,
  prev: ConversationState = {},
): Promise<{ reply: string }> {
  const lang = resolveLang(prev.preferredLanguage);
  const location = practice.locations[0];
  if (!location) return { reply: BotPrompts.notConfigured(lang) };

  const providers = await loadProviders(practice.id);
  if (!providers.length) return { reply: BotPrompts.notConfigured(lang) };

  let state: ConversationState = {
    ...keepPrefs(prev),
    step: "awaiting_date",
    locationId: location.id,
    providerChoices: providers,
  };

  // Auto-pick sole doctor early
  if (providers.length === 1) {
    state.providerId = providers[0]!.id;
  } else if (slots.providerIndex || slots.providerName) {
    const picked = pickProvider(providers, slots, slots.providerName ?? "");
    if (picked) state.providerId = picked.id;
  }

  if (slots.date) {
    state.date = slots.date;
  }

  // If we have date + provider, jump to mode/slots
  if (state.date && state.providerId) {
    if (slots.mode) {
      state.mode = slots.mode;
      return continueAfterMode(convId, practice, state);
    }
    return askModeForDay(convId, practice, state);
  }

  if (state.date && !state.providerId) {
    return advanceAfterDate(convId, practice, state);
  }

  // No date yet — if sole provider, suggest soonest open day in the ask
  if (state.providerId && providers.length === 1) {
    const suggested = await suggestDefaultDate(
      practice,
      state.providerId,
      location.id,
    );
    await saveState(convId, state);
    return {
      reply:
        (lang === "hi"
          ? `*${providers[0]!.name}* के साथ बुकिंग।\n`
          : `Booking with *${providers[0]!.name}*.\n`) +
        `${BotPrompts.askDate(lang)}\n` +
        (lang === "hi"
          ? `(अगला खाली दिन: *${suggested}* — वह तारीख, TODAY, या TOMORROW लिखें।)`
          : `(Next open day: *${suggested}* — reply that date, TODAY, or TOMORROW.)`),
    };
  }

  await saveState(convId, state);
  return { reply: BotPrompts.askDate(lang) };
}

async function askModeForDay(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  const locationId = state.locationId!;
  const providerId = state.providerId!;
  const date = state.date!;
  const availability = await BookingService.getAvailability(
    practice.id,
    providerId,
    locationId,
    date,
  );
  const hasToken = availability.tokenSessions.some((s) => s?.available);
  const hasTime = availability.timeSlots.some((s) => s?.available);

  if (!hasToken && !hasTime) {
    return reaskDateNoSlots(convId, practice, state);
  }

  // Auto-select the only available mode
  if (hasToken && !hasTime) {
    return continueAfterMode(convId, practice, {
      ...state,
      mode: ScheduleMode.TOKEN_BASED,
    });
  }
  if (hasTime && !hasToken) {
    return continueAfterMode(convId, practice, {
      ...state,
      mode: ScheduleMode.TIME_BASED,
    });
  }

  state.step = "awaiting_mode";
  await saveState(convId, state);
  return { reply: BotPrompts.askMode(hasToken, hasTime, lang) };
}

async function continueAfterMode(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  const locationId = state.locationId!;
  const providerId = state.providerId!;
  const date = state.date!;
  const mode = state.mode!;

  const availability = await BookingService.getAvailability(
    practice.id,
    providerId,
    locationId,
    date,
  );

  if (mode === ScheduleMode.TOKEN_BASED) {
    const session = availability.tokenSessions.find((s) => s?.available);
    if (!session) {
      return reaskDateNoSlots(convId, practice, state);
    }
    const pendingSummary = `Token #${session.nextToken} on ${date} (${session.sessionStart}–${session.sessionEnd}) at ${practice.name}`;
    await saveState(convId, {
      ...state,
      step: "awaiting_confirm",
      sessionDate: date,
      tokenPreview: session.nextToken,
      pendingSummary,
      mode: ScheduleMode.TOKEN_BASED,
    });
    return {
      reply: BotPrompts.askTokenConfirm(
        session.nextToken,
        session.sessionStart,
        session.sessionEnd,
        date,
        lang,
      ),
    };
  }

  const open = availability.timeSlots.filter((s) => s.available).slice(0, 12);
  if (!open.length) {
    return reaskDateNoSlots(convId, practice, state);
  }

  // Auto-confirm if only one slot remains
  if (open.length === 1) {
    const only = open[0]!;
    const label = only.start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    await saveState(convId, {
      ...state,
      step: "awaiting_confirm",
      mode: ScheduleMode.TIME_BASED,
      slotStart: only.start.toISOString(),
      pendingSummary: `${label} on ${date} at ${practice.name}`,
      slotChoices: [
        { start: only.start.toISOString(), label },
      ],
    });
    return {
      reply: BotPrompts.askConfirm(`${label} on ${date} at ${practice.name}`, lang),
    };
  }

  const slotChoices = open.map((s) => ({
    start: s.start.toISOString(),
    label: s.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  }));

  await saveState(convId, {
    ...state,
    step: "awaiting_slot",
    mode: ScheduleMode.TIME_BASED,
    slotChoices,
  });

  return {
    reply: BotPrompts.askSlot(
      slotChoices.map((s, i) => ({ index: i + 1, label: s.label })), lang),
  };
}

async function confirmBooking(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  try {
    const existing = await PatientService.findByPhone(patientPhone);
    const booking = await BookingService.createBooking({
      practiceId: practice.id,
      locationId: state.locationId!,
      providerId: state.providerId!,
      patientPhone,
      patientId: existing?.id,
      patientName: existing?.name || state.regName || undefined,
      mode: state.mode!,
      slotStart: state.slotStart,
      sessionDate: state.sessionDate ?? state.date,
      channel: BookingChannel.WHATSAPP_AI,
      disease: "General consultation",
      skipPatientNotification: true,
    });
    await saveState(convId, idleState(state));
    const detail = bookingWhenLabel(booking);
    return { reply: BotPrompts.bookingConfirmed(practice.name, detail, lang) };
  } catch (err) {
    await saveState(convId, idleState(state));
    const msg = err instanceof Error ? err.message : "Could not create booking.";
    return { reply: BotPrompts.tryBookAgain(msg, lang) };
  }
}

function parseGender(text: string, slots: NluSlots): string | null {
  if (slots.gender) {
    const fromSlot = normalizeGender(slots.gender);
    if (fromSlot) return fromSlot;
  }
  return normalizeGender(text);
}

function registerSummary(state: ConversationState, phone: string): string {
  const lines = [
    `• Name: ${state.regName}`,
    `• Gender: ${state.regGender}`,
    `• Phone: ${phone}`,
  ];
  if (state.regEmail) lines.push(`• Email: ${state.regEmail}`);
  if (state.regDob) lines.push(`• DOB: ${state.regDob}`);
  if (state.regAddress) lines.push(`• Address: ${state.regAddress}`);
  return lines.join("\n");
}

function parseRegisterEmail(text: string): string | null {
  const raw = text.trim().toLowerCase();
  if (!raw || /^(skip|no|none|n\/a|na)$/i.test(raw)) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  if (raw.endsWith("@patients.glucoguide.local")) return null;
  return raw;
}

async function applyIdScanToRegister(
  convId: string,
  patientPhone: string,
  state: ConversationState,
  scan: IdScanFields,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing) {
    await saveState(convId, { ...state, step: "idle" });
    return {
      reply:
        BotPrompts.idOcrAlreadyRegistered(existing.name || "", lang) +
        (scan.name
          ? `\n\n(Read from ID: *${scan.name}* — profile not changed.)`
          : ""),
    };
  }

  const name = (scan.name || state.regName || "").trim();
  if (!name || name.length < 2) {
    state.step = "awaiting_register_name";
    await saveState(convId, state);
    return { reply: BotPrompts.idOcrNeedName(lang) };
  }

  state.regName = name;
  if (scan.dateOfBirth) state.regDob = scan.dateOfBirth;
  if (scan.address) state.regAddress = scan.address;

  const gender = scan.gender;
  if (gender) {
    state.regGender = gender;
    state.step = "awaiting_register_email";
    await saveState(convId, state);
    return {
      reply:
        BotPrompts.idOcrGotName(name, lang) +
        "\n\n" +
        BotPrompts.askRegisterEmail(lang),
    };
  }

  state.step = "awaiting_register_gender";
  await saveState(convId, state);
  return {
    reply:
      BotPrompts.idOcrGotName(name, lang) + "\n\n" + BotPrompts.askRegisterGender(lang),
  };
}

async function startRegisterFlow(
  convId: string,
  patientPhone: string,
  prev: ConversationState = {},
): Promise<{ reply: string }> {
  const lang = resolveLang(prev.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing) {
    await saveState(convId, idleState(prev));
    return { reply: BotPrompts.alreadyRegistered(existing.name || "", lang) };
  }
  await saveState(convId, {
    ...keepPrefs(prev),
    step: "awaiting_register_name",
  });
  return { reply: BotPrompts.askRegisterName(lang) };
}

async function ensureRegisteredThenBook(
  convId: string,
  practice: PracticeCtx,
  patientPhone: string,
  slots: NluSlots,
  prev: ConversationState = {},
): Promise<{ reply: string }> {
  const lang = resolveLang(prev.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing) {
    return startBookFlow(convId, practice, slots, prev);
  }
  await saveState(convId, {
    ...keepPrefs(prev),
    step: "awaiting_register_name",
    afterRegister: "book",
    pendingBookSlots: slots,
  });
  return { reply: BotPrompts.needRegisterThenBook(lang) };
}

async function confirmRegister(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
): Promise<{ reply: string }> {
  const lang = resolveLang(state.preferredLanguage);
  if (!state.regGender) {
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterGender(lang) };
  }
  try {
    const result = await PatientService.registerViaWhatsApp({
      phone: patientPhone,
      name: state.regName!,
      gender: state.regGender,
      dateOfBirth: state.regDob ?? null,
      email: state.regEmail!,
      address: state.regAddress ?? null,
    });
    const continueToBook = state.afterRegister === "book";
    const pendingSlots = state.pendingBookSlots ?? {};

    if (continueToBook) {
      await saveState(convId, idleState(state));
      const bookReply = await startBookFlow(
        convId,
        practice,
        pendingSlots,
        state,
      );
      return {
        reply:
          BotPrompts.registered(
            {
              name: result.name || state.regName!,
              continueToBook: true,
            },
            resolveLang(state.preferredLanguage),
          ) +
          "\n\n" +
          bookReply.reply,
      };
    }

    await saveState(convId, idleState(state));
    return {
      reply: BotPrompts.registered(
        {
          name: result.name || state.regName!,
        },
        resolveLang(state.preferredLanguage),
      ),
    };
  } catch (err) {
    await saveState(convId, idleState(state));
    const msg = err instanceof Error ? err.message : "Could not register.";
    return {
      reply: BotPrompts.tryRegisterAgain(
        msg,
        resolveLang(state.preferredLanguage),
      ),
    };
  }
}

export async function runOrchestrator(input: {
  practice: PracticeCtx;
  patientPhone: string;
  convId: string;
  state: ConversationState;
  text: string;
  idScan?: IdScanFields;
}): Promise<{ reply: string }> {
  const result = await runOrchestratorCore(input);
  const latest = await prisma.whatsAppConversation.findUnique({
    where: { id: input.convId },
  });
  const st = (latest?.state as ConversationState) ?? input.state ?? {};
  return {
    reply: guardOutbound(result.reply, resolveLang(st.preferredLanguage)),
  };
}

async function runOrchestratorCore(input: {
  practice: PracticeCtx;
  patientPhone: string;
  convId: string;
  state: ConversationState;
  text: string;
  idScan?: IdScanFields;
}): Promise<{ reply: string }> {
  const { practice, patientPhone, convId, text, idScan } = input;
  let state = { ...(input.state ?? {}) };

  // Meta opt-out / opt-in (STOP / START) — honour before other intents
  if (isOptOut(text)) {
    state = { ...state, waOptOut: true };
    await saveState(convId, state);
    return { reply: optOutAck(resolveLang(state.preferredLanguage)) };
  }
  if (isOptIn(text)) {
    state = { ...state, waOptOut: false };
    await saveState(convId, state);
    return { reply: optInAck(resolveLang(state.preferredLanguage)) };
  }

  // Preferred language — ask once before any booking/register flow.
  if (!state.preferredLanguage || state.step === "awaiting_language") {
    const chosen = parseLanguageChoice(text);
    if (!chosen) {
      state = { ...state, step: "awaiting_language" };
      await saveState(convId, state);
      return { reply: askPreferredLanguage() };
    }
    state = {
      ...state,
      preferredLanguage: chosen,
      step: "idle",
      aiDisclosed: true,
    };
    await saveState(convId, state);
    const patientAfterLang = await PatientService.findByPhone(patientPhone);
    return {
      reply:
        aiDisclosure(practice.name, chosen) +
        languageSetAck(chosen) +
        "\n\n" +
        BotPrompts.welcome(practice.name, patientAfterLang?.name, chosen),
    };
  }

  if (wantsLanguageChange(text)) {
    state = { ...state, step: "awaiting_language" };
    await saveState(convId, state);
    return { reply: askPreferredLanguage() };
  }

  const lang: WaLang = resolveLang(state.preferredLanguage);

  if (state.handedOff) {
    const t = text.trim();
    const resumeMenuOnly = /^(bot|resume|menu)$/i.test(t);
    // Match care-chat escape: booking commands must reclaim the bot (copy promised BOOK works).
    const resumeAndRun =
      /^(book|cancel|reschedule|status|help|hi|hello|hey|start|register|doctors?|faq|info|report|reports|my\s*docs?)\b/i.test(
        t,
      ) ||
      (/\b(book|cancel|reschedule)\b/i.test(t) && t.length < 80);

    if (!resumeMenuOnly && !resumeAndRun) {
      return { reply: BotPrompts.handedOffWait(lang) };
    }

    state = { ...state, handedOff: false, step: "idle", failedTurns: 0 };
    await saveState(convId, state);
    await prisma.whatsAppConversation.update({
      where: { id: convId },
      data: { status: "bot_active" },
    });

    if (resumeMenuOnly) {
      const patient = await PatientService.findByPhone(patientPhone);
      return { reply: BotPrompts.help(practice.name, patient?.name, lang) };
    }
    // Fall through — process BOOK / STATUS / etc. normally
  }

  // ID photo OCR → autofill registration (same vision stack as web /auth/id-scan)
  if (idScan) {
    if (state.step && state.step !== "idle" && isTimedOut(state)) {
      state = {
        ...keepPrefs(state),
        step: "idle",
        aiDisclosed: true,
        afterRegister: state.afterRegister,
        pendingBookSlots: state.pendingBookSlots,
      };
    }
    const inRegister =
      !state.step ||
      state.step === "idle" ||
      state.step === "awaiting_register_name" ||
      state.step === "awaiting_register_gender" ||
      state.step === "awaiting_register_email" ||
      state.step === "awaiting_register_confirm";
    if (!inRegister) {
      return { reply: BotPrompts.idPhotoWrongStep(lang) };
    }
    return applyIdScanToRegister(convId, patientPhone, state, idScan);
  }

  if (state.step && state.step !== "idle" && isTimedOut(state)) {
    state = idleState(state);
    await saveState(convId, state);
    return { reply: BotPrompts.idleReset(lang) };
  }

  // Global menu commands (typed or WhatsApp button) — always win over mid-flow steps
  const menuIntent = exactMenuIntent(text);
  if (menuIntent) {
    state = { ...idleState(state), failedTurns: 0 };
    await saveState(convId, state);
    const dispatched = await dispatchMenuIntent({
      intent: menuIntent,
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
    if (dispatched) return dispatched;
  }

  // Fast path: registration gender/name/email/confirm — no NLU/LLM
  if (state.step === "awaiting_register_gender") {
    const gender = parseGender(text, parseSlotsRegex(text));
    if (!gender) return { reply: BotPrompts.askRegisterGender(lang) };
    state.regGender = gender;
    state.step = "awaiting_register_email";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterEmail(lang) };
  }

  if (state.step === "awaiting_register_email") {
    const email = parseRegisterEmail(text);
    if (!email) return { reply: BotPrompts.askRegisterEmail(lang) };
    state.regEmail = email;
    state.step = "awaiting_register_confirm";
    state.pendingSummary = registerSummary(state, patientPhone);
    await saveState(convId, state);
    return {
      reply: BotPrompts.askRegisterConfirm(
        state.pendingSummary,
        state.afterRegister === "book",
        lang,
      ),
    };
  }

  if (state.step === "awaiting_register_name") {
    const name = text.trim();
    if (name.length < 2 || /^(yes|no|help|book|register|male|female|others?)$/i.test(name)) {
      return { reply: BotPrompts.askRegisterName(lang) };
    }
    state.regName = name;
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterGender(lang) };
  }

  if (state.step === "awaiting_register_confirm") {
    if (!state.regEmail) {
      state.step = "awaiting_register_email";
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterEmail(lang) };
    }
    if (/^(yes|y|confirm|ok|okay|sure)$/i.test(text.trim())) {
      return confirmRegister(convId, practice, state, patientPhone);
    }
    if (/^(no|n|nope|cancel)$/i.test(text.trim())) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.registrationCanceled(lang) };
    }
    return {
      reply: BotPrompts.askRegisterConfirm(
        state.pendingSummary || registerSummary(state, patientPhone),
        state.afterRegister === "book",
        lang,
      ),
    };
  }

  // Fast path: booking/reschedule date — stay in step; never fall through to HELP/escalate
  if (state.step === "awaiting_date") {
    return handleAwaitingDate(convId, practice, state, patientPhone, text);
  }

  const contextHint = `step=${state.step ?? "idle"}; practice=${practice.name}; today=${formatLocalDate(new Date())}`;
  const nlu = await parseUtterance(text, contextHint, {
    useLlm: stepUsesLlm(state.step),
  });

  const escalate = async () => {
    state = { ...state, handedOff: true, step: "idle", failedTurns: 0 };
    await saveState(convId, state);
    await prisma.whatsAppConversation.update({
      where: { id: convId },
      data: { status: "handed_off" },
    });
    return { reply: escalateReply(lang) };
  };

  if (looksClinical(text) || wantsHuman(text) || nlu.intent === "human") {
    return escalate();
  }

  if (nlu.intent === "faq" || (!state.step || state.step === "idle")) {
    const loc = practice.locations?.[0];
    const faqExtras = {
      consultationFee: practice.consultationFee,
      address: loc
        ? [loc.address, loc.city].filter(Boolean).join(", ")
        : null,
      phone: practice.phone,
      specialty: practice.specialty,
      email: practice.email,
    };
    let faq = faqReply(practice.faqKb, practice.name, text, lang, faqExtras);
    // Always give full clinic details (incl. mandatory fee) when intent is FAQ
    if (!faq && nlu.intent === "faq") {
      faq = faqReply(practice.faqKb, practice.name, "FAQ", lang, faqExtras);
    }
    if (faq && (nlu.intent === "faq" || nlu.intent === "unknown" || nlu.intent === "help")) {
      if (nlu.intent === "faq" || nlu.intent === "unknown") {
        await saveState(convId, { ...state, failedTurns: 0 });
        return { reply: faq };
      }
    }
  }

  // Personalized help / greeting
  if (nlu.intent === "help" && (!state.step || state.step === "idle")) {
    const patient = await PatientService.findByPhone(patientPhone);
    return { reply: BotPrompts.help(practice.name, patient?.name, lang) };
  }

  // Doctors list (available anytime — does not clear in-progress booking)
  if (nlu.intent === "doctors") {
    const providers = await loadProviders(practice.id);
    return {
      reply: BotPrompts.doctorsList(
        practice.name,
        providers.map((p, i) => ({
          index: i + 1,
          name: p.name,
          detail: p.detail,
        })),
        practiceClinicUrl(practice.slug), lang),
    };
  }

  // Confirm / deny
  if (state.step === "awaiting_confirm") {
    if (nlu.intent === "confirm_yes" || /^(yes|y|confirm|ok)$/i.test(text.trim())) {
      return confirmBooking(convId, practice, state, patientPhone);
    }
    if (nlu.intent === "confirm_no" || /^(no|n)$/i.test(text.trim())) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.bookingFlowCanceled(lang) };
    }
  }

  if (state.step === "awaiting_cancel_confirm") {
    if (nlu.intent === "confirm_yes" || /^(yes|y|confirm|ok)$/i.test(text.trim())) {
      if (!state.cancelBookingId) {
        await saveState(convId, idleState(state));
        return { reply: BotPrompts.noBookingSelected(lang) };
      }
      await BookingService.updateStatus(
        state.cancelBookingId,
        BookingStatus.CANCELED,
        undefined,
        { skipPatientNotification: true },
      );
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.canceled(lang) };
    }
    if (nlu.intent === "confirm_no" || /^(no|n)$/i.test(text.trim())) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.keptBooking(lang) };
    }
  }

  if (state.step === "awaiting_provider") {
    const providers = state.providerChoices ?? (await loadProviders(practice.id));
    const picked = pickProvider(providers, nlu.slots, text);
    if (!picked) {
      return {
        reply: BotPrompts.askProvider(
          providers.map((p, i) => ({
            index: i + 1,
            name: p.name,
            detail: p.detail,
          })), lang),
      };
    }
    state.providerId = picked.id;
    state.providerChoices = providers;
    return askModeForDay(convId, practice, state);
  }

  if (state.step === "awaiting_mode") {
    const t = text.toLowerCase();
    let mode: ScheduleMode | undefined = nlu.slots.mode;
    if (!mode && /token/.test(t)) mode = ScheduleMode.TOKEN_BASED;
    if (!mode && /time|slot/.test(t)) mode = ScheduleMode.TIME_BASED;
    if (!mode) {
      return { reply: BotPrompts.askMode(true, true, lang) };
    }
    state.mode = mode;
    return continueAfterMode(convId, practice, state);
  }

  if (state.step === "awaiting_slot") {
    const choices = state.slotChoices ?? [];
    const idx = nlu.slots.slotIndex ?? Number(text.trim());
    const choice =
      Number.isFinite(idx) && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice) {
      return {
        reply: BotPrompts.askSlot(
          choices.map((s, i) => ({ index: i + 1, label: s.label })), lang),
      };
    }
    state.slotStart = choice.start;
    state.pendingSummary = `${choice.label} on ${state.date} at ${practice.name}`;
    state.step = "awaiting_confirm";
    await saveState(convId, state);
    return { reply: BotPrompts.askConfirm(state.pendingSummary, lang) };
  }

  if (state.step === "awaiting_reschedule_booking") {
    const choices = state.bookingChoices ?? [];
    const idx = Number(text.trim());
    const choice =
      Number.isFinite(idx) && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice) {
      return {
        reply: BotPrompts.askReschedulePick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })), lang),
      };
    }
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: choice.id },
    });
    if (!booking) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.bookingNotFound(lang) };
    }
    state.rescheduleBookingId = booking.id;
    state.providerId = booking.providerId;
    state.locationId = booking.locationId;
    state.mode = booking.mode;
    state.step = "awaiting_date";
    await saveState(convId, state);
    return { reply: `Rescheduling ${bookingWhenLabel(booking)}.\n${BotPrompts.askDate(lang)}` };
  }

  if (state.step === "awaiting_reschedule_slot") {
    const choices = state.slotChoices ?? [];
    const idx = nlu.slots.slotIndex ?? Number(text.trim());
    const choice =
      Number.isFinite(idx) && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice || !state.rescheduleBookingId) {
      return {
        reply: BotPrompts.askSlot(
          choices.map((s, i) => ({ index: i + 1, label: s.label })), lang),
      };
    }
    try {
      const updated = await BookingService.reschedule(state.rescheduleBookingId, {
        slotStart: choice.start,
        phone: patientPhone,
        skipPatientNotification: true,
      });
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.rescheduled(bookingWhenLabel(updated), lang) };
    } catch (err) {
      await saveState(convId, idleState(state));
      return {
        reply: err instanceof Error ? err.message : "Could not reschedule.",
      };
    }
  }

  // Top-level intents
  if (nlu.intent === "register") {
    return startRegisterFlow(convId, patientPhone, state);
  }

  if (nlu.intent === "book") {
    return ensureRegisteredThenBook(convId, practice, patientPhone, nlu.slots, state);
  }

  if (nlu.intent === "status") {
    return replyStatus(practice, patientPhone, lang);
  }

  if (nlu.intent === "report") {
    return { reply: BotPrompts.visitDocHowTo(lang) };
  }

  if (nlu.intent === "my_docs") {
    const { listWhatsAppVisitDocuments } = await import("./whatsapp.visitDocs.js");
    return {
      reply: await listWhatsAppVisitDocuments({
        practiceId: practice.id,
        patientPhone,
        lang,
      }),
    };
  }

  if (nlu.intent === "cancel") {
    const bookings = await BookingService.listForPatient({ phone: patientPhone });
    // Completed / canceled / no-show visits are locked — never offered here.
    const upcoming = bookings.find(
      (b) =>
        b.practiceId === practice.id &&
        [
          BookingStatus.SCHEDULED,
          BookingStatus.REQUESTED,
          BookingStatus.ACCEPTED,
        ].includes(
          b.status as "SCHEDULED" | "REQUESTED" | "ACCEPTED",
        ),
    );
    if (!upcoming) {
      return {
        reply:
          lang === "hi"
            ? "रद्द करने के लिए कोई सक्रिय बुकिंग नहीं मिली।"
            : "No active booking found to cancel.",
      };
    }
    await saveState(convId, {
      step: "awaiting_cancel_confirm",
      cancelBookingId: upcoming.id,
    });
    return { reply: BotPrompts.askCancelConfirm(bookingWhenLabel(upcoming), lang) };
  }

  if (nlu.intent === "reschedule") {
    const bookings = await BookingService.listForPatient({ phone: patientPhone });
    // Matches BookingService.reschedule — completed visits are excluded.
    const upcoming = bookings
      .filter(
        (b) =>
          b.practiceId === practice.id &&
          [
            BookingStatus.SCHEDULED,
            BookingStatus.REQUESTED,
            BookingStatus.ACCEPTED,
          ].includes(
            b.status as "SCHEDULED" | "REQUESTED" | "ACCEPTED",
          ),
      )
      .slice(0, 5);
    if (!upcoming.length) return { reply: "No active bookings to reschedule." };

    if (upcoming.length === 1) {
      const b = upcoming[0]!;
      await saveState(convId, {
        step: "awaiting_date",
        rescheduleBookingId: b.id,
        providerId: b.providerId,
        locationId: b.locationId,
        mode: b.mode,
      });
      return { reply: `Rescheduling ${bookingWhenLabel(b)}.\n${BotPrompts.askDate(lang)}` };
    }

    const bookingChoices = upcoming.map((b) => ({
      id: b.id,
      label: bookingWhenLabel(b),
    }));
    await saveState(convId, {
      step: "awaiting_reschedule_booking",
      bookingChoices,
    });
    return {
      reply: BotPrompts.askReschedulePick(
        bookingChoices.map((c, i) => ({ index: i + 1, label: c.label })), lang),
    };
  }

  if (nlu.intent === "help") {
    const patient = await PatientService.findByPhone(patientPhone);
    return { reply: BotPrompts.help(practice.name, patient?.name, lang) };
  }

  const fails = (state.failedTurns ?? 0) + 1;
  if (fails >= 2) {
    state = { ...state, handedOff: true, step: "idle", failedTurns: 0 };
    await saveState(convId, state);
    await prisma.whatsAppConversation.update({
      where: { id: convId },
      data: { status: "handed_off" },
    });
    return { reply: escalateReply(lang) };
  }
  await saveState(convId, { ...state, failedTurns: fails });
  return { reply: BotPrompts.fallback(lang) };
}

export { normalizePhone };
