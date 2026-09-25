import {
  BookingChannel,
  BookingStatus,
  ScheduleMode,
  type Practice,
  type ClinicLocation,
  type PracticeMember,
} from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { publicWebOrigin } from "../../config/index.js";
import { BookingService } from "./booking.service.js";
import { PatientService } from "../patient.js";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  askPreferredLanguage,
  languageSetAck,
  L,
  parseLanguageChoice,
  resolveLang,
  wantsLanguageChange,
  type WaLang,
} from "./whatsapp.i18n.js";
import {
  exactMenuIntent,
  formatNluBookConfirmSummary,
  matchPreferredSlotIndex,
  menuNumberShortcut,
  parsePatientDate,
  parseSlotsRegex,
  parseSpokenTime,
  parseUtterance,
  postBookingNumberShortcut,
  shouldConfirmNluBook,
  shouldUseLlmForMessage,
  type BotIntent,
  type NluSlots,
} from "./whatsapp.nlu.js";
import { formatLocalDate } from "./slotEngine.js";
import { buildCalendarInvite, bookingReferenceId } from "./bookingCalendar.js";
import {
  parseFamilyDobAndId,
  parseRelationshipChoice,
} from "./whatsapp.familyParse.js";
import { parseGlobalKeywordHijack } from "./whatsapp.hijacks.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";
import { normalizeGender } from "../../core/gender.js";
import { ageFromDob } from "../../core/dob.js";
import { uuidToBase64 } from "../../core/security.js";
import { socketManager } from "../../core/socket.js";
import {
  aiDisclosure,
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

/** Display name for WA greeting; "" if known but unnamed; null if phone not in DB. */
function greetingPatientName(
  user: { name?: string | null } | null | undefined,
): string | null {
  if (user == null) return null;
  return user.name?.trim() || "";
}

/** Full idle close (aligned with proactive worker). Override via WA_IDLE_CLOSE_MS. */
const IDLE_MS = Number(process.env.WA_IDLE_CLOSE_MS) > 0
  ? Number(process.env.WA_IDLE_CLOSE_MS)
  : 30 * 60_000;

export type ConversationStep =
  | "idle"
  | "awaiting_language"
  | "awaiting_date"
  | "awaiting_provider"
  | "awaiting_mode"
  | "awaiting_slot"
  | "awaiting_confirm"
  | "awaiting_cancel_confirm"
  | "awaiting_cancel_booking"
  | "awaiting_cancel_reason"
  | "awaiting_reschedule_booking"
  | "awaiting_reschedule_slot"
  | "awaiting_manage_booking"
  | "awaiting_manage_action"
  | "awaiting_message_doctor_booking"
  /** Branch E — waiting for the patient to type the message body. */
  | "awaiting_message_doctor_text"
  | "awaiting_book_patient"
  | "awaiting_book_whom"
  | "awaiting_specialty"
  | "awaiting_register_name"
  | "awaiting_register_dob"
  | "awaiting_register_gender"
  | "awaiting_register_email_opt"
  | "awaiting_register_email"
  | "awaiting_register_family_opt"
  | "awaiting_register_family_phone"
  | "awaiting_register_relationship"
  | "awaiting_register_family_details"
  | "awaiting_register_confirm"
  | "awaiting_attach_offer"
  | "awaiting_report_booking"
  | "awaiting_report"
  /** Branch F — waiting for WhatsApp file upload. */
  | "awaiting_document_upload"
  /** Branch F — Select Appointment | General Document after upload. */
  | "awaiting_document_link"
  /** NLU freeform book confirmation (Did you mean…?). */
  | "awaiting_nlu_book_confirm"
  /** Branch D — Talk to Support / Agent (LiveChat handoff). */
  | "agent_transfer";

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
  /** Profiles on this WhatsApp (self + family) for booking-for picker. */
  patientChoices?: Array<{ id: string; label: string; isSelf?: boolean }>;
  /** Departments / specialties for Branch A specialty → doctor flow. */
  specialtyChoices?: Array<{ id: string; label: string }>;
  /** Selected specialty label (matches provider.specialty). */
  selectedSpecialty?: string;
  /** Selected patient profile for the in-progress booking. */
  bookPatientId?: string;
  bookPatientName?: string;
  regName?: string;
  regGender?: string;
  regEmail?: string;
  /** Family-member mobile when registering someone else on this WhatsApp. */
  regPhone?: string;
  /** True when primary account already exists and this signup is for family. */
  registeringFamily?: boolean;
  regDob?: string | null;
  regAddress?: string | null;
  /** Branch C — Spouse / Child / Parent / …. */
  regRelationship?: string | null;
  /** Branch C — Emirates ID / National ID / Aadhaar. */
  regNationalId?: string | null;
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
  /**
   * Branch E — collecting the message body (appointment-scoped or Admin route).
   */
  postBookingCare?: boolean;
  /** Booking / doctor selected for Message doctor. */
  careBookingId?: string;
  careProviderId?: string;
  /** Branch E — no active visit: route message to Admin for doctor assignment. */
  messageDoctorAdminRoute?: boolean;
  /** Doctor display name while awaiting message text. */
  messageDoctorName?: string | null;
  /** Branch F — Cloudinary upload waiting for appointment link choice. */
  pendingDoc?: { name: string; url: string; uploadedAt: string } | null;
  /** Preferred reply language (set on first contact) */
  preferredLanguage?: "en" | "hi";
  /**
   * Last menu shown — typed 1–6 must match (main: Book… vs post: Reschedule…).
   */
  lastMenuKind?: "main" | "post";
  /**
   * When set, an idle-reminder was already sent while waiting for a reply.
   * Cleared on patient activity or when the chat is closed.
   */
  idleReminderSentAt?: string;
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
  /** Reschedule / message-doctor booking pick as a tappable list. */
  bookingList?: Array<{ index: number; label: string; description?: string }>;
  /** Who-to-book-for (self / family) as a tappable list. */
  patientList?: Array<{ index: number; label: string; description?: string }>;
  /** Department / specialty pick as a tappable list. */
  specialtyList?: Array<{ index: number; label: string; description?: string }>;
  /** Welcome / HELP menu as a tappable list (menu:book, …). */
  menuList?: Array<{ id: string; title: string; description?: string }>;
  /**
   * After confirm — send .ics as a WhatsApp document (plus links already in reply).
   */
  calendarInvite?: {
    icsFilename: string;
    icsContent: string;
    caption?: string;
  };
  /**
   * Send full `reply` as a text message before any Menu interactive list.
   * Required for language-switch acks — Meta list bodies truncate and can fail
   * silently, which previously left Hindi→English with no visible reply.
   */
  textBeforeMenu?: boolean;
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
  // Always send full text first — clinic URL must not be truncated in list body
  if (providers.length < 2) {
    return { reply, textBeforeMenu: /https?:\/\//i.test(reply) };
  }
  return {
    reply,
    textBeforeMenu: true,
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
  if (iso === tomorrowIso) return `Tomorrow · ${base}`.slice(0, 24);
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

/** Branch B — Reschedule | Cancel Booking | Back (Meta ≤3 buttons). */
function withManageActionButtons(
  reply: string,
  _lang: WaLang,
): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "manage:reschedule", title: "Reschedule" },
      { id: "manage:cancel", title: "Cancel Booking" },
      { id: "manage:back", title: "Back" },
    ],
  };
}

/** Cancel final confirm — Confirm Cancel | Keep Booking. */
function withCancelConfirmButtons(
  reply: string,
  _lang: WaLang,
): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "cancel:yes", title: "Confirm Cancel" },
      { id: "cancel:no", title: "Keep Booking" },
    ],
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

/** Branch F — Select Appointment | General Document. */
function withDocumentLinkButtons(reply: string): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "doc:appointment", title: "Select Appointment" },
      { id: "doc:general", title: "General Document" },
    ],
  };
}

/** Re-prompt copy after idle Continue, keyed by mid-flow step. */
function repromptHintForStep(state: ConversationState, lang: WaLang): string {
  switch (state.step) {
    case "awaiting_date":
      return BotPrompts.askDate(lang);
    case "awaiting_slot":
      return BotPrompts.askSlot(
        (state.slotChoices ?? []).map((s, i) => ({
          index: i + 1,
          label: s.label,
        })),
        lang,
      );
    case "awaiting_confirm":
      return state.pendingSummary
        ? BotPrompts.bookingSummary(
            {
              patient: state.bookPatientName || "you",
              doctor: "your doctor",
              dateTime: state.pendingSummary,
              location: "clinic",
            },
            lang,
          )
        : BotPrompts.askDate(lang);
    case "awaiting_document_upload":
    case "awaiting_report":
      return BotPrompts.askAttachDocumentUpload(lang);
    case "awaiting_document_link":
      return BotPrompts.askLinkDocumentToAppointment(lang);
    case "awaiting_nlu_book_confirm":
      return BotPrompts.nluBookConfirm(
        formatNluBookConfirmSummary(state.pendingBookSlots ?? {}),
        lang,
      );
    case "awaiting_register_name":
      return state.registeringFamily
        ? BotPrompts.askRegisterFamilyName(lang)
        : BotPrompts.askRegisterName(lang);
    case "awaiting_register_dob":
      return BotPrompts.askRegisterDob(lang);
    case "awaiting_message_doctor_text":
      return state.messageDoctorAdminRoute
        ? BotPrompts.askMessageDoctorAdmin(lang)
        : BotPrompts.askMessageDoctorText(state.messageDoctorName, lang);
    default:
      return L(
        lang,
        "Reply below to continue, or type *Menu* for the main options.",
        "जारी रखने के लिए नीचे जवाब दें, या मुख्य विकल्पों के लिए *Menu* लिखें।",
      );
  }
}

/** Branch C — Spouse | Child | Parent (free text also accepted). */
function withRelationshipButtons(
  reply: string,
  _lang: WaLang,
): OrchestratorResult {
  return {
    reply,
    replyButtons: [
      { id: "rel:spouse", title: "Spouse" },
      { id: "rel:child", title: "Child" },
      { id: "rel:parent", title: "Parent" },
    ],
  };
}


/** Log CallBack as high-priority Admin Support notice. */
async function logCallbackRequestToAdmin(opts: {
  practice: PracticeCtx;
  patientPhone: string;
}): Promise<void> {
  const { practice, patientPhone } = opts;
  const phone = normalizePhone(patientPhone);
  let patient = await resolveWhatsAppPatientUser(patientPhone);
  if (!patient) {
    try {
      const created = await PatientService.registerViaWhatsApp({
        phone,
        whatsappFrom: phone,
        name: `WhatsApp ${phone.slice(-4)}`,
        gender: "others",
        email: null,
      });
      patient = { id: created.id, name: created.name };
    } catch (err) {
      console.warn(
        "[whatsapp] callback provisional patient failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  const body =
    `🚨 [HIGH PRIORITY · CALLBACK]\n` +
    `Clinic: *${practice.name}*\n` +
    `Patient phone: ${phone}\n` +
    (patient?.name ? `Name: ${patient.name}\n` : "") +
    `Please call this patient shortly.`;

  if (patient?.id) {
    const { ChatService } = await import("../chat.js");
    await ChatService.sendHelpMessage(patient.id, body);
  } else {
    const { socketManager } = await import("../../core/socket.js");
    await socketManager.broadcastToAdmins({
      event: "callback_request",
      priority: "high",
      practiceId: practice.id,
      practiceName: practice.name,
      patientPhone: phone,
      content: body,
    });
  }
  void import("../opsSocket.js")
    .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("support"))
    .catch(() => undefined);
  void broadcastProctoEvent(practice.id, {
    event: "conversation_updated",
    conversation: {
      practice_id: practice.id,
      patient_phone: phone,
      callback_request: true,
      priority: "high",
      updated_at: new Date().toISOString(),
    },
  }).catch(() => undefined);
}

/**
 * Global keyword hijacks — abort any mid-flow step and redirect.
 * Runs before step handlers / handoff wait.
 */
async function applyGlobalKeywordHijack(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  text: string;
  lang: WaLang;
}): Promise<OrchestratorResult | null> {
  const { convId, practice, patientPhone, text, lang } = opts;
  const hijack = parseGlobalKeywordHijack(text);
  if (!hijack) return null;

  const cleared: ConversationState = {
    ...idleState({
      ...opts.state,
      handedOff: false,
      postBookingCare: false,
      registeringFamily: false,
    }),
    failedTurns: 0,
    pendingDoc: null,
    careBookingId: undefined,
    careProviderId: undefined,
    messageDoctorAdminRoute: false,
    afterRegister: undefined,
    pendingBookSlots: undefined,
  };

  if (hijack === "exit") {
    await saveState(convId, cleared);
    const updated = await prisma.whatsAppConversation.update({
      where: { id: convId },
      data: { status: "bot_active", state: touch(cleared) },
    });
    void broadcastProctoEvent(practice.id, {
      event: "conversation_updated",
      conversation: {
        id: updated.id,
        practice_id: updated.practiceId,
        status: updated.status,
        patient_phone: updated.patientPhone,
        updated_at: updated.updatedAt.toISOString(),
        session_ended: true,
      },
    }).catch(() => undefined);
    return { reply: BotPrompts.sessionEnded(lang) };
  }

  if (hijack === "callback") {
    try {
      await logCallbackRequestToAdmin({ practice, patientPhone });
    } catch (err) {
      console.warn(
        "[whatsapp] callback notify failed:",
        err instanceof Error ? err.message : err,
      );
    }
    await saveState(convId, cleared);
    await prisma.whatsAppConversation.update({
      where: { id: convId },
      data: { status: "bot_active", state: touch(cleared) },
    });
    return { reply: BotPrompts.callbackRequestLogged(lang) };
  }

  // Resume bot for Book / Register / Attach / Main Menu / Agent redirects.
  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { status: "bot_active" },
  }).catch(() => undefined);

  if (hijack === "main_menu") {
    await saveState(convId, cleared);
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(
      BotPrompts.help(practice.name, greetingPatientName(patient), lang),
    );
  }
  if (hijack === "agent") {
    return transferToAgent(convId, practice, cleared, lang);
  }
  if (hijack === "book") {
    return ensureRegisteredThenBook(
      convId,
      practice,
      patientPhone,
      {},
      cleared,
    );
  }
  if (hijack === "register") {
    return startRegisterFlow(convId, patientPhone, cleared);
  }
  if (hijack === "attach") {
    return startReportAttachFlow({
      convId,
      practice,
      patientPhone,
      state: cleared,
      lang,
    });
  }
  return null;
}

/** Unique placeholder phone for WA-only dependents (linked via contactNumber). */
function syntheticDependentPhone(primaryPhone: string, name: string): string {
  const base = normalizePhone(primaryPhone).slice(-10) || "0000000000";
  const mix = `${base}${name}${Date.now()}`.replace(/\D/g, "");
  return `8${(mix + "000000000000").slice(0, 11)}`;
}

/**
 * Branch D — Talk to Support / Agent.
 * Sets Agent Transfer state, parks the bot, and notifies LiveChat (inbox).
 */
async function transferToAgent(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  lang: WaLang,
): Promise<OrchestratorResult> {
  const next: ConversationState = {
    ...idleState(state),
    step: "agent_transfer",
    handedOff: true,
    postBookingCare: false,
    failedTurns: 0,
  };
  await saveState(convId, next);
  const updated = await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { status: "handed_off", state: touch(next) },
  });
  void broadcastProctoEvent(practice.id, {
    event: "conversation_updated",
    conversation: {
      id: updated.id,
      practice_id: updated.practiceId,
      status: updated.status,
      patient_phone: updated.patientPhone,
      updated_at: updated.updatedAt.toISOString(),
      agent_transfer: true,
    },
  }).catch(() => undefined);
  return { reply: BotPrompts.agentTransferConnecting(lang) };
}
function withBookingConfirmButtons(
  reply: string,
  _lang: WaLang,
): OrchestratorResult {
  // Titles stay English (≤20 chars) so Meta accepts them on all lines.
  return {
    reply,
    replyButtons: [
      { id: "confirm:yes", title: "Confirm Booking" },
      { id: "confirm:change", title: "Change Details" },
      { id: "confirm:cancel", title: "Cancel" },
    ],
  };
}

function formatBookingDateLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatBookingDateTimeLabel(opts: {
  date: string;
  slotStart?: string | null;
  timeLabel?: string | null;
  token?: number | null;
  sessionStart?: string | null;
  sessionEnd?: string | null;
}): string {
  const datePart = formatBookingDateLabel(opts.date);
  if (opts.token != null) {
    const window =
      opts.sessionStart && opts.sessionEnd
        ? ` (${opts.sessionStart}–${opts.sessionEnd})`
        : "";
    return `${datePart} · Token #${opts.token}${window}`;
  }
  if (opts.slotStart) {
    const t = new Date(opts.slotStart);
    if (!Number.isNaN(t.getTime())) {
      const timePart = t.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      return `${datePart} at ${timePart}`;
    }
  }
  if (opts.timeLabel?.trim()) {
    return `${datePart} at ${opts.timeLabel.trim()}`;
  }
  return datePart;
}

function formatDoctorDisplayName(name: string): string {
  const n = name.trim() || "Doctor";
  if (/^dr\.?\s/i.test(n)) return n.replace(/^dr\.?\s*/i, "Dr. ");
  return `Dr. ${n}`;
}

function locationDisplayLabel(
  practice: PracticeCtx,
  locationId?: string | null,
): string {
  const loc =
    (locationId
      ? practice.locations.find((l) => l.id === locationId)
      : null) ?? practice.locations[0];
  if (!loc) return practice.name;
  const name = loc.name?.trim() || practice.name;
  const city = loc.city?.trim();
  return city ? `${name}, ${city}` : name;
}

async function resolveDoctorDisplayName(
  practice: PracticeCtx,
  state: ConversationState,
): Promise<string> {
  if (!state.providerId) return "Doctor";
  const cached = state.providerChoices?.find((p) => p.id === state.providerId);
  if (cached?.name) return formatDoctorDisplayName(cached.name);
  const providers = await loadProviders(practice.id);
  const hit = providers.find((p) => p.id === state.providerId);
  return formatDoctorDisplayName(hit?.name || "Doctor");
}

async function presentBookingConfirm(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  opts: {
    date: string;
    slotStart?: string | null;
    timeLabel?: string | null;
    token?: number | null;
    sessionStart?: string | null;
    sessionEnd?: string | null;
  },
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const patient =
    state.bookPatientName?.trim() ||
    (lang === "hi" ? "आप" : "You");
  const doctor = await resolveDoctorDisplayName(practice, state);
  const dateTime = formatBookingDateTimeLabel(opts);
  const location = locationDisplayLabel(practice, state.locationId);
  const summary = BotPrompts.bookingSummary(
    { patient, doctor, dateTime, location },
    lang,
  );
  await saveState(convId, {
    ...state,
    step: "awaiting_confirm",
    pendingSummary: summary,
  });
  return withBookingConfirmButtons(summary, lang);
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

/** Welcome / HELP — six-option interactive main menu (Meta list ≤10 rows). */
function withMainMenu(reply: string): OrchestratorResult {
  // Always send the numbered list as text first — interactive Menu body truncates.
  // Titles ≤24 chars (Meta limit).
  return {
    reply,
    textBeforeMenu: true,
    menuList: [
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
        title: "3 · Add family",
        description: "Register a dependant",
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
    ],
  };
}

/** After booking — reschedule / cancel / new book / message doctor / report. */
function withPostBookingMenu(reply: string): OrchestratorResult {
  return {
    reply,
    textBeforeMenu: true,
    menuList: [
      {
        id: "post:reschedule",
        title: "1 · Reschedule",
        description: "Change date or time",
      },
      {
        id: "post:cancel",
        title: "2 · Cancel",
        description: "Cancel this visit",
      },
      {
        id: "post:book",
        title: "3 · New booking",
        description: "Book another visit",
      },
      {
        id: "post:message_doctor",
        title: "4 · Message doctor",
        description: "Chat with your doctor",
      },
      {
        id: "post:report",
        title: "5 · Attach doc",
        description: "Send report to doctor",
      },
    ],
  };
}

const UPCOMING_STATUSES = [
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
] as const;

async function findUpcomingBooking(practiceId: string, patientPhone: string) {
  const bookings = await BookingService.listForPatient({ phone: patientPhone });
  return (
    bookings.find(
      (b) =>
        b.practiceId === practiceId &&
        UPCOMING_STATUSES.includes(
          b.status as (typeof UPCOMING_STATUSES)[number],
        ),
    ) ?? null
  );
}

async function listUpcomingBookings(practiceId: string, patientPhone: string) {
  const bookings = await BookingService.listForPatient({ phone: patientPhone });
  return bookings
    .filter(
      (b) =>
        b.practiceId === practiceId &&
        UPCOMING_STATUSES.includes(
          b.status as (typeof UPCOMING_STATUSES)[number],
        ),
    )
    .slice(0, 5);
}

/** Branch F — ask for upload first; link to appointment after the file arrives. */
async function startReportAttachFlow(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, state, lang } = opts;
  await saveState(convId, {
    ...idleState(state),
    step: "awaiting_document_upload",
    lastBookingId: undefined,
    pendingDoc: null,
    bookingChoices: undefined,
    pendingSummary: undefined,
    failedTurns: 0,
    postBookingCare: false,
    handedOff: false,
  });
  return { reply: BotPrompts.askAttachDocumentUpload(lang) };
}

async function finishBranchFGeneralDocument(
  convId: string,
  state: ConversationState,
  patientPhone: string,
  lang: WaLang,
): Promise<OrchestratorResult> {
  const doc = state.pendingDoc;
  if (!doc?.url) {
    await saveState(convId, {
      ...idleState(state),
      step: "awaiting_document_upload",
      pendingDoc: null,
    });
    return { reply: BotPrompts.askAttachDocumentUpload(lang) };
  }
  const { attachWhatsAppPatientDocument } = await import("./whatsapp.visitDocs.js");
  const result = await attachWhatsAppPatientDocument({
    patientPhone,
    doc,
    lang,
  });
  await saveState(convId, {
    ...idleState(state),
    pendingDoc: null,
    failedTurns: 0,
  });
  return withMainMenu(result.reply);
}

async function finishBranchFBookingDocument(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
  bookingId: string,
  lang: WaLang,
): Promise<OrchestratorResult> {
  const doc = state.pendingDoc;
  if (!doc?.url) {
    await saveState(convId, {
      ...idleState(state),
      step: "awaiting_document_upload",
      pendingDoc: null,
      lastBookingId: bookingId,
    });
    return { reply: BotPrompts.askAttachDocumentUpload(lang) };
  }
  const { attachPendingDocToBooking } = await import("./whatsapp.visitDocs.js");
  const result = await attachPendingDocToBooking({
    practiceId: practice.id,
    patientPhone,
    bookingId,
    doc,
    lang,
  });
  await saveState(convId, {
    ...idleState(state),
    lastBookingId: result.bookingId || bookingId,
    pendingDoc: null,
    failedTurns: 0,
  });
  return withMainMenu(result.reply);
}

function bookingDoctorLabel(b: {
  mode: ScheduleMode;
  tokenNumber?: number | null;
  sessionDate?: Date | null;
  slotStart?: Date | null;
  provider?: { name?: string | null } | null;
}): { title: string; description: string; when: string } {
  const when = bookingWhenLabel(b);
  const rawName = b.provider?.name?.trim() || "Doctor";
  const title = (
    rawName.toLowerCase().startsWith("dr") ? rawName : `Dr ${rawName}`
  ).slice(0, 24);
  return { title, description: when.slice(0, 72), when };
}

/** Lines for post-booking greeting — doctor + when for each upcoming visit. */
function postBookingVisitLines(
  bookings: Array<{
    mode: ScheduleMode;
    tokenNumber?: number | null;
    sessionDate?: Date | null;
    slotStart?: Date | null;
    provider?: { name?: string | null } | null;
  }>,
): string[] {
  return bookings.map((b) => {
    const labels = bookingDoctorLabel(b);
    return `${labels.title} · ${labels.when}`;
  });
}

async function replyWithPostBookingMenu(opts: {
  practice: PracticeCtx;
  patientPhone: string;
  lang: WaLang;
}): Promise<OrchestratorResult | null> {
  const upcoming = await listUpcomingBookings(
    opts.practice.id,
    opts.patientPhone,
  );
  if (!upcoming.length) return null;
  return withPostBookingMenu(
    BotPrompts.postBookingAsk(
      opts.practice.name,
      postBookingVisitLines(upcoming),
      opts.lang,
    ),
  );
}

/** Active + recent visits eligible for Branch E Message doctor. */
const MESSAGE_DOCTOR_STATUSES = [
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
  BookingStatus.IN_PROGRESS,
  BookingStatus.COMPLETED,
] as const;

const MESSAGE_DOCTOR_RECENT_MS = 30 * 24 * 60 * 60 * 1000;

async function listMessageDoctorBookings(
  practiceId: string,
  patientPhone: string,
) {
  const bookings = await BookingService.listForPatient({ phone: patientPhone });
  const now = Date.now();
  const eligible = bookings.filter((b) => {
    if (b.practiceId !== practiceId) return false;
    if (
      !MESSAGE_DOCTOR_STATUSES.includes(
        b.status as (typeof MESSAGE_DOCTOR_STATUSES)[number],
      )
    ) {
      return false;
    }
    if (b.status === BookingStatus.COMPLETED) {
      const when = (b.slotStart ?? b.sessionDate ?? b.updatedAt)?.getTime?.()
        ?? (b.updatedAt instanceof Date ? b.updatedAt.getTime() : now);
      if (now - when > MESSAGE_DOCTOR_RECENT_MS) return false;
    }
    return true;
  });
  // Prefer open visits, then most recent.
  const openRank = (s: string) =>
    s === BookingStatus.COMPLETED ? 1 : 0;
  eligible.sort((a, b) => {
    const ra = openRank(a.status);
    const rb = openRank(b.status);
    if (ra !== rb) return ra - rb;
    const ta =
      (a.slotStart ?? a.sessionDate ?? a.updatedAt)?.getTime?.() ?? 0;
    const tb =
      (b.slotStart ?? b.sessionDate ?? b.updatedAt)?.getTime?.() ?? 0;
    return tb - ta;
  });
  return eligible.slice(0, 5);
}

async function resolveWhatsAppPatientUser(patientPhone: string): Promise<{
  id: string;
  name: string | null;
} | null> {
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing?.id) {
    return { id: existing.id, name: existing.name ?? null };
  }
  const linked = await PatientService.listLinkedToWhatsApp(patientPhone).catch(
    () => [],
  );
  const self = linked.find((p) => p.isSelf) ?? linked[0];
  if (self?.id) return { id: self.id, name: self.name ?? null };
  return null;
}

/**
 * Branch E — prompt for message text about a known appointment / doctor.
 * Stays bot_active (not open-ended handoff); one message then confirm.
 */
async function enterMessageDoctorCare(opts: {
  convId: string;
  state: ConversationState;
  lang: WaLang;
  booking: {
    id: string;
    providerId: string;
    mode: ScheduleMode;
    tokenNumber?: number | null;
    sessionDate?: Date | null;
    slotStart?: Date | null;
    provider?: { name?: string | null } | null;
  };
}): Promise<OrchestratorResult> {
  const { convId, state, lang, booking } = opts;
  const doctorName = booking.provider?.name?.trim() || "your doctor";
  const next: ConversationState = {
    ...idleState({ ...state, postBookingCare: false, handedOff: false }),
    step: "awaiting_message_doctor_text",
    careBookingId: booking.id,
    careProviderId: booking.providerId,
    lastBookingId: booking.id,
    messageDoctorAdminRoute: false,
    messageDoctorName: doctorName,
    failedTurns: 0,
  };
  await saveState(convId, next);
  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { status: "bot_active", state: touch(next) },
  });
  return { reply: BotPrompts.askMessageDoctorText(doctorName, lang) };
}

async function startMessageDoctorAdminFlow(opts: {
  convId: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, state, lang } = opts;
  const next: ConversationState = {
    ...idleState({ ...state, postBookingCare: false, handedOff: false }),
    step: "awaiting_message_doctor_text",
    careBookingId: undefined,
    careProviderId: undefined,
    messageDoctorAdminRoute: true,
    messageDoctorName: null,
    failedTurns: 0,
  };
  await saveState(convId, next);
  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { status: "bot_active", state: touch(next) },
  });
  return { reply: BotPrompts.askMessageDoctorAdmin(lang) };
}

async function startMessageDoctorFlow(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, practice, patientPhone, state, lang } = opts;
  const visits = await listMessageDoctorBookings(practice.id, patientPhone);
  if (!visits.length) {
    return startMessageDoctorAdminFlow({ convId, state, lang });
  }
  if (visits.length === 1) {
    return enterMessageDoctorCare({
      convId,
      state,
      lang,
      booking: visits[0]!,
    });
  }

  const bookingChoices = visits.map((b) => {
    const labels = bookingDoctorLabel(b);
    return {
      id: b.id,
      label: labels.title,
      description: labels.description,
    };
  });
  const next: ConversationState = {
    ...idleState({ ...state, postBookingCare: false, handedOff: false }),
    step: "awaiting_message_doctor_booking",
    bookingChoices: bookingChoices.map((c) => ({
      id: c.id,
      label: `${c.label} · ${c.description}`,
    })),
    messageDoctorAdminRoute: false,
    failedTurns: 0,
  };
  await saveState(convId, next);
  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { status: "bot_active", state: touch(next) },
  });
  return withBookingPicker(
    BotPrompts.askMessageDoctorPick(
      bookingChoices.map((c, i) => ({
        index: i + 1,
        label: `${c.label} · ${c.description}`,
      })),
      lang,
    ),
    bookingChoices,
    { forceList: true },
  );
}

/** Pin patient message onto the appointment record + doctor care chat (EMR). */
async function deliverMessageToDoctorAppointment(opts: {
  practice: PracticeCtx;
  patientPhone: string;
  bookingId: string;
  providerId: string;
  text: string;
}): Promise<void> {
  const { practice, patientPhone, bookingId, providerId, text } = opts;
  const patient = await resolveWhatsAppPatientUser(patientPhone);
  const noteLine = `[WhatsApp · Message to doctor]\n${text.trim()}`;
  const booking = await prisma.practiceBooking.findFirst({
    where: { id: bookingId, practiceId: practice.id },
    select: {
      id: true,
      notes: true,
      patientId: true,
      practiceId: true,
      providerId: true,
      locationId: true,
      patientPhone: true,
      patientName: true,
      mode: true,
      status: true,
      channel: true,
      slotStart: true,
      slotEnd: true,
      tokenNumber: true,
      sessionDate: true,
      consultationType: true,
      doctorRemarks: true,
      medicines: true,
      documents: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!booking) throw new Error("Appointment not found.");

  const prevNotes = booking.notes?.trim() || "";
  const nextNotes = prevNotes.includes(text.trim())
    ? prevNotes
    : prevNotes
      ? `${prevNotes}\n\n${noteLine}`
      : noteLine;

  const updated = await prisma.practiceBooking.update({
    where: { id: booking.id },
    data: {
      notes: nextNotes,
      ...(patient?.id && !booking.patientId ? { patientId: patient.id } : {}),
    },
  });

  void broadcastProctoEvent(
    practice.id,
    { event: "booking_updated", booking: serializeBooking(updated) },
    updated.patientId ?? patient?.id ?? null,
  ).catch(() => undefined);

  if (patient?.id) {
    const content =
      `💬 Message regarding appointment:\n${text.trim()}`;
    const created = await prisma.message.create({
      data: {
        content,
        type: "direct",
        senderId: patient.id,
        receiverId: providerId,
        isSeen: false,
      },
    });
    const payload: Record<string, unknown> = {
      id: uuidToBase64(created.id),
      sender_id: uuidToBase64(created.senderId),
      content: created.content,
      is_seen: created.isSeen,
      type: created.type,
      created_at: created.createdAt,
      idUuid: created.id,
      senderId: created.senderId,
      receiverId: created.receiverId,
      receiver_id: uuidToBase64(created.receiverId!),
      booking_id: bookingId,
    };
    await socketManager.sendPrivateMsg(
      `${uuidToBase64(providerId)}_CHAT`,
      payload,
    );
    await socketManager.sendPrivateMsg(
      `${uuidToBase64(patient.id)}_CHAT`,
      payload,
    );
  }
}

/** Route message to Admin portal (help thread) for doctor assignment. */
async function deliverMessageToAdminForAssignment(opts: {
  practice: PracticeCtx;
  patientPhone: string;
  text: string;
}): Promise<void> {
  const { practice, patientPhone, text } = opts;
  let patient = await resolveWhatsAppPatientUser(patientPhone);
  if (!patient) {
    // Provisional profile so Admin Support can open the thread.
    const created = await PatientService.registerViaWhatsApp({
      phone: normalizePhone(patientPhone),
      whatsappFrom: normalizePhone(patientPhone),
      name: `WhatsApp ${normalizePhone(patientPhone).slice(-4)}`,
      gender: "others",
      email: null,
    });
    patient = { id: created.id, name: created.name };
  }
  const { ChatService } = await import("../chat.js");
  const body =
    `[WhatsApp · ${practice.name}] Message for doctor assignment:\n` +
    `${text.trim()}\n` +
    `(from …${normalizePhone(patientPhone).slice(-4)})`;
  await ChatService.sendHelpMessage(patient.id, body);
}

async function confirmMessageDoctorDelivery(
  convId: string,
  state: ConversationState,
  lang: WaLang,
): Promise<OrchestratorResult> {
  await saveState(convId, {
    ...idleState(state),
    failedTurns: 0,
    postBookingCare: false,
    handedOff: false,
    messageDoctorAdminRoute: false,
    messageDoctorName: null,
    careBookingId: undefined,
    careProviderId: undefined,
  });
  await prisma.whatsAppConversation.update({
    where: { id: convId },
    data: { status: "bot_active" },
  });
  return withMainMenu(BotPrompts.messageDoctorDelivered(lang));
}

function isLooseIdleMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  // Explicit commands are handled elsewhere — everything else re-offers choices.
  if (
    /^(book|cancel|reschedule|status|help|menu|main\s*menu|show\s*menu|bot|resume|register|doctors?|faq|info|report|reports|my\s*docs?|message|msg|human|agent|staff)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  // Post-booking menu titles typed as free text (e.g. "New booking")
  if (
    /^(new\s+book(ing)?|book\s+(another|again|new)|another\s+booking)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (/^(?:menu|post):/i.test(t)) return false;
  if (/^lang:(en|hi)$/i.test(t)) return false;
  return true;
}

/** Typed Menu / Main — always the full 1–6 list (not post-booking). Help/Agent → support. */
function wantsFullMainMenu(text: string): boolean {
  return /^(menu|main|main\s*menu|show\s*menu|open\s*menu|back\s*to\s*menu|मेनू|मुख्य\s*मेनू)$/i.test(
    text.trim(),
  );
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

/** Reschedule / message-doctor booking pick — buttons if ≤3, else list. */
function withBookingPicker(
  reply: string,
  choices: Array<{ label: string; description?: string }>,
  opts?: { forceList?: boolean },
): OrchestratorResult {
  if (!choices.length) return { reply };
  if (!opts?.forceList && choices.length <= 3) {
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
      description: c.description,
    })),
  };
}

/** Who-to-book-for (yourself / family) — buttons if ≤3, else list. */
function withPatientPicker(
  reply: string,
  choices: Array<{ label: string; description?: string }>,
): OrchestratorResult {
  if (!choices.length) return { reply };
  if (choices.length <= 3) {
    return {
      reply,
      replyButtons: choices.map((c, i) => ({
        id: `patient:${i + 1}`,
        title: c.label.slice(0, 20),
      })),
    };
  }
  return {
    reply,
    patientList: choices.map((c, i) => ({
      index: i + 1,
      label: c.label.slice(0, 24),
      description: c.description?.slice(0, 72),
    })),
  };
}

/** Branch A step 1 — always Self vs Family member / dependent. */
function withWhomButtons(
  reply: string,
  selfName: string | null,
  lang: WaLang,
): OrchestratorResult {
  const selfTitle = selfName?.trim()
    ? `Self · ${selfName.trim()}`.slice(0, 20)
    : lang === "hi"
      ? "स्वयं"
      : "Self";
  return {
    reply,
    replyButtons: [
      { id: "whom:self", title: selfTitle },
      {
        id: "whom:family",
        title: lang === "hi" ? "परिवार सदस्य" : "Family member",
      },
    ],
  };
}

const DEFAULT_SPECIALTY = "General Medicine";

function normalizeSpecialtyLabel(specialty?: string | null): string {
  const t = specialty?.trim();
  return t && t.length > 0 ? t : DEFAULT_SPECIALTY;
}

function buildSpecialtyChoices(
  providers: Array<{ specialty?: string }>,
): string[] {
  const map = new Map<string, string>();
  for (const p of providers) {
    const label = normalizeSpecialtyLabel(p.specialty);
    const key = label.toLowerCase();
    if (!map.has(key)) map.set(key, label);
  }
  return [...map.values()].sort((a, b) => a.localeCompare(b));
}

function withSpecialtyList(
  reply: string,
  specialties: string[],
): OrchestratorResult {
  if (!specialties.length) return { reply };
  if (specialties.length <= 3) {
    return {
      reply,
      replyButtons: specialties.map((s, i) => ({
        id: `specialty:${i + 1}`,
        title: s.slice(0, 20),
      })),
    };
  }
  return {
    reply,
    textBeforeMenu: true,
    specialtyList: specialties.map((s, i) => ({
      index: i + 1,
      label: s.slice(0, 24),
      description: "Department",
    })),
  };
}

function pickSpecialty(
  choices: Array<{ id: string; label: string }>,
  text: string,
): { id: string; label: string } | null {
  const raw = text.trim();
  const tap = /^specialty:(\d+)$/i.exec(raw);
  if (tap) {
    const hit = choices[Number(tap[1]) - 1];
    if (hit) return hit;
  }
  const n = Number(raw);
  if (Number.isFinite(n) && n >= 1 && n <= choices.length) {
    return choices[n - 1] ?? null;
  }
  if (raw.length < 2) return null;
  const q = raw.toLowerCase();
  return (
    choices.find((c) => c.label.toLowerCase() === q) ??
    choices.find((c) => c.label.toLowerCase().includes(q)) ??
    null
  );
}

function providersForSpecialty(
  providers: Array<{
    id: string;
    name: string;
    detail?: string;
    specialty?: string;
  }>,
  specialtyLabel: string,
) {
  const key = specialtyLabel.trim().toLowerCase();
  const filtered = providers.filter(
    (p) => normalizeSpecialtyLabel(p.specialty).toLowerCase() === key,
  );
  return filtered.length ? filtered : providers;
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

/** Map slot:N / booking:N / patient:N tap (or plain number) to 1-based index. */
function parseSlotChoiceIndex(text: string, fallback?: number): number | null {
  const tap = /^(?:slot|booking|patient):(\d+)$/i.exec(text.trim());
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
  const digits = from.replace(/\D/g, "");
  // Keep full WhatsApp MSISDN (country + national), e.g. 9715… / 9198…
  if (digits.length >= 11 && digits.length <= 15) return digits;
  if (digits.length === 10) return digits;
  return digits.slice(-15);
}

/** Display WhatsApp sender as +<country><number> — never force +91. */
function formatRegPhoneDisplay(phone: string): string {
  const d = String(phone || "").replace(/\D/g, "");
  if (!d) return String(phone || "");
  return `+${d}`;
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
  | "preferredLanguage"
  | "aiDisclosed"
  | "waOptOut"
  | "handedOff"
  | "postBookingCare"
  | "lastBookingId"
  | "careBookingId"
  | "careProviderId"
  | "bookPatientId"
  | "bookPatientName"
  | "lastMenuKind"
> {
  return {
    preferredLanguage: state.preferredLanguage,
    aiDisclosed: state.aiDisclosed,
    waOptOut: state.waOptOut,
    handedOff: state.handedOff,
    postBookingCare: state.postBookingCare,
    lastBookingId: state.lastBookingId,
    bookPatientId: state.bookPatientId,
    bookPatientName: state.bookPatientName,
    lastMenuKind: state.lastMenuKind,
    // Keep selected doctor only while in Message-doctor care mode.
    ...(state.postBookingCare
      ? {
          careBookingId: state.careBookingId,
          careProviderId: state.careProviderId,
        }
      : {}),
  };
}

function idleState(state: ConversationState): ConversationState {
  return {
    ...keepPrefs(state),
    step: "idle",
    aiDisclosed: true,
    idleReminderSentAt: undefined,
  };
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

/** Tell the doctor in care chat that the patient cancelled (with optional reason). */
async function notifyDoctorOfCancel(opts: {
  booking: {
    id: string;
    practiceId: string;
    providerId: string;
    patientId?: string | null;
    patientName?: string | null;
    patientPhone: string;
    slotStart?: Date | null;
    sessionDate?: Date | null;
    mode: ScheduleMode;
    tokenNumber?: number | null;
  };
  reason: string | null;
}): Promise<void> {
  const digits = opts.booking.patientPhone.replace(/\D/g, "").slice(-10);
  let patientUserId = opts.booking.patientId ?? null;
  if (!patientUserId && digits.length >= 10) {
    const user = await prisma.user.findFirst({
      where: {
        role: "user",
        OR: [
          { phone: { endsWith: digits } },
          { patient: { is: { contactNumber: { endsWith: digits } } } },
        ],
      },
      select: { id: true },
    });
    patientUserId = user?.id ?? null;
  }
  if (!patientUserId) return;

  const when = bookingWhenLabel(opts.booking);
  const who = opts.booking.patientName?.trim() || "Patient";
  const reasonLine = opts.reason
    ? `\nReason: ${opts.reason}`
    : "\n(No reason given)";
  const content =
    `❌ Cancelled via WhatsApp: *${who}* — ${when}.${reasonLine}`;

  const created = await prisma.message.create({
    data: {
      content,
      type: "direct",
      senderId: patientUserId,
      receiverId: opts.booking.providerId,
      isSeen: false,
    },
  });

  const payload: Record<string, unknown> = {
    id: uuidToBase64(created.id),
    sender_id: uuidToBase64(created.senderId),
    content: created.content,
    is_seen: created.isSeen,
    type: created.type,
    created_at: created.createdAt,
    idUuid: created.id,
    senderId: created.senderId,
    receiverId: created.receiverId,
    receiver_id: uuidToBase64(created.receiverId!),
  };

  await socketManager.sendPrivateMsg(
    `${uuidToBase64(opts.booking.providerId)}_CHAT`,
    payload,
  );
  await socketManager.sendPrivateMsg(
    `${uuidToBase64(patientUserId)}_CHAT`,
    payload,
  );
}

function parseCancelReason(text: string): {
  kind: "reason" | "skip" | "abort";
  reason: string | null;
} {
  const t = text.trim();
  if (!t) return { kind: "skip", reason: null };
  // Keep the booking — do not cancel
  if (
    /^(no|n|nope|keep|stop|nevermind|never mind|abort|back|नहीं|ना|रखो|रद्द मत करो)$/i.test(
      t,
    )
  ) {
    return { kind: "abort", reason: null };
  }
  // Cancel without sharing a reason
  if (/^(skip|none|no reason|n\/a|-|—|कोई कारण नहीं)$/i.test(t)) {
    return { kind: "skip", reason: null };
  }
  return { kind: "reason", reason: t.slice(0, 280) };
}

async function finishWhatsAppCancel(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  bookingId: string;
  reason: string | null;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, practice, patientPhone, state, bookingId, reason, lang } =
    opts;

  let booking;
  try {
    booking = await BookingService.cancelByPatient(bookingId, {
      phone: patientPhone,
      reason: reason ?? undefined,
      skipPatientNotification: true,
    });
  } catch (err) {
    console.warn(
      "[WhatsApp cancel]",
      err instanceof Error ? err.message : err,
    );
    await saveState(convId, idleState(state));
    return {
      reply:
        lang === "hi"
          ? "यह बुकिंग रद्द नहीं हो सकी। *Menu* → *Status* से जाँचें या क्लिनिक से संपर्क करें।"
          : "Couldn’t cancel that booking. Tap *Menu* → *Status* to check, or contact the clinic.",
    };
  }

  void notifyDoctorOfCancel({ booking, reason }).catch((err) => {
    console.warn(
      "[WhatsApp cancel] doctor notify failed:",
      err instanceof Error ? err.message : err,
    );
  });

  await saveState(convId, idleState(state));
  const remaining = await replyWithPostBookingMenu({
    practice,
    patientPhone,
    lang,
  });
  const visitLabel =
    state.pendingSummary?.trim() || bookingWhenLabel(booking);
  const ack = BotPrompts.canceledWithReason(reason, lang, {
    hasMoreVisits: Boolean(remaining),
    referenceId: bookingReferenceId(booking.id),
    visitLabel,
  });
  if (remaining) {
    return {
      ...remaining,
      reply: `${ack}\n\n${remaining.reply}`,
    };
  }
  return withMainMenu(ack);
}

async function presentManageActions(opts: {
  convId: string;
  state: ConversationState;
  bookingId: string;
  label: string;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, state, bookingId, label, lang } = opts;
  await saveState(convId, {
    ...keepPrefs(state),
    step: "awaiting_manage_action",
    cancelBookingId: bookingId,
    rescheduleBookingId: bookingId,
    pendingSummary: label,
    bookingChoices: undefined,
    failedTurns: 0,
    postBookingCare: false,
    handedOff: false,
  });
  return withManageActionButtons(
    BotPrompts.askManageAction(label, lang),
    lang,
  );
}

/** Branch B — list upcoming → pick → Reschedule | Cancel. */
async function startManageBookingsFlow(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, practice, patientPhone, state, lang } = opts;
  const upcoming = await listUpcomingBookings(practice.id, patientPhone);

  if (!upcoming.length) {
    await saveState(convId, idleState(state));
    const patient = await PatientService.findByPhone(patientPhone);
    if (!patient) {
      return withMainMenu(
        L(
          lang,
          "No upcoming appointments — and you're not registered.\nTap *Menu* below for options.",
          "कोई आगामी अपॉइंटमेंट नहीं — और आप रजिस्टर्ड नहीं हैं।\nविकल्पों के लिए नीचे *Menu* दबाएँ।",
        ),
      );
    }
    return withMainMenu(BotPrompts.askManageBookingsPick([], lang));
  }

  const bookingChoices = upcoming.map((b) => ({
    id: b.id,
    label: postBookingVisitLines([b])[0] || bookingWhenLabel(b),
  }));

  if (bookingChoices.length === 1) {
    const only = bookingChoices[0]!;
    return presentManageActions({
      convId,
      state,
      bookingId: only.id,
      label: only.label,
      lang,
    });
  }

  await saveState(convId, {
    ...keepPrefs(state),
    step: "awaiting_manage_booking",
    bookingChoices,
    cancelBookingId: undefined,
    rescheduleBookingId: undefined,
    pendingSummary: undefined,
    failedTurns: 0,
    postBookingCare: false,
    handedOff: false,
  });
  return withBookingPicker(
    BotPrompts.askManageBookingsPick(
      bookingChoices.map((c, i) => ({ index: i + 1, label: c.label })),
      lang,
    ),
    bookingChoices.map((c) => {
      const [title, ...rest] = c.label.split(" · ");
      return {
        label: (title || c.label).slice(0, 24),
        description: rest.join(" · ").slice(0, 72) || undefined,
      };
    }),
    { forceList: true },
  );
}

/** @deprecated Prefer startManageBookingsFlow — kept for any leftover call sites. */
async function replyStatus(
  practice: PracticeCtx,
  patientPhone: string,
  lang: WaLang,
  convId?: string,
  state?: ConversationState,
): Promise<OrchestratorResult> {
  if (convId && state) {
    return startManageBookingsFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
  }
  // Fallback read-only list when no conversation context
  const upcoming = await listUpcomingBookings(practice.id, patientPhone);
  if (!upcoming.length) {
    return withMainMenu(BotPrompts.askManageBookingsPick([], lang));
  }
  const lines = upcoming.map(
    (b, i) =>
      `${i + 1}. ${postBookingVisitLines([b])[0] || bookingWhenLabel(b)}`,
  );
  return {
    reply: L(
      lang,
      `Your upcoming appointments at *${practice.name}*:\n${lines.join("\n")}\n\nTap *Menu* → *View / manage bookings* to reschedule or cancel.`,
      `*${practice.name}* पर आपकी आगामी अपॉइंटमेंट:\n${lines.join("\n")}\n\nरीशेड्यूल/रद्द के लिए *Menu* → *बुकिंग देखें / मैनेज करें*।`,
    ),
  };
}

async function startCancelFlow(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, practice, patientPhone, state, lang } = opts;
  const upcoming = await listUpcomingBookings(practice.id, patientPhone);
  if (!upcoming.length) {
    return {
      reply:
        lang === "hi"
          ? "रद्द करने के लिए कोई सक्रिय बुकिंग नहीं मिली।"
          : "No active booking found to cancel.",
    };
  }

  const bookingChoices = upcoming.map((b) => ({
    id: b.id,
    label: postBookingVisitLines([b])[0] || bookingWhenLabel(b),
  }));
  await saveState(convId, {
    ...state,
    step: "awaiting_cancel_booking",
    cancelBookingId: undefined,
    bookingChoices,
    pendingSummary: undefined,
  });
  return withBookingPicker(
    BotPrompts.askCancelPick(
      bookingChoices.map((c, i) => ({ index: i + 1, label: c.label })),
      lang,
    ),
    bookingChoices.map((c) => {
      const [title, ...rest] = c.label.split(" · ");
      return {
        label: (title || c.label).slice(0, 24),
        description: rest.join(" · ").slice(0, 72) || undefined,
      };
    }),
    { forceList: true },
  );
}

async function startRescheduleFlow(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, practice, patientPhone, state, lang } = opts;
  const upcoming = await listUpcomingBookings(practice.id, patientPhone);
  if (!upcoming.length) {
    return withMainMenu(BotPrompts.askReschedulePick([], lang));
  }

  if (upcoming.length === 1) {
    const b = upcoming[0]!;
    const label = postBookingVisitLines([b])[0] || bookingWhenLabel(b);
    await saveState(convId, {
      ...keepPrefs(state),
      step: "awaiting_date",
      rescheduleBookingId: b.id,
      providerId: b.providerId,
      locationId: b.locationId,
      mode: b.mode,
      pendingSummary: label,
      failedTurns: 0,
    });
    return withDateButtons(BotPrompts.rescheduleAskDate(label, lang));
  }

  const bookingChoices = upcoming.map((b) => ({
    id: b.id,
    label: postBookingVisitLines([b])[0] || bookingWhenLabel(b),
  }));
  await saveState(convId, {
    ...keepPrefs(state),
    step: "awaiting_reschedule_booking",
    bookingChoices,
    failedTurns: 0,
  });
  return withBookingPicker(
    BotPrompts.askReschedulePick(
      bookingChoices.map((c, i) => ({ index: i + 1, label: c.label })),
      lang,
    ),
    bookingChoices.map((c) => {
      const [title, ...rest] = c.label.split(" · ");
      return {
        label: (title || c.label).slice(0, 24),
        description: rest.join(" · ").slice(0, 72) || undefined,
      };
    }),
    { forceList: true },
  );
}

async function beginRescheduleForBooking(opts: {
  convId: string;
  practice: PracticeCtx;
  patientPhone: string;
  state: ConversationState;
  bookingId: string;
  label: string;
  lang: WaLang;
}): Promise<OrchestratorResult> {
  const { convId, practice, patientPhone, state, bookingId, label, lang } =
    opts;
  const booking = await prisma.practiceBooking.findUnique({
    where: { id: bookingId },
  });
  if (!booking || booking.practiceId !== practice.id) {
    await saveState(convId, idleState(state));
    return { reply: BotPrompts.bookingNotFound(lang) };
  }
  const digits = normalizePhone(patientPhone).slice(-10);
  const bookingDigits = String(booking.patientPhone || "")
    .replace(/\D/g, "")
    .slice(-10);
  if (digits.length >= 10 && bookingDigits !== digits) {
    await saveState(convId, idleState(state));
    return { reply: BotPrompts.bookingNotFound(lang) };
  }
  await saveState(convId, {
    ...keepPrefs(state),
    step: "awaiting_date",
    rescheduleBookingId: booking.id,
    providerId: booking.providerId,
    locationId: booking.locationId,
    mode: booking.mode,
    pendingSummary: label,
    cancelBookingId: undefined,
    failedTurns: 0,
  });
  return withDateButtons(BotPrompts.rescheduleAskDate(label, lang));
}

function rescheduleSuccessReply(
  updated: {
    id: string;
    mode: ScheduleMode;
    tokenNumber?: number | null;
    sessionDate?: Date | null;
    slotStart?: Date | null;
  },
  lang: WaLang,
): OrchestratorResult {
  return {
    reply: BotPrompts.rescheduled(bookingWhenLabel(updated), lang, {
      referenceId: bookingReferenceId(updated.id),
    }),
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
      return startManageBookingsFlow({
        convId,
        practice,
        patientPhone,
        state,
        lang,
      });
    case "book":
      return ensureRegisteredThenBook(convId, practice, patientPhone, {}, state);
    case "register":
      return startRegisterFlow(convId, patientPhone, state);
    case "doctors": {
      const providers = await loadProviders(practice.id);
      // Browse-only: full text + clinic URL + main menu — no dead "pick doctor" taps
      return withMainMenu(
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
      );
    }
    case "help": {
      // Always the full main menu (1–6). Post-booking chips are for idle "hi"
      // / free-text after a visit — not for Menu / Main menu / HELP.
      const patient = await PatientService.findByPhone(patientPhone);
      return withMainMenu(
        BotPrompts.help(practice.name, greetingPatientName(patient), lang),
      );
    }
    case "report":
      return startReportAttachFlow({
        convId,
        practice,
        patientPhone,
        state,
        lang,
      });
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
      return startCancelFlow({
        convId,
        practice,
        patientPhone,
        state,
        lang,
      });
    case "reschedule":
      return startRescheduleFlow({
        convId,
        practice,
        patientPhone,
        state,
        lang,
      });
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
  const origin = publicWebOrigin();
  if (!origin || !slug?.trim()) return null;
  return `${origin}/practices/${slug.trim()}`;
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
  if (
    /^(help|menu|main\s*menu|show\s*menu|open\s*menu|back\s*to\s*menu|\?)$/i.test(
      trimmed,
    )
  ) {
    await saveState(convId, idleState(state));
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(BotPrompts.help(practice.name, greetingPatientName(patient), lang));
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
        return rescheduleSuccessReply(updated, lang);
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
        return rescheduleSuccessReply(updated, lang);
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
        return rescheduleSuccessReply(updated, lang);
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
    specialtyChoices: undefined,
    selectedSpecialty: undefined,
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

  // Branch A: specialty → doctor when multiple departments and no doctor yet.
  const specialties = buildSpecialtyChoices(providers);
  if (!state.providerId && specialties.length > 1) {
    state.step = "awaiting_specialty";
    state.specialtyChoices = specialties.map((label) => ({
      id: label,
      label,
    }));
    await saveState(convId, state);
    return withSpecialtyList(
      BotPrompts.askSpecialty(
        specialties.map((label, i) => ({ index: i + 1, label })),
        lang,
      ),
      specialties,
    );
  }

  // Single specialty (or specialty implied): show doctors when 2+.
  if (!state.providerId && providers.length > 1) {
    if (specialties.length === 1) {
      state.selectedSpecialty = specialties[0];
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

async function continueAfterSpecialty(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  specialtyLabel: string,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const all = state.providerChoices ?? (await loadProviders(practice.id));
  const filtered = providersForSpecialty(all, specialtyLabel);
  state.selectedSpecialty = specialtyLabel;
  state.providerChoices = filtered;
  state.specialtyChoices = undefined;

  if (filtered.length === 1) {
    const only = filtered[0]!;
    state.providerId = only.id;
    if (state.date) {
      return askModeForDay(convId, practice, state);
    }
    const locationId = state.locationId ?? practice.locations[0]?.id;
    state.step = "awaiting_date";
    let suggested: string | null = null;
    if (locationId) {
      state.locationId = locationId;
      suggested = await suggestDefaultDate(practice, only.id, locationId);
    }
    await saveState(convId, state);
    return withDateButtons(
      BotPrompts.doctorSelectedAskDate(only.name, suggested, lang),
      suggested,
    );
  }

  state.step = "awaiting_provider";
  state.providerId = undefined;
  await saveState(convId, state);
  return withDoctorList(
    BotPrompts.specialtySelectedAskDoctor(specialtyLabel, lang) +
      "\n\n" +
      BotPrompts.askProvider(
        filtered.map((p, i) => ({
          index: i + 1,
          name: p.name,
          detail: p.detail,
        })),
        lang,
      ),
    filtered,
  );
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
    return presentBookingConfirm(
      convId,
      practice,
      {
        ...state,
        mode: ScheduleMode.TOKEN_BASED,
        sessionDate: date,
        tokenPreview: session.nextToken,
        slotStart: undefined,
      },
      {
        date,
        token: session.nextToken,
        sessionStart: session.sessionStart,
        sessionEnd: session.sessionEnd,
      },
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
    return presentBookingConfirm(
      convId,
      practice,
      {
        ...state,
        mode: ScheduleMode.TIME_BASED,
        slotStart: picked.start.toISOString(),
        slotChoices: open.map((s) => ({
          start: s.start.toISOString(),
          label: s.start.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        })),
      },
      {
        date,
        slotStart: picked.start.toISOString(),
        timeLabel: label,
      },
    );
  }

  // Auto-confirm if only one slot remains
  if (open.length === 1) {
    const only = open[0]!;
    const label = only.start.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    return presentBookingConfirm(
      convId,
      practice,
      {
        ...state,
        mode: ScheduleMode.TIME_BASED,
        slotStart: only.start.toISOString(),
        slotChoices: [{ start: only.start.toISOString(), label }],
      },
      {
        date,
        slotStart: only.start.toISOString(),
        timeLabel: label,
      },
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

function bookingForSuffix(state: ConversationState): string {
  const name = state.bookPatientName?.trim();
  if (!name) return "";
  return ` for ${name}`;
}

async function confirmBooking(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const phone = normalizePhone(patientPhone);

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
    const existing = state.bookPatientId
      ? await prisma.user.findUnique({
          where: { id: state.bookPatientId },
          include: { patient: true },
        })
      : await PatientService.findByPhone(phone);
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
        state.bookPatientName?.trim() ||
        existing.name?.trim() ||
        state.regName?.trim() ||
        "WhatsApp patient",
      mode: state.mode,
      slotStart: state.slotStart,
      sessionDate: state.sessionDate ?? state.date,
      channel: BookingChannel.WHATSAPP_AI,
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
          "Booking did not save. Please tap *Confirm Booking* again or Book from Menu.",
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
      step: "awaiting_attach_offer",
    });

    const location =
      practice.locations.find((l) => l.id === state.locationId) ??
      practice.locations[0];
    const doctorName = await resolveDoctorDisplayName(practice, {
      ...state,
      providerId: state.providerId,
    });
    const invite = buildCalendarInvite({
      id: verified.id,
      mode: booking.mode,
      slotStart: booking.slotStart,
      sessionDate: booking.sessionDate,
      tokenNumber: booking.tokenNumber,
      patientName:
        state.bookPatientName?.trim() ||
        existing.name?.trim() ||
        state.regName?.trim() ||
        null,
      practiceName: practice.name,
      providerName: doctorName,
      location: {
        name: location?.name,
        address: location?.address,
        city: location?.city,
        geometry: location?.geometry,
      },
    });
    const detail = bookingWhenLabel(booking);
    const confirmText = BotPrompts.bookingConfirmed(
      practice.name,
      detail,
      lang,
      {
        referenceId: invite.referenceId,
        googleCalendarUrl: invite.googleCalendarUrl,
        mapsUrl: invite.mapsUrl,
        icsUrl: invite.icsUrl,
      },
    );
    return {
      ...withYesNo(
        `${confirmText}\n\n${BotPrompts.askAttachDocument(lang)}`,
      ),
      calendarInvite: {
        icsFilename: invite.icsFilename,
        icsContent: invite.icsContent,
        caption: L(
          lang,
          `Calendar invite · ${invite.referenceId}`,
          `कैलेंडर आमंत्रण · ${invite.referenceId}`,
        ),
      },
    };
  } catch (err) {
    // Keep awaiting_confirm so Confirm Booking can retry without restarting.
    await saveState(convId, { ...state, step: "awaiting_confirm" });
    const msg = err instanceof Error ? err.message : "Could not create booking.";
    console.warn(`[whatsapp] confirmBooking failed phone=${phone}:`, msg);
    const summary = state.pendingSummary?.trim();
    return withBookingConfirmButtons(
      BotPrompts.tryBookAgain(msg, lang) +
        (summary ? `\n\n${summary}` : ""),
      lang,
    );
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
    `• Phone: ${formatRegPhoneDisplay(phone)}`,
  ];
  if (state.registeringFamily) lines.unshift("• Type: Family member");
  if (state.regRelationship) lines.push(`• Relationship: ${state.regRelationship}`);
  if (state.regEmail) lines.push(`• Email: ${state.regEmail}`);
  if (state.regDob) {
    lines.push(`• DOB: ${state.regDob}`);
    const age = ageFromDob(state.regDob);
    if (age != null) lines.push(`• Age: ${age}`);
  }
  if (state.regNationalId) lines.push(`• National ID: ${state.regNationalId}`);
  if (state.regAddress) lines.push(`• Address: ${state.regAddress}`);
  return lines.join("\n");
}

function parseRegisterMobile(text: string): string | null {
  const digits = String(text || "").replace(/\D/g, "");
  if (digits.length >= 11 && digits.length <= 15) return digits;
  const last10 = digits.slice(-10);
  if (last10.length === 10) return last10;
  return null;
}

function resolveRegisterPhone(
  state: ConversationState,
  whatsappFrom: string,
): string {
  if (state.registeringFamily && state.regPhone) {
    return normalizePhone(state.regPhone);
  }
  return normalizePhone(whatsappFrom);
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
  return /^(yes|y|haan|ha|हाँ|हां|ok|okay|sure|reg_email_yes|email_yes)$/i.test(
    t,
  );
}

function isNegative(text: string): boolean {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/^[*`~]+|[*`~]+$/g, "");
  return /^(no|n|nah|nope|nahi|नहीं|नही|skip|reg_email_no|email_no)$/i.test(
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

function goToFamilyPhoneOrConfirm(
  state: ConversationState,
  patientPhone: string,
  lang: ReturnType<typeof resolveLang>,
): OrchestratorResult {
  if (state.registeringFamily && !state.regPhone) {
    state.step = "awaiting_register_family_phone";
    return { reply: BotPrompts.askRegisterFamilyPhone(lang) };
  }
  return goToRegisterConfirm(state, patientPhone, lang);
}

async function applyIdScanToRegister(
  convId: string,
  patientPhone: string,
  state: ConversationState,
  scan: IdScanFields,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  // Primary already registered — offer family signup unless already in that flow.
  if (existing && !state.registeringFamily) {
    if (scan.name) state.regName = scan.name.trim();
    if (scan.dateOfBirth) state.regDob = scan.dateOfBirth;
    if (scan.address) state.regAddress = scan.address;
    if (scan.gender) state.regGender = scan.gender;
    await saveState(convId, {
      ...keepPrefs(state),
      step: "awaiting_register_family_opt",
      registeringFamily: false,
      regName: state.regName,
      regGender: state.regGender,
      regDob: state.regDob ?? null,
      regAddress: state.regAddress ?? null,
    });
    return withYesNo(
      BotPrompts.askRegisterFamilyOpt(existing.name || "", lang) +
        (scan.name
          ? `\n\n(Read from ID: *${scan.name}* — tap *Yes* to register them as a family member.)`
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
  // Registered mobile is always the WhatsApp sender — never OCR contactNumber.

  // Branch C family flow: name (from ID) → relationship → DOB/ID.
  if (state.registeringFamily) {
    if (scan.aadharNumber) {
      state.regNationalId = String(scan.aadharNumber).replace(/\D/g, "").slice(0, 32);
    } else if (scan.panNumber) {
      state.regNationalId = String(scan.panNumber).replace(/\s+/g, "").slice(0, 32);
    }
    state.step = state.regRelationship?.trim()
      ? "awaiting_register_family_details"
      : "awaiting_register_relationship";
    await saveState(convId, state);
    if (state.step === "awaiting_register_family_details") {
      return {
        reply:
          BotPrompts.idOcrGotName(name, lang) +
          "\n\n" +
          BotPrompts.askRegisterFamilyDobAndId(lang),
      };
    }
    return withRelationshipButtons(
      BotPrompts.idOcrGotName(name, lang) +
        "\n\n" +
        BotPrompts.askRegisterFamilyRelationship(lang),
      lang,
    );
  }

  const gender = scan.gender;
  if (gender) state.regGender = gender;

  // Self: ensure DOB before gender/email when OCR did not supply it.
  if (!state.regDob?.trim()) {
    state.step = "awaiting_register_dob";
    await saveState(convId, state);
    return {
      reply:
        BotPrompts.idOcrGotName(name, lang) +
        "\n\n" +
        BotPrompts.askRegisterDob(lang),
    };
  }

  if (state.regGender) {
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

async function startFamilyMemberFlow(
  convId: string,
  prev: ConversationState = {},
  opts?: { afterRegister?: "book"; pendingBookSlots?: NluSlots },
): Promise<OrchestratorResult> {
  const lang = resolveLang(prev.preferredLanguage);
  await saveState(convId, {
    ...keepPrefs(prev),
    step: "awaiting_register_name",
    registeringFamily: true,
    afterRegister: opts?.afterRegister,
    pendingBookSlots: opts?.pendingBookSlots,
    regName: undefined,
    regGender: undefined,
    regEmail: undefined,
    regPhone: undefined,
    regDob: null,
    regAddress: null,
    regRelationship: null,
    regNationalId: null,
  });
  return { reply: BotPrompts.askRegisterFamilyName(lang) };
}

async function startRegisterFlow(
  convId: string,
  patientPhone: string,
  prev: ConversationState = {},
): Promise<OrchestratorResult> {
  const lang = resolveLang(prev.preferredLanguage);
  const existing = await PatientService.findByPhone(patientPhone);
  if (existing) {
    // Menu "Register family member" → Branch C directly.
    return startFamilyMemberFlow(convId, prev);
  }
  await saveState(convId, {
    ...keepPrefs(prev),
    step: "awaiting_register_name",
    registeringFamily: false,
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
  const profiles = await PatientService.listLinkedToWhatsApp(patientPhone);
  const self = profiles.find((p) => p.isSelf) ?? null;
  const patientChoices = profiles.map((p) => ({
    id: p.id,
    label: p.isSelf ? `Self · ${p.name}` : p.name,
    isSelf: p.isSelf,
  }));

  // Branch A: always ask Self vs Family member / dependent first.
  await saveState(convId, {
    ...keepPrefs({
      ...prev,
      bookPatientId: undefined,
      bookPatientName: undefined,
    }),
    step: "awaiting_book_whom",
    patientChoices,
    pendingBookSlots: slots,
    bookPatientId: undefined,
    bookPatientName: undefined,
    failedTurns: 0,
    handedOff: false,
    postBookingCare: false,
  });
  return withWhomButtons(
    BotPrompts.askBookWhom(self?.name ?? null, lang),
    self?.name ?? null,
    lang,
  );
}

async function startFamilyRegisterForBook(
  convId: string,
  slots: NluSlots,
  prev: ConversationState,
): Promise<OrchestratorResult> {
  return startFamilyMemberFlow(convId, prev, {
    afterRegister: "book",
    pendingBookSlots: slots,
  });
}

async function startSelfRegisterForBook(
  convId: string,
  slots: NluSlots,
  prev: ConversationState,
): Promise<OrchestratorResult> {
  const lang = resolveLang(prev.preferredLanguage);
  await saveState(convId, {
    ...keepPrefs(prev),
    step: "awaiting_register_name",
    registeringFamily: false,
    afterRegister: "book",
    pendingBookSlots: slots,
    bookPatientId: undefined,
    bookPatientName: undefined,
  });
  return { reply: BotPrompts.needRegisterThenBook(lang) };
}

async function confirmFamilyMember(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  const name = state.regName?.trim();
  if (!name || name.length < 2) {
    state.step = "awaiting_register_name";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterFamilyName(lang) };
  }
  if (!state.regRelationship?.trim()) {
    state.step = "awaiting_register_relationship";
    await saveState(convId, state);
    return withRelationshipButtons(
      BotPrompts.askRegisterFamilyRelationship(lang),
      lang,
    );
  }
  if (!state.regDob?.trim() || !state.regNationalId?.trim()) {
    state.step = "awaiting_register_family_details";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterFamilyDobAndId(lang) };
  }
  if (!state.regGender) {
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return withGenderButtons(BotPrompts.askRegisterFamilyGender(lang));
  }

  try {
    const depPhone =
      state.regPhone?.replace(/\D/g, "") ||
      syntheticDependentPhone(patientPhone, name);
    const result = await PatientService.registerViaWhatsApp({
      phone: depPhone,
      whatsappFrom: normalizePhone(patientPhone),
      name,
      gender: state.regGender,
      dateOfBirth: state.regDob,
      relationship: state.regRelationship,
      nationalId: state.regNationalId,
      email: null,
      address: state.regAddress ?? null,
    });
    const continueToBook = state.afterRegister === "book";
    const pendingSlots = state.pendingBookSlots ?? {};
    const displayName = result.relationship
      ? `${result.name || name} · ${result.relationship}`
      : result.name || name;

    if (continueToBook) {
      const withPatient: ConversationState = {
        ...idleState(state),
        bookPatientId: result.id,
        bookPatientName: displayName,
      };
      await saveState(convId, withPatient);
      const bookReply = await startBookFlow(
        convId,
        practice,
        pendingSlots,
        withPatient,
      );
      return {
        reply:
          BotPrompts.familyRegistered(
            result.name || name,
            lang,
            result.relationship || state.regRelationship,
            result.age,
          ) +
          "\n\n" +
          bookReply.reply,
        doctorList: bookReply.doctorList,
        replyButtons: bookReply.replyButtons,
        dateList: bookReply.dateList,
        slotList: bookReply.slotList,
        bookingList: bookReply.bookingList,
        patientList: bookReply.patientList,
        specialtyList: bookReply.specialtyList,
        menuList: bookReply.menuList,
      };
    }

    await saveState(convId, idleState(state));
    return withMainMenu(
      BotPrompts.familyRegistered(
        result.name || name,
        lang,
        result.relationship || state.regRelationship,
        result.age,
      ),
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Could not save family member.";
    console.warn(`[whatsapp] confirmFamilyMember failed:`, msg);
    await saveState(convId, {
      ...state,
      step: "awaiting_register_family_details",
    });
    return {
      reply: `${msg}\n\n${BotPrompts.askRegisterFamilyDobAndId(lang)}`,
    };
  }
}

async function confirmRegister(
  convId: string,
  practice: PracticeCtx,
  state: ConversationState,
  patientPhone: string,
): Promise<OrchestratorResult> {
  const lang = resolveLang(state.preferredLanguage);
  if (state.registeringFamily) {
    return confirmFamilyMember(convId, practice, state, patientPhone);
  }
  if (!state.regGender) {
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return withGenderButtons(BotPrompts.askRegisterGender(lang));
  }
  if (!state.regDob?.trim()) {
    state.step = "awaiting_register_dob";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterDob(lang) };
  }
  try {
    const registerPhone = resolveRegisterPhone(state, patientPhone);
    const result = await PatientService.registerViaWhatsApp({
      phone: registerPhone,
      whatsappFrom: normalizePhone(patientPhone),
      name: state.regName!,
      gender: state.regGender,
      dateOfBirth: state.regDob,
      email: state.regEmail?.trim() || null,
      address: state.regAddress ?? null,
    });
    const continueToBook = state.afterRegister === "book";
    const pendingSlots = state.pendingBookSlots ?? {};

    if (continueToBook) {
      const withPatient: ConversationState = {
        ...idleState(state),
        bookPatientId: result.id,
        bookPatientName: result.name || state.regName!,
      };
      await saveState(convId, withPatient);
      const bookReply = await startBookFlow(
        convId,
        practice,
        pendingSlots,
        withPatient,
      );
      return {
        reply:
          BotPrompts.registered(
            {
              name: result.name || state.regName!,
              age: result.age,
              continueToBook: true,
            },
            lang,
          ) +
          "\n\n" +
          bookReply.reply,
        doctorList: bookReply.doctorList,
        replyButtons: bookReply.replyButtons,
        dateList: bookReply.dateList,
        slotList: bookReply.slotList,
        bookingList: bookReply.bookingList,
        patientList: bookReply.patientList,
        specialtyList: bookReply.specialtyList,
        menuList: bookReply.menuList,
      };
    }

    await saveState(convId, idleState(state));
    return withMainMenu(
      BotPrompts.registered(
        {
          name: result.name || state.regName!,
          age: result.age,
        },
        lang,
      ),
    );
  } catch (err) {
    await saveState(convId, idleState(state));
    const msg = err instanceof Error ? err.message : "Could not register.";
    return {
      reply: BotPrompts.tryRegisterAgain(msg, lang),
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

  // Remember which menu was shown so typed 1–6 match (Book vs Reschedule)
  const rows = result.menuList ?? [];
  if (rows.some((r) => r.id.startsWith("menu:"))) {
    const next = { ...st, lastMenuKind: "main" as const };
    await saveState(input.convId, next);
  } else if (rows.some((r) => r.id.startsWith("post:"))) {
    const next = { ...st, lastMenuKind: "post" as const };
    await saveState(input.convId, next);
  }

  return {
    reply: guardOutbound(result.reply, resolveLang(st.preferredLanguage)),
    doctorList: result.doctorList,
    replyButtons: result.replyButtons,
    dateList: result.dateList,
    slotList: result.slotList,
    bookingList: result.bookingList,
    patientList: result.patientList,
    menuList: result.menuList,
    textBeforeMenu: result.textBeforeMenu,
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

  // Preferred language — ask once; also handle explicit lang:en / lang:hi taps
  // even when a language is already set (change-language flow).
  // Never interrupt mid-flow confirms (cancel/book/register) to re-ask language.
  {
    const chosenNow = parseLanguageChoice(text);
    const awaitingLang = state.step === "awaiting_language";
    const langButton = /^lang:(en|hi)$/i.test(text.trim());

    if (chosenNow && (awaitingLang || langButton || !state.preferredLanguage)) {
      const previousLang = state.preferredLanguage;
      state = {
        ...state,
        preferredLanguage: chosenNow,
        step: "idle",
        aiDisclosed: true,
        idleReminderSentAt: undefined,
      };
      await saveState(convId, state);

      // Already had a language (switch or re-pick) — short ack, no re-disclosure
      if (previousLang) {
        const withBooking = await replyWithPostBookingMenu({
          practice,
          patientPhone,
          lang: chosenNow,
        });
        if (withBooking) {
          return {
            ...withBooking,
            textBeforeMenu: true,
            reply: `${languageSetAck(chosenNow)}\n\n${withBooking.reply}`,
          };
        }
        const patientAfterLang = await PatientService.findByPhone(patientPhone);
        return {
          ...withMainMenu(
            `${languageSetAck(chosenNow)}\n\n` +
              BotPrompts.welcome(
                practice.name,
                greetingPatientName(patientAfterLang),
                chosenNow,
              ),
          ),
          textBeforeMenu: true,
        };
      }

      // First-time language pick
      const patientAfterLang = await PatientService.findByPhone(patientPhone);
      return {
        ...withMainMenu(
          aiDisclosure(practice.name, chosenNow) +
            languageSetAck(chosenNow) +
            "\n\n" +
            BotPrompts.welcome(
              practice.name,
              greetingPatientName(patientAfterLang),
              chosenNow,
            ),
        ),
        textBeforeMenu: true,
      };
    }

    if (!state.preferredLanguage || awaitingLang) {
      const midFlow =
        Boolean(state.step) &&
        state.step !== "idle" &&
        state.step !== "awaiting_language";

      if (midFlow) {
        state = {
          ...state,
          preferredLanguage: "en",
          aiDisclosed: true,
        };
        await saveState(convId, state);
        // Fall through — finish cancel/confirm/register with default English
      } else {
        const trimmed = text.trim();
        const actionFastPath =
          !state.preferredLanguage &&
          !awaitingLang &&
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
    }
  }

  if (wantsLanguageChange(text)) {
    state = { ...state, step: "awaiting_language" };
    await saveState(convId, state);
    return withLanguageButtons(askPreferredLanguage());
  }

  const lang: WaLang = resolveLang(state.preferredLanguage);

  // Global keyword hijacks — abort any step (Register/Book/Exit/Attach/CallBack).
  {
    const hijacked = await applyGlobalKeywordHijack({
      convId,
      practice,
      patientPhone,
      state,
      text,
      lang,
    });
    if (hijacked) return hijacked;
  }

  if (state.handedOff || state.step === "agent_transfer") {
    const t = text.trim();
    const resumeMenuOnly =
      /^(bot|resume|menu|main\s*menu|show\s*menu|open\s*menu|back\s*to\s*menu|help)$/i.test(
        t,
      );
    const resumeAndRun =
      /^(book|cancel|reschedule|status|help|hi|hello|hey|start|register|doctors?|faq|info|report|reports|my\s*docs?|message|main\s*menu|attach|exit|callback|call\s*back)\b/i.test(
        t,
      ) ||
      (/\b(book|cancel|reschedule|message)\b/i.test(t) && t.length < 80) ||
      /^(?:menu|post|doc|booking|whom|idle|confirm|cancel|nlu):/i.test(t) ||
      /^(select(\s+appointment)?|general(\s+document)?)$/i.test(t);

    // Mid-flow bot steps (Branch F document link, register, book, …) must not
    // be trapped behind a prior support handoff — resume the bot and continue.
    const midFlowBotStep =
      Boolean(state.step) &&
      state.step !== "idle" &&
      state.step !== "agent_transfer";

    // After booking, free text should get Reschedule/Cancel/New/Message-doctor
    // unless the patient explicitly chose "Message doctor" (postBookingCare).
    const offerPostBooking =
      !state.postBookingCare && (!state.step || state.step === "idle");

    if (
      !midFlowBotStep &&
      !resumeMenuOnly &&
      !resumeAndRun &&
      !offerPostBooking
    ) {
      return { reply: BotPrompts.handedOffWait(lang) };
    }

    state = {
      ...state,
      handedOff: false,
      postBookingCare: false,
      // Keep mid-flow step (e.g. awaiting_document_link); otherwise idle.
      step: midFlowBotStep ? state.step : "idle",
      failedTurns: 0,
    };
    await saveState(convId, state);
    const resumed = await prisma.whatsAppConversation.update({
      where: { id: convId },
      data: { status: "bot_active", state },
    });
    void broadcastProctoEvent(practice.id, {
      event: "conversation_updated",
      conversation: {
        id: resumed.id,
        practice_id: resumed.practiceId,
        status: resumed.status,
        patient_phone: resumed.patientPhone,
        updated_at: resumed.updatedAt.toISOString(),
        agent_transfer: false,
      },
    }).catch(() => undefined);

    if (resumeMenuOnly && !midFlowBotStep) {
      const patient = await PatientService.findByPhone(patientPhone);
      return withMainMenu(BotPrompts.help(practice.name, greetingPatientName(patient), lang));
    }
    // Fall through — process BOOK / STATUS / document link / etc. normally
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
      state.step === "awaiting_register_dob" ||
      state.step === "awaiting_register_gender" ||
      state.step === "awaiting_register_email_opt" ||
      state.step === "awaiting_register_email" ||
      state.step === "awaiting_register_family_opt" ||
      state.step === "awaiting_register_family_phone" ||
      state.step === "awaiting_register_relationship" ||
      state.step === "awaiting_register_family_details" ||
      state.step === "awaiting_register_confirm";
    if (!inRegister) {
      return { reply: BotPrompts.idPhotoWrongStep(lang) };
    }
    return applyIdScanToRegister(convId, patientPhone, state, idScan);
  }

  if (state.step && state.step !== "idle" && isTimedOut(state)) {
    state = idleState(state);
    await saveState(convId, state);
    return withMainMenu(BotPrompts.chatClosed(lang));
  }

  // Patient replied — clear any pending idle-reminder flag
  if (state.idleReminderSentAt) {
    state = { ...state, idleReminderSentAt: undefined };
  }

  // Idle reminder buttons: Continue | Main Menu (ids from proactive nudge)
  {
    const raw = text.trim();
    if (/^(idle:main)$/i.test(raw)) {
      const cleared = idleState(state);
      await saveState(convId, cleared);
      const patient = await PatientService.findByPhone(patientPhone);
      return withMainMenu(
        BotPrompts.help(practice.name, greetingPatientName(patient), lang),
      );
    }
    if (
      /^(continue:flow|continue)$/i.test(raw) &&
      state.step &&
      state.step !== "idle"
    ) {
      await saveState(convId, {
        ...state,
        idleReminderSentAt: undefined,
      });
      return {
        reply:
          BotPrompts.idleContinueAck(lang) +
          "\n\n" +
          repromptHintForStep(state, lang),
        replyButtons:
          state.step === "awaiting_nlu_book_confirm"
            ? [
                { id: "nlu:yes", title: "Yes" },
                { id: "nlu:no", title: "No" },
              ]
            : undefined,
      };
    }
  }

  // After booking — Yes/No attach-document offer (before menu shortcuts)
  if (state.step === "awaiting_attach_offer") {
    if (/^(yes|y|confirm|ok|हाँ|हां|जी)$/i.test(text.trim())) {
      await saveState(convId, {
        ...keepPrefs(state),
        step: "awaiting_document_upload",
        lastBookingId: state.lastBookingId,
        pendingDoc: null,
        failedTurns: 0,
        postBookingCare: false,
        handedOff: false,
      });
      return { reply: BotPrompts.askAttachDocumentUpload(lang) };
    }
    if (/^(no|n|nope|skip|later|बाद में|नहीं)$/i.test(text.trim())) {
      await saveState(convId, {
        ...idleState(state),
        lastBookingId: state.lastBookingId,
      });
      const withBooking = await replyWithPostBookingMenu({
        practice,
        patientPhone,
        lang,
      });
      if (withBooking) {
        return {
          ...withBooking,
          reply: `${BotPrompts.attachDocumentSkipped(lang)}\n\n${withBooking.reply}`,
        };
      }
      return withMainMenu(BotPrompts.attachDocumentSkipped(lang));
    }
    return withYesNo(BotPrompts.askAttachDocument(lang));
  }

  // Branch F — waiting for file upload
  if (
    state.step === "awaiting_document_upload" ||
    state.step === "awaiting_report"
  ) {
    if (/^(no|n|nope|skip|cancel|stop|later|बाद में|नहीं|रद्द)$/i.test(text.trim())) {
      await saveState(convId, {
        ...idleState(state),
        lastBookingId: state.lastBookingId,
        pendingDoc: null,
      });
      const withBooking = await replyWithPostBookingMenu({
        practice,
        patientPhone,
        lang,
      });
      if (withBooking) {
        return {
          ...withBooking,
          reply: `${BotPrompts.attachDocumentSkipped(lang)}\n\n${withBooking.reply}`,
        };
      }
      return withMainMenu(BotPrompts.attachDocumentSkipped(lang));
    }
    if (
      !/^(?:menu|post):/i.test(text.trim()) &&
      !exactMenuIntent(text) &&
      !wantsFullMainMenu(text)
    ) {
      return {
        reply: state.pendingSummary
          ? BotPrompts.askReportForVisit(state.pendingSummary, lang)
          : BotPrompts.askAttachDocumentUpload(lang),
      };
    }
  }

  // Branch F — link uploaded doc to appointment or save as general
  if (state.step === "awaiting_document_link") {
    const t = text.trim();
    const wantGeneral =
      /^(doc:general|general(\s*document)?|patient(\s*record)?|no|skip)$/i.test(
        t,
      );
    const wantAppt =
      /^(doc:appointment|select(\s+appointment)?|appointment|yes|link)$/i.test(
        t,
      );

    if (wantGeneral) {
      return finishBranchFGeneralDocument(convId, state, patientPhone, lang);
    }

    if (wantAppt) {
      const upcoming = await listUpcomingBookings(practice.id, patientPhone);
      if (!upcoming.length) {
        return finishBranchFGeneralDocument(convId, state, patientPhone, lang);
      }
      if (upcoming.length === 1) {
        return finishBranchFBookingDocument(
          convId,
          practice,
          state,
          patientPhone,
          upcoming[0]!.id,
          lang,
        );
      }
      const bookingChoices = upcoming.map((b) => ({
        id: b.id,
        label: postBookingVisitLines([b])[0] || bookingWhenLabel(b),
      }));
      await saveState(convId, {
        ...keepPrefs(state),
        step: "awaiting_report_booking",
        bookingChoices,
        pendingDoc: state.pendingDoc,
        failedTurns: 0,
      });
      return withBookingPicker(
        BotPrompts.askReportPick(
          bookingChoices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        bookingChoices.map((c) => {
          const [title, ...rest] = c.label.split(" · ");
          return {
            label: (title || c.label).slice(0, 24),
            description: rest.join(" · ").slice(0, 72) || undefined,
          };
        }),
        { forceList: true },
      );
    }

    return withDocumentLinkButtons(
      BotPrompts.askLinkDocumentToAppointment(lang),
    );
  }

  // Global menu commands (typed or WhatsApp button) — always win over mid-flow steps
  // Digit shortcuts (1–6) only when idle so doctor/slot picks still use digits.
  // Interactive menu:* / post:* list picks always apply (same as typing BOOK).
  const isIdleMenu = !state.step || state.step === "idle";
  const listMenuPick = /^(?:menu|post):/i.test(text.trim())
    ? postBookingNumberShortcut(text) ?? menuNumberShortcut(text)
    : null;
  // After full main menu, typed 1–6 mean Book/My bookings/… — not Reschedule/Cancel.
  // After post-booking menu (or default with an upcoming visit), 1–5 mean post actions.
  const preferMainDigits = state.lastMenuKind === "main";
  let upcomingIdleList: Awaited<ReturnType<typeof listUpcomingBookings>> | null =
    null;
  const loadUpcomingIdle = async () => {
    if (upcomingIdleList) return upcomingIdleList;
    upcomingIdleList = isIdleMenu
      ? await listUpcomingBookings(practice.id, patientPhone)
      : [];
    return upcomingIdleList;
  };

  let numberShortcut: ReturnType<typeof menuNumberShortcut> | null =
    listMenuPick;
  if (!numberShortcut && isIdleMenu) {
    if (preferMainDigits) {
      numberShortcut = menuNumberShortcut(text);
    } else {
      const upcomingForDigits = await loadUpcomingIdle();
      numberShortcut = upcomingForDigits.length
        ? postBookingNumberShortcut(text) ?? menuNumberShortcut(text)
        : menuNumberShortcut(text);
    }
  }
  if (numberShortcut === "language") {
    state = { ...state, step: "awaiting_language" };
    await saveState(convId, state);
    return withLanguageButtons(askPreferredLanguage());
  }
  const menuIntent =
    (numberShortcut as BotIntent | null) ?? exactMenuIntent(text);

  if (menuIntent === "message_doctor") {
    return startMessageDoctorFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
  }

  if (menuIntent === "human") {
    return transferToAgent(convId, practice, state, lang);
  }

  if (menuIntent) {
    // Leaving care mode when they pick Book / Cancel / Reschedule / etc.
    state = {
      ...idleState(state),
      failedTurns: 0,
      postBookingCare: false,
      handedOff: false,
    };
    await Promise.all([
      saveState(convId, state),
      prisma.whatsAppConversation.update({
        where: { id: convId },
        data: { status: "bot_active", state },
      }),
    ]);
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

  // Idle + active booking: ANY free-text message → post-booking choices
  // (unless they already chose "Message doctor" and are chatting).
  if (
    isIdleMenu &&
    !state.postBookingCare &&
    isLooseIdleMessage(text) &&
    !menuIntent
  ) {
    const upcomingForLoose = await loadUpcomingIdle();
    if (upcomingForLoose.length) {
      state = {
        ...idleState(state),
        failedTurns: 0,
        postBookingCare: false,
        handedOff: false,
      };
      await Promise.all([
        saveState(convId, state),
        prisma.whatsAppConversation.update({
          where: { id: convId },
          data: { status: "bot_active", state },
        }),
      ]);
      return withPostBookingMenu(
        BotPrompts.postBookingAsk(
          practice.name,
          postBookingVisitLines(upcomingForLoose),
          lang,
        ),
      );
    }
  }

  // Branch E — collect message body before NLU (so free text is not re-classified).
  if (state.step === "awaiting_message_doctor_text") {
    const body = text.trim();
    if (
      body.length < 2 ||
      /^(menu|bot|resume|help|book|cancel|status)$/i.test(body)
    ) {
      if (state.messageDoctorAdminRoute) {
        return { reply: BotPrompts.askMessageDoctorAdmin(lang) };
      }
      return {
        reply: BotPrompts.askMessageDoctorText(
          state.messageDoctorName,
          lang,
        ),
      };
    }
    try {
      if (state.messageDoctorAdminRoute || !state.careBookingId) {
        await deliverMessageToAdminForAssignment({
          practice,
          patientPhone,
          text: body,
        });
      } else {
        const providerId =
          state.careProviderId ||
          (
            await prisma.practiceBooking.findUnique({
              where: { id: state.careBookingId },
              select: { providerId: true },
            })
          )?.providerId;
        if (!providerId) {
          await deliverMessageToAdminForAssignment({
            practice,
            patientPhone,
            text: body,
          });
        } else {
          await deliverMessageToDoctorAppointment({
            practice,
            patientPhone,
            bookingId: state.careBookingId,
            providerId,
            text: body,
          });
        }
      }
      return confirmMessageDoctorDelivery(convId, state, lang);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not deliver message.";
      console.warn(`[whatsapp] Branch E message doctor failed:`, msg);
      return {
        reply: `${msg}\n\n${
          state.messageDoctorAdminRoute
            ? BotPrompts.askMessageDoctorAdmin(lang)
            : BotPrompts.askMessageDoctorText(state.messageDoctorName, lang)
        }`,
      };
    }
  }

  // Fast path: registration gender/name/email/family/confirm — no NLU/LLM
  if (state.step === "awaiting_register_family_opt") {
    if (isAffirmative(text)) {
      state.registeringFamily = true;
      delete state.regPhone;
      // Keep OCR-prefilled name; Branch C continues with relationship → DOB/ID.
      if (state.regName && state.regName.trim().length >= 2) {
        state.step = "awaiting_register_relationship";
        await saveState(convId, state);
        return withRelationshipButtons(
          BotPrompts.askRegisterFamilyRelationship(lang),
          lang,
        );
      }
      delete state.regName;
      delete state.regGender;
      delete state.regEmail;
      state.regDob = null;
      state.regAddress = null;
      state.regRelationship = null;
      state.regNationalId = null;
      state.step = "awaiting_register_name";
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterFamilyName(lang) };
    }
    if (isNegative(text)) {
      await saveState(convId, idleState(state));
      return withMainMenu(BotPrompts.alreadyRegistered("", lang));
    }
    return withYesNo(BotPrompts.askRegisterFamilyOpt("", lang));
  }

  if (state.step === "awaiting_register_family_phone") {
    const typed = parseRegisterMobile(text);
    if (!typed) {
      return { reply: BotPrompts.askRegisterFamilyPhone(lang) };
    }
    const existingFamily = await PatientService.findByPhone(typed);
    if (existingFamily) {
      return {
        reply:
          L(
            lang,
            `That number is already registered as *${existingFamily.name || "a patient"}*.\n` +
              `Send a different mobile number for your family member.`,
            `वह नंबर पहले से *${existingFamily.name || "मरीज़"}* के नाम से रजिस्टर्ड है।\n` +
              `परिवार के सदस्य के लिए दूसरा मोबाइल नंबर भेजें।`,
          ),
      };
    }
    // Don't reuse the WhatsApp sender as the family login phone.
    if (normalizePhone(typed) === normalizePhone(patientPhone)) {
      return {
        reply:
          L(
            lang,
            "That is *your* WhatsApp number. Send your *family member's* mobile number.",
            "यह *आपका* WhatsApp नंबर है। *परिवार के सदस्य* का मोबाइल नंबर भेजें।",
          ),
      };
    }
    state.regPhone = typed;
    const next = goToRegisterConfirm(state, patientPhone, lang);
    await saveState(convId, state);
    return next;
  }

  if (state.step === "awaiting_register_dob") {
    const parsed = parseFamilyDobAndId(text);
    if (!parsed.dob) {
      return { reply: BotPrompts.askRegisterDob(lang) };
    }
    state.regDob = parsed.dob;
    if (parsed.nationalId) state.regNationalId = parsed.nationalId;
    if (!state.regGender) {
      state.step = "awaiting_register_gender";
      await saveState(convId, state);
      return withGenderButtons(BotPrompts.askRegisterGender(lang));
    }
    state.step = "awaiting_register_email_opt";
    await saveState(convId, state);
    return emailOptPrompt(lang);
  }

  if (state.step === "awaiting_register_gender") {
    const gender = parseGender(text, parseSlotsRegex(text));
    if (!gender) {
      return withGenderButtons(
        state.registeringFamily
          ? BotPrompts.askRegisterFamilyGender(lang)
          : BotPrompts.askRegisterGender(lang),
      );
    }
    state.regGender = gender;
    // Self typed path: DOB is required (ID OCR may already have it).
    if (!state.registeringFamily && !state.regDob?.trim()) {
      state.step = "awaiting_register_dob";
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterDob(lang) };
    }
    if (state.registeringFamily) {
      return confirmFamilyMember(convId, practice, state, patientPhone);
    }
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
      const next = goToFamilyPhoneOrConfirm(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    // Typed a real email instead of Yes/No — accept and continue
    const typedEmail = parseRegisterEmail(text);
    if (typedEmail) {
      state.regEmail = typedEmail;
      const next = goToFamilyPhoneOrConfirm(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    const again = emailOptPrompt(lang);
    return again;
  }

  if (state.step === "awaiting_register_email") {
    if (isNegative(text)) {
      delete state.regEmail;
      const next = goToFamilyPhoneOrConfirm(state, patientPhone, lang);
      await saveState(convId, state);
      return next;
    }
    const email = parseRegisterEmail(text);
    if (!email) return { reply: BotPrompts.askRegisterEmail(lang) };
    state.regEmail = email;
    const next = goToFamilyPhoneOrConfirm(state, patientPhone, lang);
    await saveState(convId, state);
    return next;
  }

  if (state.step === "awaiting_register_name") {
    const name = text.trim();
    if (name.length < 2 || /^(yes|no|help|book|register|male|female|others?)$/i.test(name)) {
      return {
        reply: state.registeringFamily
          ? BotPrompts.askRegisterFamilyName(lang)
          : BotPrompts.askRegisterName(lang),
      };
    }
    state.regName = name;
    if (state.registeringFamily) {
      state.step = "awaiting_register_relationship";
      await saveState(convId, state);
      return withRelationshipButtons(
        BotPrompts.askRegisterFamilyRelationship(lang),
        lang,
      );
    }
    if (!state.regDob?.trim()) {
      state.step = "awaiting_register_dob";
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterDob(lang) };
    }
    state.step = "awaiting_register_gender";
    await saveState(convId, state);
    return withGenderButtons(BotPrompts.askRegisterGender(lang));
  }

  if (state.step === "awaiting_register_relationship") {
    const rel = parseRelationshipChoice(text);
    if (!rel) {
      return withRelationshipButtons(
        BotPrompts.askRegisterFamilyRelationship(lang),
        lang,
      );
    }
    state.regRelationship = rel;
    state.step = "awaiting_register_family_details";
    await saveState(convId, state);
    return { reply: BotPrompts.askRegisterFamilyDobAndId(lang) };
  }

  if (state.step === "awaiting_register_family_details") {
    const parsed = parseFamilyDobAndId(text);
    if (parsed.dob) state.regDob = parsed.dob;
    if (parsed.nationalId) state.regNationalId = parsed.nationalId;
    if (!state.regDob?.trim() && !state.regNationalId?.trim()) {
      return { reply: BotPrompts.askRegisterFamilyDobAndId(lang) };
    }
    if (!state.regDob?.trim()) {
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterFamilyDobOnly(lang) };
    }
    if (!state.regNationalId?.trim()) {
      await saveState(convId, state);
      return { reply: BotPrompts.askRegisterFamilyIdOnly(lang) };
    }
    if (!state.regGender) {
      state.step = "awaiting_register_gender";
      await saveState(convId, state);
      return withGenderButtons(BotPrompts.askRegisterFamilyGender(lang));
    }
    return confirmFamilyMember(convId, practice, state, patientPhone);
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

  if (state.step === "awaiting_book_whom") {
    const raw = text.trim();
    const isSelf =
      /^(whom:self|self|myself|me|you|अपने|खुद|स्वयं)$/i.test(raw) ||
      /^self\b/i.test(raw);
    const isFamily =
      /^(whom:family|family|dependent|dependant|परिवार|आश्रित)$/i.test(raw) ||
      /family\s*member/i.test(raw) ||
      /dependent/i.test(raw);

    const choices = state.patientChoices ?? [];
    const selfChoice = choices.find((c) => c.isSelf) ?? null;
    const familyChoices = choices.filter((c) => !c.isSelf);
    const nextSlots = state.pendingBookSlots ?? {};

    if (!isSelf && !isFamily) {
      const selfName = selfChoice
        ? selfChoice.label.replace(/^Self\s*[·.\-:]+\s*/i, "").trim() || null
        : null;
      return withWhomButtons(
        BotPrompts.askBookWhom(selfName, lang),
        selfName,
        lang,
      );
    }

    if (isSelf) {
      if (!selfChoice) {
        return startSelfRegisterForBook(convId, nextSlots, state);
      }
      const bookReply = await startBookFlow(convId, practice, nextSlots, {
        ...state,
        bookPatientId: selfChoice.id,
        bookPatientName: selfChoice.label
          .replace(/^Self\s*[·.\-:]+\s*/i, "")
          .trim(),
        patientChoices: undefined,
        pendingBookSlots: undefined,
        step: "idle",
      });
      const name = selfChoice.label.replace(/^Self\s*[·.\-:]+\s*/i, "").trim();
      return {
        reply:
          BotPrompts.bookPatientSelected(name || "you", true, lang) +
          "\n\n" +
          bookReply.reply,
        doctorList: bookReply.doctorList,
        replyButtons: bookReply.replyButtons,
        dateList: bookReply.dateList,
        slotList: bookReply.slotList,
        bookingList: bookReply.bookingList,
        patientList: bookReply.patientList,
        specialtyList: bookReply.specialtyList,
        menuList: bookReply.menuList,
      };
    }

    // Family member / dependent
    if (!familyChoices.length) {
      return startFamilyRegisterForBook(convId, nextSlots, state);
    }
    if (familyChoices.length === 1) {
      const only = familyChoices[0]!;
      const bookReply = await startBookFlow(convId, practice, nextSlots, {
        ...state,
        bookPatientId: only.id,
        bookPatientName: only.label,
        patientChoices: undefined,
        pendingBookSlots: undefined,
        step: "idle",
      });
      return {
        reply:
          BotPrompts.bookPatientSelected(only.label, false, lang) +
          "\n\n" +
          bookReply.reply,
        doctorList: bookReply.doctorList,
        replyButtons: bookReply.replyButtons,
        dateList: bookReply.dateList,
        slotList: bookReply.slotList,
        bookingList: bookReply.bookingList,
        patientList: bookReply.patientList,
        specialtyList: bookReply.specialtyList,
        menuList: bookReply.menuList,
      };
    }

    await saveState(convId, {
      ...keepPrefs(state),
      step: "awaiting_book_patient",
      patientChoices: familyChoices,
      pendingBookSlots: nextSlots,
      bookPatientId: undefined,
      bookPatientName: undefined,
    });
    return withPatientPicker(
      BotPrompts.askBookFamilyPick(
        familyChoices.map((c, i) => ({ index: i + 1, label: c.label })),
        lang,
      ),
      familyChoices.map((c) => ({
        label: c.label,
        description: "Family member",
      })),
    );
  }

  if (state.step === "awaiting_book_patient") {
    const choices = state.patientChoices ?? [];
    let choice =
      (() => {
        const idx = parseSlotChoiceIndex(text);
        return idx !== null && idx >= 1 && idx <= choices.length
          ? choices[idx - 1]
          : null;
      })() ?? null;
    // Allow typing the profile name ("Priya" / "you")
    if (!choice) {
      const raw = text.trim().toLowerCase().replace(/^you\s*[·.\-:]+\s*/i, "");
      if (/^(you|myself|me|self|अपने|खुद)$/i.test(text.trim())) {
        choice = choices.find((c) => c.isSelf) ?? null;
      } else if (raw.length >= 2) {
        choice =
          choices.find((c) => c.label.toLowerCase().includes(raw)) ??
          choices.find((c) =>
            c.label
              .toLowerCase()
              .replace(/^you\s*[·.\-:]+\s*/i, "")
              .includes(raw),
          ) ??
          null;
      }
    }
    if (!choice) {
      return withPatientPicker(
        BotPrompts.askBookPatientPick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        choices.map((c) => ({
          label: c.label,
          description: c.isSelf ? "Yourself" : "Family member",
        })),
      );
    }
    const picked = await prisma.user.findUnique({
      where: { id: choice.id },
      select: { id: true, name: true },
    });
    if (!picked) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.askBookPatientPick([], lang) };
    }
    const name = (picked.name || choice.label).trim();
    const isSelf = Boolean(choice.isSelf);
    const nextSlots = state.pendingBookSlots ?? {};
    const bookReply = await startBookFlow(convId, practice, nextSlots, {
      ...state,
      bookPatientId: picked.id,
      bookPatientName: name,
      patientChoices: undefined,
      pendingBookSlots: undefined,
      step: "idle",
    });
    return {
      reply:
        BotPrompts.bookPatientSelected(name, isSelf, lang) +
        "\n\n" +
        bookReply.reply,
      doctorList: bookReply.doctorList,
      replyButtons: bookReply.replyButtons,
      dateList: bookReply.dateList,
      slotList: bookReply.slotList,
      bookingList: bookReply.bookingList,
      patientList: bookReply.patientList,
      specialtyList: bookReply.specialtyList,
      menuList: bookReply.menuList,
    };
  }

  if (state.step === "awaiting_specialty") {
    const choices =
      state.specialtyChoices ??
      buildSpecialtyChoices(
        state.providerChoices ?? (await loadProviders(practice.id)),
      ).map((label) => ({ id: label, label }));
    const picked = pickSpecialty(choices, text);
    if (!picked) {
      const labels = choices.map((c) => c.label);
      return withSpecialtyList(
        BotPrompts.askSpecialty(
          labels.map((label, i) => ({ index: i + 1, label })),
          lang,
        ),
        labels,
      );
    }
    return continueAfterSpecialty(convId, practice, state, picked.label);
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

  const escalate = async () => transferToAgent(convId, practice, state, lang);

  if (looksClinical(text) || wantsHuman(text) || nlu.intent === "human") {
    return escalate();
  }

  if (nlu.intent === "message_doctor") {
    return startMessageDoctorFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
  }

  // Active booking + idle free text → offer reschedule / cancel / new / message doctor
  if (
    (!state.step || state.step === "idle") &&
    !state.postBookingCare &&
    nlu.intent !== "faq" &&
    nlu.intent !== "book" &&
    nlu.intent !== "cancel" &&
    nlu.intent !== "reschedule" &&
    nlu.intent !== "status" &&
    nlu.intent !== "doctors" &&
    nlu.intent !== "register" &&
    nlu.intent !== "report" &&
    nlu.intent !== "my_docs" &&
    !(
      nlu.slots.date ||
      nlu.slots.preferredHour != null ||
      nlu.slots.preferredPeriod
    )
  ) {
    const upcoming = await listUpcomingBookings(practice.id, patientPhone);
    if (upcoming.length) {
      state = {
        ...idleState(state),
        failedTurns: 0,
        postBookingCare: false,
        handedOff: false,
      };
      await saveState(convId, state);
      await prisma.whatsAppConversation.update({
        where: { id: convId },
        data: { status: "bot_active", state },
      });
      return withPostBookingMenu(
        BotPrompts.postBookingAsk(
          practice.name,
          postBookingVisitLines(upcoming),
          lang,
        ),
      );
    }
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
    if (!wantsFullMainMenu(text)) {
      const withBooking = await replyWithPostBookingMenu({
        practice,
        patientPhone,
        lang,
      });
      if (withBooking) return withBooking;
    }
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(BotPrompts.help(practice.name, greetingPatientName(patient), lang));
  }

  // Doctors list (available anytime — does not clear in-progress booking)
  if (nlu.intent === "doctors") {
    const providers = await loadProviders(practice.id);
    return withMainMenu(
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
    );
  }

  // Confirm / change / cancel
  if (state.step === "awaiting_confirm") {
    const raw = text.trim();
    const isConfirm =
      nlu.intent === "confirm_yes" ||
      /^(yes|y|confirm|ok|confirm:yes|हाँ|हां|जी)$/i.test(raw) ||
      /confirm\s*booking/i.test(raw);
    const isChange =
      /^confirm:change$/i.test(raw) ||
      /^(change|edit|modify|update)$/i.test(raw) ||
      /change\s*details/i.test(raw) ||
      /विवरण\s*बदल/i.test(raw);
    const isCancel =
      nlu.intent === "confirm_no" ||
      /^confirm:cancel$/i.test(raw) ||
      /^(no|n|cancel|stop|abort)$/i.test(raw) ||
      /रद्द/i.test(raw);

    if (isConfirm) {
      return confirmBooking(convId, practice, state, patientPhone);
    }
    if (isChange) {
      const bookReply = await startBookFlow(convId, practice, {}, {
        ...keepPrefs(state),
        bookPatientId: state.bookPatientId,
        bookPatientName: state.bookPatientName,
      });
      return {
        reply: BotPrompts.changeBookingDetails(lang) + "\n\n" + bookReply.reply,
        doctorList: bookReply.doctorList,
        replyButtons: bookReply.replyButtons,
        dateList: bookReply.dateList,
        slotList: bookReply.slotList,
        bookingList: bookReply.bookingList,
        patientList: bookReply.patientList,
        specialtyList: bookReply.specialtyList,
        menuList: bookReply.menuList,
      };
    }
    if (isCancel) {
      await saveState(convId, idleState(state));
      return withMainMenu(BotPrompts.bookingFlowCanceled(lang));
    }
    return withBookingConfirmButtons(
      state.pendingSummary?.trim()
        ? BotPrompts.askConfirm(state.pendingSummary, lang)
        : BotPrompts.askConfirm("this appointment", lang),
      lang,
    );
  }

  if (state.step === "awaiting_cancel_reason") {
    const bookingId = state.cancelBookingId;
    if (!bookingId) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.noBookingSelected(lang) };
    }
    const parsed = parseCancelReason(text);
    if (parsed.kind === "abort") {
      await saveState(convId, idleState(state));
      return withMainMenu(BotPrompts.keptBooking(lang));
    }
    return finishWhatsAppCancel({
      convId,
      practice,
      patientPhone,
      state,
      bookingId,
      reason: parsed.reason,
      lang,
    });
  }

  // After picking a booking — final confirm before reason / cancel
  if (state.step === "awaiting_cancel_confirm") {
    const bookingId = state.cancelBookingId;
    const label = state.pendingSummary || "this booking";
    if (!bookingId) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.noBookingSelected(lang) };
    }
    const raw = text.trim();
    if (
      nlu.intent === "confirm_yes" ||
      /^(yes|y|confirm|ok|cancel:yes|हाँ|हां|जी)$/i.test(raw) ||
      /confirm\s*cancel/i.test(raw)
    ) {
      await saveState(convId, {
        ...state,
        step: "awaiting_cancel_reason",
        failedTurns: 0,
      });
      return { reply: BotPrompts.askCancelReason(label, lang) };
    }
    if (
      nlu.intent === "confirm_no" ||
      /^(no|n|nope|keep|stop|nevermind|never mind|abort|back|cancel:no|नहीं)$/i.test(
        raw,
      ) ||
      /keep\s*booking/i.test(raw)
    ) {
      await saveState(convId, idleState(state));
      const withBooking = await replyWithPostBookingMenu({
        practice,
        patientPhone,
        lang,
      });
      if (withBooking) {
        return {
          ...withBooking,
          reply: `${BotPrompts.keptBooking(lang)}\n\n${withBooking.reply}`,
        };
      }
      return withMainMenu(BotPrompts.keptBooking(lang));
    }
    return withCancelConfirmButtons(BotPrompts.askCancelConfirm(label, lang), lang);
  }

  if (state.step === "awaiting_cancel_booking") {
    const choices = state.bookingChoices ?? [];

    const idx = parseSlotChoiceIndex(text);
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : state.cancelBookingId
          ? choices.find((c) => c.id === state.cancelBookingId) ?? null
          : null;

    if (!choice && choices.length) {
      return withBookingPicker(
        BotPrompts.askCancelPick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        choices.map((c) => {
          const [title, ...rest] = c.label.split(" · ");
          return {
            label: (title || c.label).slice(0, 24),
            description: rest.join(" · ").slice(0, 72) || undefined,
          };
        }),
        { forceList: true },
      );
    }

    const bookingId = choice?.id || state.cancelBookingId;
    if (!bookingId) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.noBookingSelected(lang) };
    }

    const label = choice?.label || state.pendingSummary || "this booking";
    await saveState(convId, {
      ...state,
      step: "awaiting_cancel_confirm",
      cancelBookingId: bookingId,
      pendingSummary: label,
      failedTurns: 0,
    });
    return withCancelConfirmButtons(BotPrompts.askCancelConfirm(label, lang), lang);
  }

  // Later report attach — pick which visit first
  if (state.step === "awaiting_report_booking") {
    const choices = state.bookingChoices ?? [];
    const idx = parseSlotChoiceIndex(text);
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;

    if (!choice && choices.length) {
      return withBookingPicker(
        BotPrompts.askReportPick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        choices.map((c) => {
          const [title, ...rest] = c.label.split(" · ");
          return {
            label: (title || c.label).slice(0, 24),
            description: rest.join(" · ").slice(0, 72) || undefined,
          };
        }),
        { forceList: true },
      );
    }

    if (!choice) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.noBookingSelected(lang) };
    }

    // Branch F: file already uploaded — attach to the chosen visit.
    if (state.pendingDoc?.url) {
      return finishBranchFBookingDocument(
        convId,
        practice,
        state,
        patientPhone,
        choice.id,
        lang,
      );
    }

    await saveState(convId, {
      ...keepPrefs(state),
      step: "awaiting_document_upload",
      lastBookingId: choice.id,
      bookingChoices: undefined,
      pendingSummary: choice.label,
      pendingDoc: null,
      failedTurns: 0,
      postBookingCare: false,
      handedOff: false,
    });
    return { reply: BotPrompts.askAttachDocumentUpload(lang) };
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
      return withDateButtons(
        BotPrompts.doctorSelectedAskDate(picked.name, suggested, lang),
        suggested,
      );
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
    state.step = "awaiting_confirm";
    return presentBookingConfirm(convId, practice, state, {
      date: state.date!,
      slotStart: choice.start,
      timeLabel: choice.label,
    });
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
        choices.map((c) => {
          const [title, ...rest] = c.label.split(" · ");
          return {
            label: (title || c.label).slice(0, 24),
            description: rest.join(" · ").slice(0, 72) || undefined,
          };
        }),
        { forceList: true },
      );
    }
    return beginRescheduleForBooking({
      convId,
      practice,
      patientPhone,
      state,
      bookingId: choice.id,
      label: choice.label,
      lang,
    });
  }

  if (state.step === "awaiting_manage_booking") {
    const choices = state.bookingChoices ?? [];
    const idx = parseSlotChoiceIndex(text);
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice) {
      return withBookingPicker(
        BotPrompts.askManageBookingsPick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        choices.map((c) => {
          const [title, ...rest] = c.label.split(" · ");
          return {
            label: (title || c.label).slice(0, 24),
            description: rest.join(" · ").slice(0, 72) || undefined,
          };
        }),
        { forceList: true },
      );
    }
    return presentManageActions({
      convId,
      state,
      bookingId: choice.id,
      label: choice.label,
      lang,
    });
  }

  if (state.step === "awaiting_manage_action") {
    const bookingId = state.cancelBookingId || state.rescheduleBookingId;
    const label = state.pendingSummary || "this booking";
    if (!bookingId) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.noBookingSelected(lang) };
    }
    const raw = text.trim();
    const isReschedule =
      /^manage:reschedule$/i.test(raw) ||
      /^(reschedule|change\s*time|postpone)$/i.test(raw) ||
      /रीशेड्यूल|समय\s*बदल/i.test(raw);
    const isCancel =
      /^manage:cancel$/i.test(raw) ||
      /^(cancel|cancel\s*booking)$/i.test(raw) ||
      /रद्द/i.test(raw);
    const isBack =
      /^manage:back$/i.test(raw) ||
      /^(back|menu|status)$/i.test(raw);

    if (isBack) {
      return startManageBookingsFlow({
        convId,
        practice,
        patientPhone,
        state,
        lang,
      });
    }
    if (isReschedule) {
      return beginRescheduleForBooking({
        convId,
        practice,
        patientPhone,
        state,
        bookingId,
        label,
        lang,
      });
    }
    if (isCancel) {
      await saveState(convId, {
        ...keepPrefs(state),
        step: "awaiting_cancel_confirm",
        cancelBookingId: bookingId,
        rescheduleBookingId: undefined,
        pendingSummary: label,
        failedTurns: 0,
      });
      return withCancelConfirmButtons(
        BotPrompts.askCancelConfirm(label, lang),
        lang,
      );
    }
    return withManageActionButtons(BotPrompts.askManageAction(label, lang), lang);
  }

  if (state.step === "awaiting_message_doctor_booking") {
    const choices = state.bookingChoices ?? [];
    const idx = parseSlotChoiceIndex(text);
    const choice =
      idx !== null && idx >= 1 && idx <= choices.length
        ? choices[idx - 1]
        : null;
    if (!choice) {
      return withBookingPicker(
        BotPrompts.askMessageDoctorPick(
          choices.map((c, i) => ({ index: i + 1, label: c.label })),
          lang,
        ),
        choices.map((c) => {
          const [title, ...rest] = c.label.split(" · ");
          return {
            label: (title || c.label).slice(0, 24),
            description: rest.join(" · ").slice(0, 72) || undefined,
          };
        }),
        { forceList: true },
      );
    }
    const booking = await prisma.practiceBooking.findUnique({
      where: { id: choice.id },
    });
    if (!booking) {
      await saveState(convId, idleState(state));
      return { reply: BotPrompts.bookingNotFound(lang) };
    }
    const provider = await prisma.user.findUnique({
      where: { id: booking.providerId },
      select: { id: true, name: true },
    });
    return enterMessageDoctorCare({
      convId,
      state,
      lang,
      booking: {
        ...booking,
        provider: provider ? { name: provider.name } : null,
      },
    });
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
      return rescheduleSuccessReply(updated, lang);
    } catch (err) {
      await saveState(convId, idleState(state));
      return {
        reply: err instanceof Error ? err.message : "Could not reschedule.",
      };
    }
  }

  // NLU freeform book confirmation (Did you mean…?)
  if (state.step === "awaiting_nlu_book_confirm") {
    const raw = text.trim();
    const yes =
      /^(nlu:yes|yes|y|confirm|ok|हाँ|हां|जी)$/i.test(raw) ||
      nlu.intent === "confirm_yes";
    const no =
      /^(nlu:no|no|n|nope|cancel|menu|main)$/i.test(raw) ||
      nlu.intent === "confirm_no";
    if (yes) {
      const slots = state.pendingBookSlots ?? {};
      return ensureRegisteredThenBook(
        convId,
        practice,
        patientPhone,
        slots,
        applyTimePreferenceFromSlots(idleState(state), slots),
      );
    }
    if (no) {
      const cleared = idleState(state);
      await saveState(convId, cleared);
      const patient = await PatientService.findByPhone(patientPhone);
      return withMainMenu(
        BotPrompts.help(practice.name, greetingPatientName(patient), lang),
      );
    }
    return withYesNo(
      BotPrompts.nluBookConfirm(
        state.pendingSummary ||
          formatNluBookConfirmSummary(state.pendingBookSlots ?? {}),
        lang,
      ),
    );
  }

  // Top-level intents
  if (nlu.intent === "register") {
    return startRegisterFlow(convId, patientPhone, state);
  }

  if (nlu.intent === "book") {
    if (shouldConfirmNluBook(text, nlu.slots)) {
      const summary = formatNluBookConfirmSummary(nlu.slots);
      await saveState(convId, {
        ...idleState(state),
        step: "awaiting_nlu_book_confirm",
        pendingBookSlots: nlu.slots,
        pendingSummary: summary,
        failedTurns: 0,
      });
      return withYesNo(BotPrompts.nluBookConfirm(summary, lang));
    }
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
      const slots = {
        ...nlu.slots,
        ...spoken,
      };
      const withPrefs = applyTimePreferenceFromSlots(state, slots, text);
      if (shouldConfirmNluBook(text, slots)) {
        const summary = formatNluBookConfirmSummary(slots);
        await saveState(convId, {
          ...idleState(withPrefs),
          step: "awaiting_nlu_book_confirm",
          pendingBookSlots: slots,
          pendingSummary: summary,
          failedTurns: 0,
        });
        return withYesNo(BotPrompts.nluBookConfirm(summary, lang));
      }
      return ensureRegisteredThenBook(
        convId,
        practice,
        patientPhone,
        slots,
        withPrefs,
      );
    }
  }

  if (nlu.intent === "status") {
    return startManageBookingsFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
  }

  if (nlu.intent === "report") {
    return startReportAttachFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
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
    return startCancelFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
  }

  if (nlu.intent === "reschedule") {
    return startRescheduleFlow({
      convId,
      practice,
      patientPhone,
      state,
      lang,
    });
  }

  if (nlu.intent === "help") {
    if (!wantsFullMainMenu(text)) {
      const withBooking = await replyWithPostBookingMenu({
        practice,
        patientPhone,
        lang,
      });
      if (withBooking) return withBooking;
    }
    const patient = await PatientService.findByPhone(patientPhone);
    return withMainMenu(BotPrompts.help(practice.name, greetingPatientName(patient), lang));
  }

  const fails = (state.failedTurns ?? 0) + 1;
  if (fails >= 2) {
    return transferToAgent(convId, practice, state, lang);
  }
  await saveState(convId, { ...state, failedTurns: fails });
  {
    const upcoming = await listUpcomingBookings(practice.id, patientPhone);
    if (upcoming.length && (!state.step || state.step === "idle")) {
      return withPostBookingMenu(
        BotPrompts.postBookingAsk(
          practice.name,
          postBookingVisitLines(upcoming),
          lang,
        ),
      );
    }
  }
  return withMainMenu(BotPrompts.fallback(lang));
}

export { normalizePhone };
