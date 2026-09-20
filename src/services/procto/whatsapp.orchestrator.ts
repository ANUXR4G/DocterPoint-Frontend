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
  matchPreferredSlotIndex,
  menuNumberShortcut,
  parsePatientDate,
  parseSlotsRegex,
  parseSpokenTime,
  parseUtterance,
  shouldUseLlmForMessage,
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
  | "awaiting_register_email_opt"
  | "awaiting_register_email"
  | "awaiting_register_phone_opt"
  | "awaiting_register_phone"
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
  providerChoices?: Array<{
    id: string;
    name: string;
    detail?: string;
    specialty?: string;
  }>;
  bookingChoices?: Array<{ id: string; label: string }>;
  regName?: string;
  regGender?: string;
  regEmail?: string;
  /** Confirmed registered mobile (WhatsApp sender or typed). Never from ID OCR. */
  regPhone?: string;
  regDob?: string | null;
  regAddress?: string | null;
  /** Preferred visit time from free speech / voice (clock or day-part). */
  preferredTimeText?: string;
  preferredHour?: number;
  preferredMinute?: number;
  preferredPeriod?: "morning" | "afternoon" | "evening" | "night";
  /** After register succeeds, auto-start booking */
  afterRegister?: "book";
  pendingBookSlots?: NluSlots;
  /** Last successfully persisted practice_bookings.id (audit / support). */
  lastBookingId?: string;
  /** First-message AI disclosure already sent */
  aiDisclosed?: boolean;
  /** Patient replied STOP — skip proactive appointment alerts */
  waOptOut?: boolean;
  failedTurns?: number;
  handedOff?: boolean;
  /** Preferred reply language (set on first contact) */
  preferredLanguage?: "en" | "hi";
};

export type DoctorListRow = {
  id: string;
  name: string;
  specialty?: string;
  detail?: string;
};

export type OrchestratorResult = {
  reply: string;
  /** When set (2+ doctors), WhatsApp sends a tappable list for demos. */
  doctorList?: DoctorListRow[];
  /** Reply buttons (max 3) — e.g. Yes/No, or ≤3 time slots. */
  replyButtons?: Array<{ id: string; title: string }>;
  /** Next working days as a tappable list (date:YYYY-MM-DD). */
  dateList?: Array<{ iso: string; label: string }>;
  /** Time slots as a tappable list (when more than 3 open times). */
  slotList?: Array<{ index: number; label: string }>;
  /** Reschedule booking pick as a tappable list (when more than 3). */
  bookingList?: Array<{ index: number; label: string }>;
  /** Welcome / HELP menu as a tappable list (menu:book, …). */
  menuList?: Array<{ id: string; title: string; description?: string }>;
};

function withDoctorList(
  reply: string,
  providers: Array<{
    id: string;
    name: string;
    detail?: string;
    specialty?: string;
  }>,
): OrchestratorResult {
  if (providers.length < 2) return { reply };
  return {
    reply,
    doctorList: providers.map((p) => ({
      id: p.id,
      name: p.name,
      specialty: p.specialty,
      detail: p.detail,
    })),
  };
}

/** Next N clinic working days (skips Sundays — same default as suggestDefaultDate). */
function nextWorkingDayIsos(count = 7, from: Date = new Date()): string[] {
  const out: string[] = [];
  const start = new Date(from);
  start.setHours(12, 0, 0, 0);
  for (let i = 0; i < 28 && out.length < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    if (d.getDay() === 0) continue;
    out.push(formatLocalDate(d));
  }
  return out;
}

function dateChipLabel(iso: string, todayIso: string, tomorrowIso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  const base = Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
  if (iso === todayIso) return `Today · ${base}`.slice(0, 24);
  if (iso === tomorrowIso) return `Tom · ${base}`.slice(0, 24);
  return base.slice(0, 24);
}

/** Next 7 working days as a WhatsApp *Dates* list (no numbered reply). */
function withDateButtons(
  reply: string,
  suggestedIso?: string | null,
): OrchestratorResult {
  const today = formatLocalDate(new Date());
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrow = formatLocalDate(tomorrowDate);

  const isos = nextWorkingDayIsos(7);
  const suggested = suggestedIso?.trim();
  if (suggested && !isos.includes(suggested)) {
    isos.unshift(suggested);
    if (isos.length > 7) isos.length = 7;
  }

  const dateList = isos.map((iso) => ({
    iso,
    label: dateChipLabel(iso, today, tomorrow),
  }));

  return {
    reply: reply.trim(),
    dateList,
  };
}

function withYesNo(reply: string): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "yes", title: "Yes" },
      { id: "no", title: "No" },
    ],
  };
}

/** English / हिंदी reply buttons on the language gate. */
function withLanguageButtons(reply: string): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "lang:en", title: "English" },
      { id: "lang:hi", title: "हिंदी" },
    ],
  };
}

/**
 * After clinic FAQ / details — Book + Doctors only (no full Menu list).
 * Avoids FAQ → main-menu loop; Menu is still available by typing Menu/HELP.
 */
function withFaqActions(reply: string, lang: WaLang): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "menu:book", title: lang === "hi" ? "बुक" : "Book" },
      { id: "menu:doctors", title: lang === "hi" ? "डॉक्टर" : "Doctors" },
    ],
  };
}

/** Welcome / HELP — interactive list (Meta allows ≤10 rows). */
function withMainMenu(reply: string): OrchestratorResult {
  return {
    reply,
    menuList: [
      {
        id: "menu:book",
        title: "1 · Book",
        description: "Doctor → date → slot",
      },
      {
        id: "menu:doctors",
        title: "2 · Doctors",
        description: "See doctor list",
      },
      {
        id: "menu:status",
        title: "3 · Status",
        description: "Upcoming visits",
      },
      {
        id: "menu:register",
        title: "4 · Register",
        description: "Create patient profile",
      },
      {
        id: "menu:faq",
        title: "5 · FAQ",
        description: "Clinic info & fees",
      },
      {
        id: "menu:cancel",
        title: "6 · Cancel",
        description: "Cancel a visit",
      },
      {
        id: "menu:reschedule",
        title: "7 · Reschedule",
        description: "Change date/time",
      },
      {
        id: "menu:language",
        title: "8 · Language",
        description: "English / हिंदी",
      },
      {
        id: "menu:report",
        title: "9 · Report",
        description: "Attach a document",
      },
    ],
  };
}

function withGenderButtons(reply: string): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "male", title: "Male" },
      { id: "female", title: "Female" },
      { id: "others", title: "Others" },
    ],
  };
}

function withModeButtons(
  reply: string,
  hasToken: boolean,
  hasTime: boolean,
): OrchestratorResult {
  const buttons: Array<{ id: string; title: string }> = [];
  if (hasTime) buttons.push({ id: "mode:TIME_BASED", title: "Time slot" });
  if (hasToken) buttons.push({ id: "mode:TOKEN_BASED", title: "Token" });
  return { reply, ...(buttons.length ? { replyButtons: buttons } : {}) };
}

/** ≤3 slots → reply buttons; more → interactive list. No “reply with number”. */
function withSlotPicker(
  reply: string,
  choices: Array<{ label: string }>,
): OrchestratorResult {
  if (!choices.length) return { reply };
  if (choices.length <= 3) {
    return {
      reply,
      replyButtons: choices.map((c, i) => ({
        id: `slot:${i + 1}`,
        title: c.label.slice(0, 20),
      })),
    };
  }
  return {
    reply,
    slotList: choices.map((c, i) => ({
      index: i + 1,
      label: c.label,
    })),
  };
}

/** Reschedule booking pick — buttons if ≤3, else list. */
function withBookingPicker(
  reply: string,
  choices: Array<{ label: string }>,
): OrchestratorResult {
  if (!choices.length) return { reply };
  if (choices.length <= 3) {
    return {
      reply,
      replyButtons: choices.map((c, i) => ({
        id: `booking:${i + 1}`,
        title: c.label.slice(0, 20),
      })),
    };
  }
  return {
    reply,
    bookingList: choices.map((c, i) => ({
      index: i + 1,
      label: c.label,
    })),
  };
}

/** Map date button ids to text parsePatientDate understands. */
function normalizeDateInput(text: string): string {
  const raw = text.trim();
  const m = /^date:(today|tomorrow|(\d{4}-\d{2}-\d{2}))$/i.exec(raw);
  if (!m) return raw;
  const kind = m[1]!.toLowerCase();
  if (kind === "today") return "TODAY";
  if (kind === "tomorrow") return "TOMORROW";
  return kind;
}

/** Map slot:N / booking:N tap (or plain number) to 1-based index. */
function parseSlotChoiceIndex(text: string, fallback?: number): number | null {
  const tap = /^(?:slot|booking):(\d+)$/i.exec(text.trim());
  if (tap) {
    const n = Number(tap[1]);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof fallback === "number" && Number.isFinite(fallback)) return fallback;
  const n = Number(text.trim());
  return Number.isFinite(n) ? n : null;
}

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

/** Copy spoken date/time preferences from NLU onto conversation state. */
function applyTimePreferenceFromSlots(
  state: ConversationState,
  slots: NluSlots,
  text?: string,
): ConversationState {
  const spoken = text ? parseSpokenTime(text) : {};
  const preferredHour =
    slots.preferredHour ?? spoken.preferredHour ?? state.preferredHour;
  const preferredMinute =
    slots.preferredMinute ?? spoken.preferredMinute ?? state.preferredMinute;
  const preferredPeriod =
    slots.preferredPeriod ?? spoken.preferredPeriod ?? state.preferredPeriod;
  const preferredTimeText =
    slots.timeText ?? spoken.timeText ?? state.preferredTimeText;
  return {
    ...state,
    ...(preferredHour != null ? { preferredHour, preferredMinute: preferredMinute ?? 0 } : {}),
    ...(preferredPeriod ? { preferredPeriod } : {}),
    ...(preferredTimeText ? { preferredTimeText } : {}),
  };
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
): Promise<OrchestratorResult> {
  const bookings = await BookingService.listForPatient({ phone: patientPhone });
  const mine = bookings.filter((b) => b.practiceId === practice.id);
  if (!mine.length) {
    const patient = await PatientService.findByPhone(patientPhone);
    if (!patient) {
      return withMainMenu(
        lang === "hi"
          ? "अभी कोई अपॉइंटमेंट नहीं — और आप रजिस्टर्ड नहीं हैं।\nविकल्पों के लिए नीचे *Menu* दबाएँ।"
          : "No appointments yet — and you're not registered.\nTap *Menu* below for options.",
      );
    }
    return withMainMenu(
      lang === "hi"
        ? "इस क्लिनिक पर आपकी कोई अपॉइंटमेंट नहीं है।\nविकल्पों के लिए नीचे *Menu* दबाएँ।"
        : "You have no appointments at this clinic.\nTap *Menu* below for options.",
    );
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
        ? `*${practice.name}* पर आपकी अपॉइंटमेंट:\n${lines.join("\n")}\n\nरिपोर्ट जोड़ने के लिए फ़ोटो/PDF भेजें।`
        : `Your appointments at ${practice.name}:\n${lines.join("\n")}\n\nSend a photo/PDF to attach a report.`,
  };
}

async function dispatchMenuIntent(opts: {
  intent: BotIntent;
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult | null> {
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
      return withDoctorList(
        BotPrompts.doctorsList(
          practice.name,
          providers.map((p, i) => ({
            index: i + 1,
            name: p.name,
            detail: p.detail,
          })),
          practiceClinicUrl(practice.slug),
          lang,
        ),
        providers,
      );
    }
    case "help": {
      const patient = await PatientService.findByPhone(patientPhone);
      return withMainMenu(BotPrompts.help(practice.name, patient?.name, lang));
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
      if (faq) return withFaqActions(faq, lang);
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
function specialtyFromDescription(description?: string | null): string | undefined {
  if (!description?.trim()) return undefined;
  const raw = description.trim();
  // Prefer text before an em/en dash: "Endocrinology — clinic staff doctor."
  const beforeDash = raw.split(/\s*[—–]\s*/)[0]?.trim();
  if (beforeDash && beforeDash.length > 0 && beforeDash.length <= 72) {
    return beforeDash;
  }
  return raw.length > 72 ? `${raw.slice(0, 69)}…` : raw;
}

/**
 * Bookable doctors for WhatsApp: active DOCTOR members (and practicing
 * PRACTICE_OWNER with a doctor profile + weekly schedule). Detail line is
 * specialization so patients can choose on clinic numbers.
 */
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
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const scheduleRows = await prisma.providerSchedule.findMany({
    where: { practiceId, isActive: true },
    select: { providerId: true },
    distinct: ["providerId"],
  });
  const scheduledIds = new Set(scheduleRows.map((r) => r.providerId));

  const doctors = members.filter((m) => m.role === "DOCTOR" && m.user?.doctor);
  const practicingOwners = members.filter(
    (m) =>
      m.role === "PRACTICE_OWNER" &&
      m.user?.doctor &&
      scheduledIds.has(m.userId),
  );
  // Prefer roster doctors; include practicing owners so clinic WA can list them.
  let list = [...doctors, ...practicingOwners];
  if (!list.length) {
    list = members.filter((m) => m.user?.doctor);
  }
  // Prefer providers who already have hours configured.
  const bookable = list.filter((m) => scheduledIds.has(m.userId));
  if (bookable.length) list = bookable;

  // Dedupe by userId (owner may also appear if roles overlap)
  const seen = new Set<string>();
  const unique = list.filter((m) => {
    if (seen.has(m.userId)) return false;
    seen.add(m.userId);
    return true;
  });

  return unique.map((m) => {
    const name = m.user?.name?.trim() || "Doctor";
    const specialty = specialtyFromDescription(m.user?.doctor?.description);
    const years = m.user?.doctor?.experience;
    const detailParts: string[] = [];
    if (specialty) detailParts.push(`Specialization: ${specialty}`);
    if (years != null && years > 0) detailParts.push(`${years} yrs experience`);
    return {
      id: m.userId,
      name,
      specialty,
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
  choices: Array<{ id: string; name: string; detail?: string; specialty?: string }>,
  slots: NluSlots,
  text: string,
): { id: string; name: string } | null {
  const raw = text.trim();
  // Interactive list tap: provider:1 or provider:<uuid>
  const listMatch = /^provider:(\d+)$/i.exec(raw);
  if (listMatch) {
    const hit = choices[Number(listMatch[1]) - 1];
    if (hit) return hit;
  }
  const uuidMatch = /^provider:([0-9a-f-]{36})$/i.exec(raw);
  if (uuidMatch) {
    const hit = choices.find((c) => c.id === uuidMatch[1]);
    if (hit) return hit;
  }

  if (slots.providerIndex != null) {
    const hit = choices[slots.providerIndex - 1];
    if (hit) return hit;
  }
  if (slots.providerName) {
    const q = slots.providerName.toLowerCase();
    const hit = choices.find(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.specialty ?? "").toLowerCase().includes(q) ||
        (c.detail ?? "").toLowerCase().includes(q),
    );
    if (hit) return hit;
  }
  const q = raw.toLowerCase();
  const byName = choices.find(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.specialty ?? "").toLowerCase().includes(q) ||
      (c.detail ?? "").toLowerCase().includes(q),
  );
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
): Promise<OrchestratorResult> {
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
  return withDateButtons(BotPrompts.noSlots(lang, suggested), suggested);
}

async function handleAwaitingDate(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
  text: string,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const trimmed = text.trim();

  // Escape hatches so users aren't trapped if they change their mind
  if (/^(help|menu|\?)$/i.test(trimmed)) {
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(BotPrompts.help(practice.name, patient?.name, lang));
  }
  if (/^(cancel|stop|nevermind|never mind|abort)$/i.test(trimmed)) {
    await saveState(convId, idleState(state));
    return { reply: BotPrompts.bookingFlowCanceled(lang) };
  }

  // Number from the 7-day picker (or typed 1–7)
  let dateInput = text;
  const pickNum = Number(trimmed);
  if (Number.isFinite(pickNum) && pickNum >= 1 && pickNum <= 7 && !/[\/\-.]/.test(trimmed)) {
    const isos = nextWorkingDayIsos(7);
    const picked = isos[pickNum - 1];
    if (picked) dateInput = picked;
  }

  const parsed = parsePatientDate(normalizeDateInput(dateInput));
  if (!parsed.ok) {
    await saveState(convId, { ...state, step: "awaiting_date", failedTurns: 0 });
    if (parsed.reason === "past") {
      return withDateButtons(BotPrompts.datePast(lang));
    }
    if (parsed.reason === "far") {
      return withDateButtons(BotPrompts.dateTooFar(lang));
    }
    return withDateButtons(BotPrompts.dateInvalid(lang));
  }

  const date = parsed.date;

  // Same utterance may include a time ("tomorrow at 10 am") — keep it for slot match
  state = applyTimePreferenceFromSlots(state, parseSlotsRegex(text), text);

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
        return withDateButtons(
          (err instanceof Error ? err.message : "Could not reschedule.") +
            "\n" +
            BotPrompts.askDate(lang),
        );
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

    const preferredIdx = matchPreferredSlotIndex(open, {
      preferredHour: state.preferredHour,
      preferredMinute: state.preferredMinute,
      preferredPeriod: state.preferredPeriod,
      timeText: state.preferredTimeText,
    });
    if (preferredIdx != null) {
      try {
        const picked = open[preferredIdx]!;
        const updated = await BookingService.reschedule(booking.id, {
          slotStart: picked.start.toISOString(),
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
        return withDateButtons(
          (err instanceof Error ? err.message : "Could not reschedule.") +
            "\n" +
            BotPrompts.askDate(lang),
        );
      }
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
        return withDateButtons(
          (err instanceof Error ? err.message : "Could not reschedule.") +
            "\n" +
            BotPrompts.askDate(lang),
        );
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
    return withSlotPicker(
      BotPrompts.askSlot(
        slotChoices.map((s, i) => ({ index: i + 1, label: s.label })),
        lang,
      ),
      slotChoices,
    );
  }

  state.date = date;
  state.failedTurns = 0;
  return advanceAfterDate(convId, practice, state);
}

async function advanceAfterDate(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<OrchestratorResult> {
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
  return withDoctorList(
    BotPrompts.askProvider(
      providers.map((p, i) => ({
        index: i + 1,
        name: p.name,
        detail: p.detail,
      })),
      lang,
    ),
    providers,
  );
}

async function startBookFlow(
  convId: string,
  practice: PracticeCtx,
  slots: NluSlots,
  prev: ConversationState = {},
): Promise<OrchestratorResult> {
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
  state = applyTimePreferenceFromSlots(state, slots);

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

  // Clinic with multiple doctors: show list + specialization first so the
  // patient selects a doctor before date/slots.
  if (!state.providerId && providers.length > 1) {
    state.step = "awaiting_provider";
    await saveState(convId, state);
    return withDoctorList(
      BotPrompts.askProvider(
        providers.map((p, i) => ({
          index: i + 1,
          name: p.name,
          detail: p.detail,
        })),
        lang,
      ),
      providers,
    );
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
    return withDateButtons(
      (lang === "hi"
        ? `*${providers[0]!.name}* के साथ बुकिंग।\n`
        : `Booking with *${providers[0]!.name}*.\n`) +
        `${BotPrompts.askDate(lang)}` +
        (lang === "hi"
          ? `\n(अगला खाली दिन: *${suggested}*)`
          : `\n(Next open day: *${suggested}*)`),
      suggested,
    );
  }

  await saveState(convId, state);
  return withDateButtons(BotPrompts.askDate(lang));
}

async function askModeForDay(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<OrchestratorResult> {
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
  return withModeButtons(
    BotPrompts.askMode(hasToken, hasTime, lang),
    hasToken,
    hasTime,
  );
}

async function continueAfterMode(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
): Promise<OrchestratorResult> {
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
    return withYesNo(
      BotPrompts.askTokenConfirm(
        session.nextToken,
        session.sessionStart,
        session.sessionEnd,
        date,
        lang,
      ),
    );
  }

  const open = availability.timeSlots.filter((s) => s.available).slice(0, 12);
  if (!open.length) {
    return reaskDateNoSlots(convId, practice, state);
  }

  // Voice / free-form: patient already said a time ("tomorrow at 10am") → pick closest slot
  const preferredIdx = matchPreferredSlotIndex(open, {
    preferredHour: state.preferredHour,
    preferredMinute: state.preferredMinute,
    preferredPeriod: state.preferredPeriod,
    timeText: state.preferredTimeText,
  });
  if (preferredIdx != null) {
    const picked = open[preferredIdx]!;
    const label = picked.start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    await saveState(convId, {
      ...state,
      step: "awaiting_confirm",
      mode: ScheduleMode.TIME_BASED,
      slotStart: picked.start.toISOString(),
      pendingSummary: `${label} on ${date} at ${practice.name}`,
      slotChoices: open.map((s) => ({
        start: s.start.toISOString(),
        label: s.start.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })),
    });
    return withYesNo(
      BotPrompts.askConfirm(`${label} on ${date} at ${practice.name}`, lang),
    );
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
    return withYesNo(
      BotPrompts.askConfirm(`${label} on ${date} at ${practice.name}`, lang),
    );
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

  return withSlotPicker(
    BotPrompts.askSlot(
      slotChoices.map((s, i) => ({ index: i + 1, label: s.label })),
      lang,
    ),
    slotChoices,
  );
}

async function confirmBooking(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const phone = patientPhone.replace(/\D/g, "").slice(-10);

  if (!state.locationId || !state.providerId || !state.mode) {
    await saveState(convId, { ...state, step: "awaiting_confirm" });
    return {
      reply: BotPrompts.tryBookAgain(
        "Booking details expired. Tap Menu → Book and choose a slot again.",
        lang,
      ),
    };
  }
  if (
    state.mode === ScheduleMode.TIME_BASED &&
    !state.slotStart
  ) {
    return {
      reply: BotPrompts.tryBookAgain(
        "No time slot selected. Please pick a slot again.",
        lang,
      ),
    };
  }
  if (
    state.mode === ScheduleMode.TOKEN_BASED &&
    !(state.sessionDate ?? state.date)
  ) {
    return {
      reply: BotPrompts.tryBookAgain(
        "No date selected. Please pick a date again.",
        lang,
      ),
    };
  }

  try {
    const existing = await PatientService.findByPhone(phone);
    if (!existing?.id) {
      // Keep confirm context only if they somehow skipped register mid-flow.
      await saveState(convId, {
        ...keepPrefs(state),
        step: "awaiting_register_name",
        afterRegister: "book",
      });
      return { reply: BotPrompts.needRegisterThenBook(lang) };
    }

    const booking = await BookingService.createBooking({
      practiceId: practice.id,
      locationId: state.locationId,
      providerId: state.providerId,
      patientPhone: phone,
      patientId: existing.id,
      patientName:
        existing.name?.trim() ||
        state.regName?.trim() ||
        "WhatsApp patient",
      mode: state.mode,
      slotStart: state.slotStart,
      sessionDate: state.sessionDate ?? state.date,
      channel: BookingChannel.WHATSAPP_AI,
      disease: "General consultation",
      skipPatientNotification: true,
    });

    // Never tell the patient "confirmed" unless the row is actually in Postgres.
    const verified = await prisma.practiceBooking.findUnique({
      where: { id: booking.id },
      select: { id: true, status: true, practiceId: true },
    });
    if (!verified) {
      console.error(
        `[whatsapp] confirmBooking: create returned id=${booking.id} but row missing`,
      );
      return {
        reply: BotPrompts.tryBookAgain(
          "Booking did not save. Please tap Yes again or Book from Menu.",
          lang,
        ),
      };
    }

    console.log(
      `[whatsapp] booking confirmed id=${verified.id} practice=${verified.practiceId} phone=${phone}`,
    );
    await saveState(convId, {
      ...idleState(state),
      lastBookingId: verified.id,
    });
    const detail = bookingWhenLabel(booking);
    return withMainMenu(
      BotPrompts.bookingConfirmed(practice.name, detail, lang),
    );
  } catch (err) {
    // Keep awaiting_confirm so a second Yes can retry without restarting the flow.
    await saveState(convId, { ...state, step: "awaiting_confirm" });
    const msg = err instanceof Error ? err.message : "Could not create booking.";
    console.warn(`[whatsapp] confirmBooking failed phone=${phone}:`, msg);
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
    `• Phone: +91 ${phone}`,
  ];
  if (state.regEmail) lines.push(`• Email: ${state.regEmail}`);
  if (state.regDob) lines.push(`• DOB: ${state.regDob}`);
  if (state.regAddress) lines.push(`• Address: ${state.regAddress}`);
  return lines.join("\n");
}

/** Display WhatsApp sender number for registration confirm (not from ID OCR). */
function formatRegPhoneDisplay(phone: string): string {
  const d = String(phone || "").replace(/\D/g, "").slice(-10);
  if (d.length !== 10) return `+91 ${phone}`;
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}

function parseRegisterMobile(text: string): string | null {
  const digits = String(text || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (last10.length !== 10 || !/^[6-9]/.test(last10)) return null;
  return last10;
}

function resolveRegisterPhone(
  state: ConversationState,
  whatsappFrom: string,
): string {
  const chosen = String(state.regPhone || "").replace(/\D/g, "").slice(-10);
  if (chosen.length === 10) return chosen;
  return String(whatsappFrom || "").replace(/\D/g, "").slice(-10);
}

function parseRegisterEmail(text: string): string | null {
  const raw = text.trim().toLowerCase();
  if (!raw) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return null;
  if (raw.endsWith("@patients.glucoguide.local")) return null;
  return raw;
}

function isAffirmative(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/^[*`~]+|[*`~]+$/g, "");
  return /^(yes|y|haan|ha|हाँ|हां|ok|okay|sure|reg_email_yes|email_yes|reg_phone_yes)$/i.test(
    t,
  );
}

function isNegative(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/^[*`~]+|[*`~]+$/g, "");
  return /^(no|n|nah|nope|nahi|नहीं|नही|skip|reg_email_no|email_no|reg_phone_no)$/i.test(
    t,
  );
}

function emailOptPrompt(lang: ReturnType<typeof resolveLang>): OrchestratorResult {
  return {
    reply: BotPrompts.askRegisterEmailOpt(lang),
    replyButtons: [
      { id: "reg_email_yes", title: "Yes" },
      { id: "reg_email_no", title: "No" },
    ],
  };
}

/** Ask to store WhatsApp sender number as registered mobile — Yes/No. */
function phoneOptPrompt(
  whatsappFrom: string,
  lang: ReturnType<typeof resolveLang>,
): OrchestratorResult {
  return {
    reply: BotPrompts.askRegisterPhoneOpt(
      formatRegPhoneDisplay(whatsappFrom),
      lang,
    ),
    replyButtons: [
      { id: "reg_phone_yes", title: "Yes" },
      { id: "reg_phone_no", title: "No" },
    ],
  };
}

function goToRegisterPhoneOpt(
  state: ConversationState,
  whatsappFrom: string,
  lang: ReturnType<typeof resolveLang>,
): OrchestratorResult {
  delete state.regPhone;
  state.step = "awaiting_register_phone_opt";
  return phoneOptPrompt(whatsappFrom, lang);
}

function goToRegisterConfirm(
  state: ConversationState,
  patientPhone: string,
  lang: ReturnType<typeof resolveLang>,
): OrchestratorResult {
  const phone = resolveRegisterPhone(state, patientPhone);
  state.step = "awaiting_register_confirm";
  state.pendingSummary = registerSummary(state, phone);
  return withYesNo(
    BotPrompts.askRegisterConfirm(
      state.pendingSummary,
      state.afterRegister === "book",
      lang,
    ),
  );
}

async function applyIdScanToRegister(
  convId: string,
  patientPhone: string,
  state: ConversationState,
  scan: IdScanFields,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing) {
    await saveState(convId, { ...state, step: "idle" });
    return withMainMenu(
      BotPrompts.idOcrAlreadyRegistered(existing.name || "", lang) +
        (scan.name
          ? `\n\n(Read from ID: *${scan.name}* — profile not changed.)`
          : ""),
    );
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
  // Registered mobile is always WhatsApp sender (confirmed next) — never OCR contactNumber.
  delete state.regPhone;

  const gender = scan.gender;
  if (gender) {
    state.regGender = gender;
    state.step = "awaiting_register_email_opt";
    await saveState(convId, state);
    const opt = emailOptPrompt(lang);
    return {
      reply:
        BotPrompts.idOcrGotName(name, lang) + "\n\n" + opt.reply,
      replyButtons: opt.replyButtons,
    };
  }

  state.step = "awaiting_register_gender";
  await saveState(convId, state);
  return withGenderButtons(
    BotPrompts.idOcrGotName(name, lang) + "\n\n" + BotPrompts.askRegisterGender(lang),
  );
}

async function startRegisterFlow(
  convId: string,
  patientPhone: string,
  prev: ConversationState = {},
): Promise<OrchestratorResult> {
  const lang = resolveLang(prev.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing) {
    await saveState(convId, idleState(prev));
    return withMainMenu(BotPrompts.alreadyRegistered(existing.name || "", lang));
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
): Promise<OrchestratorResult> {
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
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  if (!state.regGender) {
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return withGenderButtons(BotPrompts.askRegisterGender(lang));
  }
  try {
    const result = await PatientService.registerViaWhatsApp({
      phone: resolveRegisterPhone(state, patientPhone),
      whatsappFrom: patientPhone,
      name: state.regName!,
      gender: state.regGender,
      dateOfBirth: state.regDob ?? null,
      email: state.regEmail?.trim() || null,
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
        doctorList: bookReply.doctorList,
        replyButtons: bookReply.replyButtons,
        dateList: bookReply.dateList,
        slotList: bookReply.slotList,
        bookingList: bookReply.bookingList,
        menuList: bookReply.menuList,
      };
    }

    await saveState(convId, idleState(state));
    return withMainMenu(
      BotPrompts.registered(
        {
          name: result.name || state.regName!,
        },
        resolveLang(state.preferredLanguage),
      ),
    );
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
  fromVoice?: boolean;
}): Promise<OrchestratorResult> {
  const result = await runOrchestratorCore(input);
  const latest = await prisma.whatsAppConversation.findUnique({
    where: { id: input.convId },
  });
  const st = (latest?.state as ConversationState) ?? input.state ?? {};
  return {
    reply: guardOutbound(result.reply, resolveLang(st.preferredLanguage)),
    doctorList: result.doctorList,
    replyButtons: result.replyButtons,
    dateList: result.dateList,
    slotList: result.slotList,
    bookingList: result.bookingList,
    menuList: result.menuList,
  };
}

async function runOrchestratorCore(input: {
  practice: PracticeCtx;
  patientPhone: string;
  convId: string;
  state: ConversationState;
  text: string;
  idScan?: IdScanFields;
  fromVoice?: boolean;
}): Promise<OrchestratorResult> {
  const { practice, patientPhone, convId, text, idScan, fromVoice } = input;
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

  // Preferred language — ask once, but skip the gate for demo-speed actions
  // (BOOK / DOCTORS / hi) so the client demo reaches doctor pick in one turn.
  if (!state.preferredLanguage || state.step === "awaiting_language") {
    const chosen = parseLanguageChoice(text);
    if (chosen) {
      state = {
        ...state,
        preferredLanguage: chosen,
        step: "idle",
        aiDisclosed: true,
      };
      await saveState(convId, state);
      const patientAfterLang = await PatientService.findByPhone(patientPhone);
      return withMainMenu(
        aiDisclosure(practice.name, chosen) +
          languageSetAck(chosen) +
          "\n\n" +
          BotPrompts.welcome(practice.name, patientAfterLang?.name, chosen),
      );
    }

    const trimmed = text.trim();
    const actionFastPath =
      !state.preferredLanguage &&
      state.step !== "awaiting_language" &&
      (Boolean(exactMenuIntent(trimmed)) ||
        Boolean(menuNumberShortcut(trimmed)) ||
        /^(hi|hello|hey|start|book|doctors?|status)\b/i.test(trimmed));

    if (actionFastPath) {
      const inferred: WaLang = /[\u0900-\u097F]/.test(trimmed) ? "hi" : "en";
      state = {
        ...state,
        preferredLanguage: inferred,
        step: "idle",
        aiDisclosed: true,
      };
      await saveState(convId, state);
      // Fall through — process BOOK/DOCTORS immediately for demos
    } else {
      state = { ...state, step: "awaiting_language" };
      await saveState(convId, state);
      return withLanguageButtons(askPreferredLanguage());
    }
  }

  if (wantsLanguageChange(text)) {
    state = { ...state, step: "awaiting_language" };
    await saveState(convId, state);
    return withLanguageButtons(askPreferredLanguage());
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
      return withMainMenu(BotPrompts.help(practice.name, patient?.name, lang));
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
      state.step === "awaiting_register_email_opt" ||
      state.step === "awaiting_register_email" ||
      state.step === "awaiting_register_phone_opt" ||
      state.step === "awaiting_register_phone" ||
      state.step === "awaiting_register_confirm";
    if (!inRegister) {
      return { reply: BotPrompts.idPhotoWrongStep(lang) };
    }
    return applyIdScanToRegister(convId, patientPhone, state, idScan);
  }

  if (state.step && state.step !== "idle" && isTimedOut(state)) {
    state = idleState(state);
    await saveState(convId, state);
    return withMainMenu(BotPrompts.idleReset(lang));
  }

  // Global menu commands (typed or WhatsApp button) — always win over mid-flow steps
  // Digit shortcuts (1–9) only when idle so doctor/slot picks still use digits.
  // Interactive menu:* list picks always apply (same as typing BOOK).
  const isIdleMenu = !state.step || state.step === "idle";
  const listMenuPick = /^menu:/i.test(text.trim())
    ? menuNumberShortcut(text)
    : null;
  const numberShortcut =
    listMenuPick ?? (isIdleMenu ? menuNumberShortcut(text) : null);
  if (numberShortcut === "language") {
    state = { ...state, step: "awaiting_language" };
    await saveState(convId, state);
    return withLanguageButtons(askPreferredLanguage());
  }
  const menuIntent =
    (numberShortcut as BotIntent | null) ?? exactMenuIntent(text);
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
    if (!gender) {
      return withGenderButtons(BotPrompts.askRegisterGender(lang));
    }
    state.regGender = gender;
    state.step = "awaiting_register_email_opt";
    await saveState(convId, state);
    return emailOptPrompt(lang);
  }

  if (state.step === "awaiting_register_email_opt") {
    if (isAffirmative(text)) {
      delete state.regEmail;
      state.step = "awaiting_register_email";
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterEmail(lang) };
    }
    if (isNegative(text)) {
      delete state.regEmail;
      const next = goToRegisterPhoneOpt(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    // Typed a real email instead of Yes/No — accept and continue
    const typedEmail = parseRegisterEmail(text);
    if (typedEmail) {
      state.regEmail = typedEmail;
      const next = goToRegisterPhoneOpt(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    const again = emailOptPrompt(lang);
    return again;
  }

  if (state.step === "awaiting_register_email") {
    if (isNegative(text)) {
      delete state.regEmail;
      const next = goToRegisterPhoneOpt(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    const email = parseRegisterEmail(text);
    if (!email) return { reply: BotPrompts.askRegisterEmail(lang) };
    state.regEmail = email;
    const next = goToRegisterPhoneOpt(state, patientPhone, lang);
    await saveState(convId, state);
    return next;
  }

  if (state.step === "awaiting_register_phone_opt") {
    if (isAffirmative(text)) {
      state.regPhone = String(patientPhone || "").replace(/\D/g, "").slice(-10);
      const next = goToRegisterConfirm(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    if (isNegative(text)) {
      delete state.regPhone;
      state.step = "awaiting_register_phone";
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterPhoneManual(lang) };
    }
    // Typed a mobile instead of Yes/No — accept as registered number
    const typed = parseRegisterMobile(text);
    if (typed) {
      state.regPhone = typed;
      const next = goToRegisterConfirm(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    return phoneOptPrompt(patientPhone, lang);
  }

  if (state.step === "awaiting_register_phone") {
    const typed = parseRegisterMobile(text);
    if (!typed) {
      return { reply: BotPrompts.askRegisterPhoneManual(lang) };
    }
    state.regPhone = typed;
    const next = goToRegisterConfirm(state, patientPhone, lang);
    await saveState(convId, state);
    return next;
  }

  if (state.step === "awaiting_register_name") {
    const name = text.trim();
    if (name.length < 2 || /^(yes|no|help|book|register|male|female|others?)$/i.test(name)) {
      return { reply: BotPrompts.askRegisterName(lang) };
    }
    state.regName = name;
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return withGenderButtons(BotPrompts.askRegisterGender(lang));
  }

  if (state.step === "awaiting_register_confirm") {
    if (/^(yes|y|confirm|ok|okay|sure)$/i.test(text.trim())) {
      return confirmRegister(convId, practice, state, patientPhone);
    }
    if (/^(no|n|nope|cancel)$/i.test(text.trim())) {
      await saveState(convId, idleState(state));
      return withMainMenu(BotPrompts.registrationCanceled(lang));
    }
    return withYesNo(
      BotPrompts.askRegisterConfirm(
        state.pendingSummary ||
          registerSummary(state, resolveRegisterPhone(state, patientPhone)),
        state.afterRegister === "book",
        lang,
      ),
    );
  }

  // Fast path: booking/reschedule date — stay in step; never fall through to HELP/escalate
  // Voice notes may be free-form; if regex can't find a date, fall through to NLU.
  if (state.step === "awaiting_date") {
    if (fromVoice) {
      const quick = parsePatientDate(normalizeDateInput(text));
      if (quick.ok) {
        return handleAwaitingDate(convId, practice, state, patientPhone, text);
      }
    } else {
      return handleAwaitingDate(convId, practice, state, patientPhone, text);
    }
  }

  const contextHint = `step=${state.step ?? "idle"}; practice=${practice.name}; today=${formatLocalDate(new Date())}${fromVoice ? "; source=voice_note" : ""}`;
  const nlu = await parseUtterance(text, contextHint, {
    useLlm: shouldUseLlmForMessage(state.step, text, fromVoice),
  });
  if (fromVoice) {
    state = applyTimePreferenceFromSlots(state, nlu.slots, text);
  }

  // Voice fell through awaiting_date fast-path — resume once NLU has a date
  if (state.step === "awaiting_date") {
    const dateText = nlu.slots.date || text;
    const parsed = parsePatientDate(normalizeDateInput(dateText));
    if (parsed.ok) {
      return handleAwaitingDate(
        convId,
        practice,
        state,
        patientPhone,
        nlu.slots.date || text,
      );
    }
    return withDateButtons(
      fromVoice ? BotPrompts.voiceDateUnclear(lang) : BotPrompts.dateInvalid(lang),
    );
  }

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
        return withFaqActions(faq, lang);
      }
    }
  }

  // Personalized help / greeting
  if (nlu.intent === "help" && (!state.step || state.step === "idle")) {
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(BotPrompts.help(practice.name, patient?.name, lang));
  }

  // Doctors list (available anytime — does not clear in-progress booking)
  if (nlu.intent === "doctors") {
    const providers = await loadProviders(practice.id);
    return withDoctorList(
      BotPrompts.doctorsList(
        practice.name,
        providers.map((p, i) => ({
          index: i + 1,
          name: p.name,
          detail: p.detail,
        })),
        practiceClinicUrl(practice.slug),
        lang,
      ),
      providers,
    );
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
    return withYesNo(
      BotPrompts.askConfirm(state.pendingSummary || "this appointment", lang),
    );
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
      return withMainMenu(BotPrompts.canceled(lang));
    }
    if (nlu.intent === "confirm_no" || /^(no|n)$/i.test(text.trim())) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.keptBooking(lang) };
    }
    return withYesNo(
      BotPrompts.askCancelConfirm(state.pendingSummary || "this booking", lang),
    );
  }

  if (state.step === "awaiting_provider") {
    const providers = state.providerChoices ?? (await loadProviders(practice.id));
    const picked = pickProvider(providers, nlu.slots, text);
    if (!picked) {
      return withDoctorList(
        BotPrompts.askProvider(
          providers.map((p, i) => ({
            index: i + 1,
            name: p.name,
            detail: p.detail,
          })),
          lang,
        ),
        providers,
      );
    }
    state.providerId = picked.id;
    state.providerChoices = providers;

    // Doctor chosen before date (clinic multi-doctor BOOK flow)
    if (!state.date) {
      const locationId = state.locationId ?? practice.locations[0]?.id;
      state.step = "awaiting_date";
      let suggested: string | null = null;
      if (locationId) {
        state.locationId = locationId;
        suggested = await suggestDefaultDate(practice, picked.id, locationId);
      }
      await saveState(convId, state);
      return {
        reply: BotPrompts.doctorSelectedAskDate(picked.name, suggested, lang),
      };
    }

    return askModeForDay(convId, practice, state);
  }

  if (state.step === "awaiting_mode") {
    const t = text.toLowerCase();
    let mode: ScheduleMode | undefined = nlu.slots.mode;
    if (!mode && /^mode:TOKEN_BASED$/i.test(text.trim())) {
      mode = ScheduleMode.TOKEN_BASED;
    }
    if (!mode && /^mode:TIME_BASED$/i.test(text.trim())) {
      mode = ScheduleMode.TIME_BASED;
    }
    if (!mode && /token/.test(t)) mode = ScheduleMode.TOKEN_BASED;
    if (!mode && /time|slot/.test(t)) mode = ScheduleMode.TIME_BASED;
    if (!mode) {
      return withModeButtons(BotPrompts.askMode(true, true, lang), true, true);
    }
    state.mode = mode;
    return continueAfterMode(convId, practice, state);
  }

  if (state.step === "awaiting_slot") {
    const choices = state.slotChoices ?? [];
    let idx = parseSlotChoiceIndex(text, nlu.slots.slotIndex);
    // Voice / free text: "10 am" or "morning" instead of tapping a list row
    if (idx == null) {
      state = applyTimePreferenceFromSlots(state, nlu.slots, text);
      const open = choices
        .map((c) => ({ start: new Date(c.start) }))
        .filter((s) => !Number.isNaN(s.start.getTime()));
      const preferredIdx = matchPreferredSlotIndex(open, {
        preferredHour: state.preferredHour,
        preferredMinute: state.preferredMinute,
        preferredPeriod: state.preferredPeriod,
        timeText: state.preferredTimeText,
      });
      if (preferredIdx != null) idx = preferredIdx + 1;
    }
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice) {
      return withSlotPicker(
        BotPrompts.askSlot(
          choices.map((s, i) => ({ index: i + 1, label: s.label })),
          lang,
        ),
        choices,
      );
    }
    state.slotStart = choice.start;
    state.pendingSummary = `${choice.label} on ${state.date} at ${practice.name}`;
    state.step = "awaiting_confirm";
    await saveState(convId, state);
    return withYesNo(BotPrompts.askConfirm(state.pendingSummary, lang));
  }

  if (state.step === "awaiting_reschedule_booking") {
    const choices = state.bookingChoices ?? [];
    const idx = parseSlotChoiceIndex(text);
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice) {
      return withBookingPicker(
        BotPrompts.askReschedulePick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        choices,
      );
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
    return withDateButtons(
      `Rescheduling ${bookingWhenLabel(booking)}.\n${BotPrompts.askDate(lang)}`,
    );
  }

  if (state.step === "awaiting_reschedule_slot") {
    const choices = state.slotChoices ?? [];
    let idx = parseSlotChoiceIndex(text, nlu.slots.slotIndex);
    if (idx == null) {
      state = applyTimePreferenceFromSlots(state, nlu.slots, text);
      const open = choices
        .map((c) => ({ start: new Date(c.start) }))
        .filter((s) => !Number.isNaN(s.start.getTime()));
      const preferredIdx = matchPreferredSlotIndex(open, {
        preferredHour: state.preferredHour,
        preferredMinute: state.preferredMinute,
        preferredPeriod: state.preferredPeriod,
        timeText: state.preferredTimeText,
      });
      if (preferredIdx != null) idx = preferredIdx + 1;
    }
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice || !state.rescheduleBookingId) {
      return withSlotPicker(
        BotPrompts.askSlot(
          choices.map((s, i) => ({ index: i + 1, label: s.label })),
          lang,
        ),
        choices,
      );
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

  // Free speech / voice: date and/or time without an explicit "BOOK" word
  {
    const spoken = parseSpokenTime(text);
    if (
      (!state.step || state.step === "idle") &&
      nlu.intent === "unknown" &&
      (nlu.slots.date ||
        nlu.slots.preferredHour != null ||
        nlu.slots.preferredPeriod ||
        spoken.preferredHour != null ||
        spoken.preferredPeriod)
    ) {
      return ensureRegisteredThenBook(
        convId,
        practice,
        patientPhone,
        nlu.slots,
        applyTimePreferenceFromSlots(state, nlu.slots, text),
      );
    }
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
    return withYesNo(
      BotPrompts.askCancelConfirm(bookingWhenLabel(upcoming), lang),
    );
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
      return withDateButtons(
        `Rescheduling ${bookingWhenLabel(b)}.\n${BotPrompts.askDate(lang)}`,
      );
    }

    const bookingChoices = upcoming.map((b) => ({
      id: b.id,
      label: bookingWhenLabel(b),
    }));
    await saveState(convId, {
      step: "awaiting_reschedule_booking",
      bookingChoices,
    });
    return withBookingPicker(
      BotPrompts.askReschedulePick(
        bookingChoices.map((c, i) => ({ index: i + 1, label: c.label })),
        lang,
      ),
      bookingChoices,
    );
  }

  if (nlu.intent === "help") {
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(BotPrompts.help(practice.name, patient?.name, lang));
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
  return withMainMenu(BotPrompts.fallback(lang));
}

export { normalizePhone };
