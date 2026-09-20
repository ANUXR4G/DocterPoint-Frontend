import { llmChatProviders } from "../../lib/llm.js";
import { formatLocalDate, parseLocalDate, startOfLocalDay } from "./slotEngine.js";

export type BotIntent =
  | "book"
  | "status"
  | "cancel"
  | "reschedule"
  | "register"
  | "doctors"
  | "help"
  | "faq"
  | "human"
  | "report"
  | "my_docs"
  | "confirm_yes"
  | "confirm_no"
  | "unknown";

export type NluSlots = {
  date?: string; // YYYY-MM-DD
  providerName?: string;
  providerIndex?: number;
  mode?: "TIME_BASED" | "TOKEN_BASED";
  slotIndex?: number;
  rawDateText?: string;
  /** Spoken / typed clock time, e.g. "10:30 am", "3 pm" */
  timeText?: string;
  preferredHour?: number; // 0-23
  preferredMinute?: number; // 0-59
  /** Coarse period when no clock time was given */
  preferredPeriod?: "morning" | "afternoon" | "evening" | "night";
  name?: string;
  gender?: string;
  email?: string;
};

export type NluResult = {
  intent: BotIntent;
  slots: NluSlots;
  source: "llm" | "regex";
};

const INTENTS: BotIntent[] = [
  "book",
  "status",
  "cancel",
  "reschedule",
  "register",
  "doctors",
  "help",
  "faq",
  "human",
  "report",
  "my_docs",
  "confirm_yes",
  "confirm_no",
  "unknown",
];

export type ParsedPatientDate =
  | { ok: true; date: string }
  | { ok: false; reason: "invalid" | "past" | "far" };

function isValidCalendarYmd(y: number, m: number, d: number): boolean {
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return (
    dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
  );
}

function ymdString(y: number, m: number, d: number): string | undefined {
  if (!isValidCalendarYmd(y, m, d)) return undefined;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** India-first: prefer DD-MM-YYYY when both parts are ≤ 12. */
function resolveDayMonth(a: number, b: number): { day: number; month: number } {
  if (a > 12 && b >= 1 && b <= 12) return { day: a, month: b };
  if (b > 12 && a >= 1 && a <= 12) return { day: b, month: a };
  return { day: a, month: b }; // DD-MM
}

/**
 * Parse a patient-typed appointment date.
 * Accepts TODAY/TOMORROW (any case), DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD.
 */
export function parsePatientDate(
  text: string,
  now: Date = new Date(),
): ParsedPatientDate {
  const raw = text.trim();
  if (!raw) return { ok: false, reason: "invalid" };
  const t = raw.toLowerCase().replace(/\s+/g, " ");

  const today = startOfLocalDay(now);
  let candidate: string | undefined;

  // Relative words may appear inside free speech / voice notes
  if (/\b(today|todays|aaj)\b/i.test(t) || /आज/.test(raw)) {
    candidate = formatLocalDate(today);
  } else if (
    /\b(tomorrow|tomm?orrow|tmrw|kal)\b/i.test(t) ||
    /कल/.test(raw)
  ) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    candidate = formatLocalDate(d);
  } else if (
    /\b(day after(?: tomorrow)?|parso)\b/i.test(t) ||
    /परसों/.test(raw)
  ) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    candidate = formatLocalDate(d);
  } else {
    const iso = t.match(/\b((?:19|20|21)\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (iso) {
      candidate = ymdString(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    } else {
      const numbered = t.match(
        /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.]((?:19|20|21)\d{2})\b/,
      );
      if (numbered) {
        const a = Number(numbered[1]);
        const b = Number(numbered[2]);
        const y = Number(numbered[3]);
        const { day, month } = resolveDayMonth(a, b);
        candidate = ymdString(y, month, day);
      }
    }
  }

  if (!candidate) return { ok: false, reason: "invalid" };

  const parsed = parseLocalDate(candidate);
  const max = new Date(today);
  max.setDate(max.getDate() + 180);

  if (parsed.getTime() < today.getTime()) {
    return { ok: false, reason: "past" };
  }
  if (parsed.getTime() > max.getTime()) {
    return { ok: false, reason: "far" };
  }
  return { ok: true, date: candidate };
}

function normalizeDateText(text: string): string | undefined {
  const parsed = parsePatientDate(text);
  return parsed.ok ? parsed.date : undefined;
}

/**
 * Pull clock time or day-part from free speech / voice transcripts.
 * Examples: "10 am", "10:30pm", "at 3", "morning", "shaam", "subah".
 */
export function parseSpokenTime(text: string): {
  timeText?: string;
  preferredHour?: number;
  preferredMinute?: number;
  preferredPeriod?: "morning" | "afternoon" | "evening" | "night";
} {
  const raw = text.trim();
  if (!raw) return {};
  const t = raw.toLowerCase().replace(/\s+/g, " ");

  // Clock before day-part so "morning at 10 am" keeps the clock time
  const clockPatterns = [
    // Prefer explicit am/pm
    /\b(?:at\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/i,
    // "at 3" / "at 15"
    /\bat\s+(\d{1,2})(?:[:.](\d{2}))?\b/i,
    // "10:30" with minutes (avoid bare day numbers from dates)
    /\b(\d{1,2})[:.](\d{2})\b/,
  ];

  for (const re of clockPatterns) {
    const clock = re.exec(t);
    if (!clock) continue;
    // Skip digits that are part of a calendar date (17-03-2026 / 17/03/2026)
    const after = t.slice(clock.index! + clock[0]!.length);
    if (/^[\/\-.](\d{1,2})([\/\-.]|$)/.test(after)) continue;
    const before = t.slice(0, clock.index!);
    if (/(\d{1,2}|20\d{2})[\/\-.]\s*$/.test(before)) continue;

    let hour = Number(clock[1]);
    const minute = clock[2] ? Number(clock[2]) : 0;
    const mer = (clock[3] || "").replace(/\./g, "").replace(/\s/g, "").toLowerCase();
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) continue;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) continue;
    if (mer === "pm" && hour < 12) hour += 12;
    if (mer === "am" && hour === 12) hour = 0;
    // Bare "at 3" in clinic speech usually means 3 PM
    if (!mer && hour >= 1 && hour <= 6) hour += 12;
    if (hour > 23) continue;
    return {
      preferredHour: hour,
      preferredMinute: minute,
      timeText: clock[0]!.trim(),
    };
  }

  if (
    /\b(morning|subah|subah\s*ko|सुबह)\b/i.test(t) ||
    t === "सुबह"
  ) {
    return { preferredPeriod: "morning", timeText: "morning" };
  }
  if (
    /\b(afternoon|dopahar|dophar|दोपहर)\b/i.test(t) ||
    t === "दोपहर"
  ) {
    return { preferredPeriod: "afternoon", timeText: "afternoon" };
  }
  if (
    /\b(evening|shaam|sham|शाम)\b/i.test(t) ||
    t === "शाम"
  ) {
    return { preferredPeriod: "evening", timeText: "evening" };
  }
  if (/\b(night|raat|रात)\b/i.test(t) || t === "रात") {
    return { preferredPeriod: "night", timeText: "night" };
  }

  return {};
}

/** Merge spoken time fields into slots (regex or LLM). */
export function applySpokenTimeSlots(
  slots: NluSlots,
  text: string,
): NluSlots {
  const spoken = parseSpokenTime(text);
  return {
    ...slots,
    ...(spoken.timeText && !slots.timeText
      ? { timeText: spoken.timeText }
      : {}),
    ...(spoken.preferredHour != null && slots.preferredHour == null
      ? {
          preferredHour: spoken.preferredHour,
          preferredMinute: spoken.preferredMinute ?? 0,
        }
      : {}),
    ...(spoken.preferredPeriod && !slots.preferredPeriod
      ? { preferredPeriod: spoken.preferredPeriod }
      : {}),
  };
}

/**
 * True when STT produced noise / near-empty text — ask the patient to repeat.
 */
export function isUnclearVoiceTranscript(text: string): boolean {
  const t = text
    .trim()
    .replace(/[.…,!?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return true;
  if (t.length < 2) return true;
  // Whisper sometimes returns punctuation-only or filler
  if (/^(uh+|um+|ah+|hmm+|mm+|haan+|ha+|ok+|okay+)$/i.test(t)) return true;
  const letters = (t.match(/[\p{L}\p{N}]/gu) || []).length;
  if (letters < 2) return true;
  return false;
}

/**
 * Pick the best open slot for a preferred clock time or day-part.
 * Returns 0-based index into `open`, or null.
 */
export function matchPreferredSlotIndex(
  open: Array<{ start: Date }>,
  slots: Pick<
    NluSlots,
    "preferredHour" | "preferredMinute" | "preferredPeriod" | "timeText"
  >,
): number | null {
  if (!open.length) return null;

  if (slots.preferredHour != null) {
    const targetMin =
      slots.preferredHour * 60 + (slots.preferredMinute ?? 0);
    let bestIdx = 0;
    let bestDist = Infinity;
    open.forEach((s, i) => {
      const mins = s.start.getHours() * 60 + s.start.getMinutes();
      const dist = Math.abs(mins - targetMin);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    // Accept within ~75 minutes of the spoken time
    return bestDist <= 75 ? bestIdx : null;
  }

  const period = slots.preferredPeriod;
  if (!period) return null;
  const ranges: Record<string, [number, number]> = {
    morning: [6, 11],
    afternoon: [12, 16],
    evening: [17, 20],
    night: [21, 23],
  };
  const [lo, hi] = ranges[period] ?? [0, 23];
  const inRange = open
    .map((s, i) => ({ i, h: s.start.getHours() }))
    .filter((x) => x.h >= lo && x.h <= hi);
  if (!inRange.length) return null;
  return inRange[0]!.i;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const prev = new Array<number>(cols);
  const cur = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;
  for (let i = 1; i < rows; i++) {
    cur[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j < cols; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j < cols; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** Canonical command words + common misspellings for single-token messages. */
const COMMAND_WORDS: Array<{ intent: BotIntent; words: string[] }> = [
  {
    intent: "doctors",
    words: [
      "doctor",
      "doctors",
      "docter",
      "docters",
      "docotor",
      "docotors",
      "docotr",
      "docotrs",
      "doktor",
      "doktors",
      "provider",
      "providers",
      "drs",
    ],
  },
  {
    intent: "register",
    words: [
      "register",
      "registar",
      "regster",
      "regitser",
      "reigster",
      "signup",
      "sign-up",
      "enroll",
      "enrol",
    ],
  },
  {
    intent: "book",
    words: ["book", "booking", "bok", "boook", "appointment", "appoinment"],
  },
  {
    intent: "status",
    words: ["status", "statues", "stauts", "stattus", "upcoming"],
  },
  {
    intent: "cancel",
    words: ["cancel", "cancle", "cancell", "cnacel"],
  },
  {
    intent: "reschedule",
    words: ["reschedule", "reshedule", "reschedual", "reschdule", "reshdule"],
  },
  {
    intent: "help",
    words: ["help", "helpp", "menu", "hepl", "hlep"],
  },
  {
    intent: "report",
    words: ["report", "reports", "repot", "reprot"],
  },
  {
    intent: "my_docs",
    words: ["mydocs", "mydoc", "documents", "document"],
  },
];

/**
 * Exact single-token menu commands (typed or WhatsApp button title/payload).
 * Used to interrupt mid-flow steps so STATUS/BOOK etc. always work.
 */
export function exactMenuIntent(text: string): BotIntent | null {
  const raw = text
    .trim()
    .toLowerCase()
    .replace(/^[*`~]+|[*`~]+$/g, "")
    .replace(/\s+/g, " ");
  if (!raw || raw.length > 40) return null;
  const t = raw
    .replace(/^(btn_|action_|cmd_|quick_)/i, "")
    .replace(/[\s-]+/g, "_");
  const aliases: Record<string, BotIntent> = {
    status: "status",
    statues: "status",
    stauts: "status",
    stattus: "status",
    upcoming: "status",
    my_status: "status",
    book: "book",
    booking: "book",
    bok: "book",
    appointment: "book",
    cancel: "cancel",
    cancle: "cancel",
    cancell: "cancel",
    reschedule: "reschedule",
    reshedule: "reschedule",
    register: "register",
    signup: "register",
    sign_up: "register",
    doctors: "doctors",
    doctor: "doctors",
    docters: "doctors",
    providers: "doctors",
    help: "help",
    menu: "help",
    faq: "faq",
    info: "faq",
    report: "report",
    reports: "report",
    my_docs: "my_docs",
    mydocs: "my_docs",
    my_doc: "my_docs",
    documents: "my_docs",
  };
  return aliases[t] ?? aliases[raw.replace(/\s+/g, "_")] ?? null;
}

/**
 * Number shortcuts from the HELP / welcome menu (idle only).
 * Do NOT use during doctor/slot/date pick — those use the same digits.
 * 8 = language change (handled by caller, not a BotIntent).
 */
export type MenuShortcut = BotIntent | "language";

export function menuNumberShortcut(text: string): MenuShortcut | null {
  const raw = text
    .trim()
    .replace(/^[*`~_]+|[*`~_]+$/g, "")
    .replace(/[\uFE0F\u20E3]/g, ""); // emoji variation / keycap
  if (!raw) return null;

  // Interactive list row ids from the welcome / HELP menu
  const listPick = /^menu:([a-z_]+)$/i.exec(raw);
  if (listPick) {
    const key = listPick[1]!.toLowerCase();
    const map: Record<string, MenuShortcut> = {
      book: "book",
      doctors: "doctors",
      status: "status",
      register: "register",
      faq: "faq",
      cancel: "cancel",
      reschedule: "reschedule",
      language: "language",
      lang: "language",
      report: "report",
      help: "help",
      menu: "help",
    };
    return map[key] ?? null;
  }

  // "1", "1.", "1)", "1️⃣", "option 1"
  const m = raw.match(/^(?:option\s*)?([1-9])(?:\s*[.)]?)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const map: Record<number, MenuShortcut> = {
    1: "book",
    2: "doctors",
    3: "status",
    4: "register",
    5: "faq",
    6: "cancel",
    7: "reschedule",
    8: "language",
    9: "report",
  };
  return map[n] ?? null;
}

/**
 * Catch typos like DOCTERS → doctors for short command-like messages.
 * Only runs on compact alphabetic tokens (not free-form sentences).
 */
function fuzzyCommandIntent(text: string): BotIntent | null {
  const raw = text.toLowerCase().trim();
  if (!raw) return null;
  const parts = raw.split(/[\s\-_.]+/).filter(Boolean);
  // Commands are 1 token ("DOCTERS") or 2 short ones ("MY DOCS" already regex'd).
  if (parts.length > 2) return null;
  const t = parts.join("").replace(/[^a-z0-9]/g, "");
  if (t.length < 3 || t.length > 16) return null;

  let best: { intent: BotIntent; dist: number; len: number } | null = null;
  for (const cmd of COMMAND_WORDS) {
    for (const word of cmd.words) {
      const w = word.replace(/[^a-z0-9]/g, "");
      if (!w) continue;
      if (t === w) return cmd.intent;
      const dist = levenshtein(t, w);
      const maxDist = w.length <= 5 ? 1 : 2;
      if (dist > maxDist) continue;
      if (
        !best ||
        dist < best.dist ||
        (dist === best.dist && w.length > best.len)
      ) {
        best = { intent: cmd.intent, dist, len: w.length };
      }
    }
  }
  return best?.intent ?? null;
}

function parseIntentRegex(text: string): BotIntent {
  const t = text.toLowerCase().trim();
  if (/^(yes|y|confirm|ok|okay|sure|हाँ|हां|जी)$/i.test(t) || t === "हाँ" || t === "हां")
    return "confirm_yes";
  if (/^(no|n|nope|cancel that|nevermind|never mind|नहीं|ना)$/i.test(t) || t === "नहीं")
    return "confirm_no";
  if (
    /^\bhelp\b|^menu$|^hi$|^hello$|^start$|^नमस्ते$|^हेल्प$/i.test(t) ||
    t === "मदद" ||
    t === "मेनू"
  ) {
    return "help";
  }
  if (
    /^(human|agent|staff)$/i.test(t) ||
    /\b(talk to (a )?(human|person|doctor|receptionist)|real person|human please)\b/.test(
      t,
    ) ||
    /इंसान|स्टाफ|डॉक्टर से बात/.test(text)
  ) {
    return "human";
  }
  if (
    /^(report|reports|send\s*report|attach|lab\s*report|prescription|rx)$/i.test(
      t,
    ) ||
    /\b(send|attach|upload)\s+(a\s+)?(report|document|lab|prescription|pdf)\b/.test(
      t,
    ) ||
    /रिपोर्ट|दस्तावेज भेज|फ़ाइल भेज/.test(text)
  ) {
    return "report";
  }
  if (
    /^(my\s*docs?|list\s*docs?|my\s*documents?|my\s*files?)$/i.test(t) ||
    /मेरे\s*डॉक|मेरी\s*रिपोर्ट|मेरी\s*फ़ाइल/.test(text)
  ) {
    return "my_docs";
  }
  if (
    /^(faq|info)$/i.test(t) ||
    /\b(fee|fees|charge|cost|price|timing|timings|hours|address|parking)\b/.test(
      t,
    ) ||
    /फीस|शुल्क|समय|पता|पार्किंग|जानकारी/.test(text)
  ) {
    return "faq";
  }
  if (
    /\bregister\b|\bsign\s*up\b|\bcreate (an? )?account\b|\bnew patient\b|\benroll\b/.test(
      t,
    ) ||
    /रजिस्टर|पंजीकरण|नया मरीज़/.test(text)
  ) {
    return "register";
  }
  if (
    /^(doctors?|providers?|list|docters?|doktors?)$/i.test(t) ||
    /\b(doctor|provider|docter|doktor)s?\s*list\b/.test(t) ||
    /\blist (the )?(doctors?|providers?|docters?)\b/.test(t) ||
    /\b(show|see|get|view) (me )?(the )?(doctors?|providers?|docters?)\b/.test(
      t,
    ) ||
    /\bwho (are|is) (the )?(doctors?|providers?)\b/.test(t) ||
    /\bavailable doctors?\b/.test(t) ||
    /डॉक्टर|डॉक्टर्स/.test(text)
  ) {
    return "doctors";
  }
  if (
    /reschedule|change (the )?(time|slot|date)|move (my )?appointment/.test(t) ||
    /रीशेड्यूल|समय बदल/.test(text)
  )
    return "reschedule";
  if (/cancel|रद्द/.test(t) || /रद्द/.test(text)) return "cancel";
  if (
    /status|my appointment|my booking|token number|upcoming/.test(t) ||
    /स्थिति|मेरी अपॉइंटमेंट|मेरी बुकिंग|टोकन/.test(text)
  )
    return "status";
  if (
    /book|appointment|slot|token|schedule|visit/.test(t) ||
    /बुक|अपॉइंटमेंट|स्लॉट|टोकन|विज़िट/.test(text)
  )
    return "book";

  const fuzzy = fuzzyCommandIntent(text);
  if (fuzzy) return fuzzy;

  return "unknown";
}

export function parseSlotsRegex(text: string): NluSlots {
  const slots: NluSlots = {};
  const date = normalizeDateText(text);
  if (date) slots.date = date;

  const t = text.toLowerCase();
  if (/\btoken\b/.test(t)) slots.mode = "TOKEN_BASED";
  if (/\btime\b|\bslot\b/.test(t)) slots.mode = "TIME_BASED";
  if (/^(male|m|पुरुष)$/i.test(text.trim()) || text.trim() === "पुरुष")
    slots.gender = "male";
  if (/^(female|f|महिला)$/i.test(text.trim()) || text.trim() === "महिला")
    slots.gender = "female";
  if (/^(others?|o|अन्य)$/i.test(text.trim()) || text.trim() === "अन्य")
    slots.gender = "others";

  const email = text.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/i);
  if (email) slots.email = email[0]!.toLowerCase();

  const num = text.trim().match(/^(\d{1,2})$/);
  if (num) {
    const n = Number(num[1]);
    slots.providerIndex = n;
    slots.slotIndex = n;
  }

  return applySpokenTimeSlots(slots, text);
}

function coerceNlu(raw: unknown): NluResult | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const intent = String(obj.intent ?? "unknown") as BotIntent;
  if (!INTENTS.includes(intent)) return null;
  const slotsIn = (obj.slots ?? {}) as Record<string, unknown>;
  const slots: NluSlots = {};
  if (typeof slotsIn.date === "string") slots.date = slotsIn.date;
  if (typeof slotsIn.providerName === "string") slots.providerName = slotsIn.providerName;
  if (typeof slotsIn.providerIndex === "number") slots.providerIndex = slotsIn.providerIndex;
  if (slotsIn.mode === "TIME_BASED" || slotsIn.mode === "TOKEN_BASED") {
    slots.mode = slotsIn.mode;
  }
  if (typeof slotsIn.slotIndex === "number") slots.slotIndex = slotsIn.slotIndex;
  if (typeof slotsIn.name === "string") slots.name = slotsIn.name;
  if (typeof slotsIn.gender === "string") slots.gender = slotsIn.gender;
  if (typeof slotsIn.email === "string") slots.email = slotsIn.email;
  if (typeof slotsIn.timeText === "string") slots.timeText = slotsIn.timeText;
  if (typeof slotsIn.preferredHour === "number") {
    slots.preferredHour = slotsIn.preferredHour;
  }
  if (typeof slotsIn.preferredMinute === "number") {
    slots.preferredMinute = slotsIn.preferredMinute;
  }
  if (
    slotsIn.preferredPeriod === "morning" ||
    slotsIn.preferredPeriod === "afternoon" ||
    slotsIn.preferredPeriod === "evening" ||
    slotsIn.preferredPeriod === "night"
  ) {
    slots.preferredPeriod = slotsIn.preferredPeriod;
  }
  if (typeof slotsIn.rawDateText === "string") {
    slots.rawDateText = slotsIn.rawDateText;
    if (!slots.date) slots.date = normalizeDateText(slotsIn.rawDateText);
  }
  return { intent, slots, source: "llm" };
}

const NLU_SYSTEM = `You are an NLU parser for a clinic WhatsApp booking bot in India.
Patients may speak or type in English or Hindi (Devanagari or Hinglish) — including messy voice transcripts.
There is NO required message format. Extract EVERY useful slot from a single utterance.
Examples: "book me tomorrow at 10 am with Kabir", "kal shaam wali appointment", "I need status", "mera naam Ravi hai".
Return ONLY compact JSON: {"intent":"...","slots":{...}}
intent must be one of: book,status,cancel,reschedule,register,doctors,help,faq,human,report,my_docs,confirm_yes,confirm_no,unknown
slots may include: date (YYYY-MM-DD), providerName, providerIndex (1-based), mode (TIME_BASED|TOKEN_BASED), slotIndex (1-based), rawDateText, timeText, preferredHour (0-23), preferredMinute (0-59), preferredPeriod (morning|afternoon|evening|night), name, gender (male|female|others), email
Today's date context may be given. Map TODAY/TOMORROW / आज / कल to ISO dates.
If the patient says a clock time ("10 am", "3:30 pm"), set preferredHour/preferredMinute and timeText.
If they only say morning/afternoon/evening/night (or सुबह/दोपहर/शाम/रात), set preferredPeriod.
REGISTER means create a patient account (sign up / new patient / रजिस्टर / पंजीकरण).
DOCTORS means list doctors/providers at the clinic (doctor list / डॉक्टर). Accept misspellings like DOCTERS, DOKORS, DOCATORS.
BOOK means book an appointment (बुक / अपॉइंटमेंट). Accept common typos (BOK, BOOOK, APPOINTMNET). Prefer book when they mention a date/time for a visit.
Prefer a command intent over unknown when the message is clearly a mistyped menu word.`;

/** Keep WhatsApp snappy — abort slow HF/OpenAI NLU and fall back to regex. */
const NLU_LLM_TIMEOUT_MS = 2_500;

async function parseWithChatLlm(
  text: string,
  contextHint: string | undefined,
  opts: {
    label: string;
    url: string;
    apiKey: string;
    model: string;
    jsonObject?: boolean;
  },
): Promise<NluResult | null> {
  const user = contextHint
    ? `Context: ${contextHint}\nPatient message: ${text}`
    : `Patient message: ${text}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NLU_LLM_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model: opts.model,
      temperature: 0,
      messages: [
        { role: "system", content: NLU_SYSTEM },
        { role: "user", content: user },
      ],
    };
    if (opts.jsonObject) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as unknown;
    return coerceNlu(parsed);
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || /aborted/i.test(err.message));
    if (aborted) {
      console.warn(`${opts.label} NLU timed out after ${NLU_LLM_TIMEOUT_MS}ms`);
    } else {
      console.warn(`${opts.label} NLU failed:`, err);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function parseWithLlm(
  text: string,
  contextHint?: string,
): Promise<NluResult | null> {
  // Prefer fast OpenAI for WhatsApp NLU; HF cold-starts are often multi-second.
  const providers = llmChatProviders().slice().sort((a, b) => {
    const rank = (p: { label: string }) =>
      p.label === "OpenAI" ? 0 : p.label === "DeepSeek" ? 1 : 2;
    return rank(a) - rank(b);
  });
  for (const provider of providers) {
    const hit = await parseWithChatLlm(text, contextHint, {
      label: provider.label,
      url: provider.url,
      apiKey: provider.apiKey,
      model: provider.model,
      jsonObject: provider.jsonObject,
    });
    if (hit) return hit;
  }
  return null;
}

/** Regex first for known commands; LLM only for free-form unknown text.
 * Pass useLlm=false for structured steps (slot numbers, YES/NO) to cut latency. */
export async function parseUtterance(
  text: string,
  contextHint?: string,
  opts?: { useLlm?: boolean },
): Promise<NluResult> {
  const regexResult: NluResult = {
    intent: parseIntentRegex(text),
    slots: parseSlotsRegex(text),
    source: "regex",
  };

  const useLlm = opts?.useLlm !== false;
  // HELP / BOOK / YES / etc. — never wait on an LLM round-trip
  if (!useLlm || regexResult.intent !== "unknown") {
    return regexResult;
  }

  const started = Date.now();
  const llm = await parseWithLlm(text, contextHint);
  if (llm) {
    console.log(
      `[WhatsApp NLU] llm=${llm.intent} via LLM in ${Date.now() - started}ms`,
    );
    return {
      ...llm,
      slots: applySpokenTimeSlots(
        { ...regexResult.slots, ...llm.slots },
        text,
      ),
    };
  }

  console.log(`[WhatsApp NLU] llm miss → regex unknown in ${Date.now() - started}ms`);
  return {
    ...regexResult,
    slots: applySpokenTimeSlots(regexResult.slots, text),
  };
}

/** Steps where the reply is a pick-list / yes-no / raw name-date — skip LLM. */
export function stepUsesLlm(step?: string): boolean {
  if (!step || step === "idle") return true;
  const structured = new Set([
    "awaiting_provider",
    "awaiting_mode",
    "awaiting_slot",
    "awaiting_confirm",
    "awaiting_cancel_confirm",
    "awaiting_reschedule_booking",
    "awaiting_reschedule_slot",
    "awaiting_register_name",
    "awaiting_register_gender",
    "awaiting_register_email_opt",
    "awaiting_register_email",
    "awaiting_register_phone_opt",
    "awaiting_register_phone",
    "awaiting_register_confirm",
    "awaiting_date",
  ]);
  return !structured.has(step);
}

/**
 * Voice transcripts are free-form — use LLM unless the step is a simple YES/NO
 * or short chip reply. Always merge regex date/time slots.
 */
export function shouldUseLlmForMessage(
  step: string | undefined,
  text: string,
  fromVoice?: boolean,
): boolean {
  if (!fromVoice) return stepUsesLlm(step);
  const confirmish = new Set([
    "awaiting_confirm",
    "awaiting_cancel_confirm",
    "awaiting_register_confirm",
    "awaiting_register_gender",
    "awaiting_register_email_opt",
    "awaiting_register_phone_opt",
  ]);
  if (step && confirmish.has(step)) return false;
  const t = text.trim();
  if (/^(yes|y|no|n|male|female|others?|today|tomorrow)$/i.test(t)) {
    return false;
  }
  if (/^(date:|slot:|provider:|reg_email_)/i.test(t)) return false;
  // Multi-word speech → LLM; also short but content-rich ("kal 10am")
  if (t.split(/\s+/).length >= 2) return true;
  if (parseSpokenTime(t).preferredHour != null) return true;
  if (parseSpokenTime(t).preferredPeriod) return true;
  return stepUsesLlm(step);
}

export function parseDateOnly(text: string): string | undefined {
  return normalizeDateText(text);
}
