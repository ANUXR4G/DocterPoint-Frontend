/**
 * WhatsApp bot monkey test — unexpected patient replies across all menu options.
 *
 * Usage:
 *   cd backend && npx tsx scripts/wa-monkey-test.ts
 *   cd backend && CLINIC_TO=9990052082 npx tsx scripts/wa-monkey-test.ts
 *
 * Defaults to Ananya demo line 9876543210. Pass CLINIC_TO for another LIVE line
 * (e.g. Priya Nair solo: 9990052082).
 */
import { prisma } from "../src/db/prisma.js";
import { WhatsAppService } from "../src/services/procto/whatsapp.service.js";
import { normalizePhone } from "../src/services/procto/whatsapp.orchestrator.js";

const CLINIC_TO = (process.env.CLINIC_TO || "9876543210").replace(/\D/g, "");
const REGISTERED_FROM = process.env.REGISTERED_FROM || "9999973601"; // seeded Anurag
const FRESH_FROM = process.env.FRESH_FROM || "9990011888"; // unregistered throwaway

type Turn = {
  label: string;
  body: string;
  fromInteractive?: boolean;
};

type Issue = {
  flow: string;
  turn: string;
  severity: "crash" | "empty" | "errorish" | "stuck" | "warn";
  detail: string;
  replyPreview?: string;
  step?: string;
};

const JUNK = [
  "",
  " ",
  "asdfghjkl",
  "🙂🙂🙂",
  "999999",
  "0",
  "99",
  "-1",
  "null",
  "cancel:maybe",
  "menu:zzz",
  "https://evil.example/x",
];

/** Extra chaos payloads for deeper use-case coverage. */
const CHAOS = [
  "नमस्ते",
  "कल सुबह",
  "book tomorrow morning please asap!!!",
  "YES",
  "NO",
  "maybe later",
  "dr kabir",
  "32/13/2099",
  "00/00/0000",
  "slot:0",
  "provider:not-a-uuid",
  "whom:alien",
  "rel:pet",
  "lang:xx",
  "post:reschedule",
  "\u200b\u200bhi",
  "A".repeat(500),
  "💀🔥🤡",
  "SELECT 1; DROP TABLE patients;",
  "<img src=x onerror=alert(1)>",
];

const issues: Issue[] = [];
const transcript: Array<{
  flow: string;
  from: string;
  body: string;
  reply: string;
  step?: string;
}> = [];

function preview(s: string, n = 160): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

function looksErrorish(reply: string): boolean {
  const t = reply.toLowerCase();
  return (
    /\b(uncaught|undefined is not|cannot read|typeerror|internal server|stack trace|prisma\.)\b/i.test(
      t,
    ) || t.includes("[object object]")
  );
}

async function resetConv(from: string) {
  const phone = normalizePhone(from);
  const practice = await WhatsAppService.resolvePracticeByNumber(CLINIC_TO);
  if (!practice) throw new Error("Clinic line not linked");
  await prisma.whatsAppConversation.upsert({
    where: {
      practiceId_patientPhone: { practiceId: practice.id, patientPhone: phone },
    },
    create: {
      practiceId: practice.id,
      patientPhone: phone,
      status: "bot_active",
      state: { preferredLanguage: "en", step: "idle" },
    },
    update: {
      status: "bot_active",
      state: { preferredLanguage: "en", step: "idle" },
    },
  });
  return practice.id;
}

async function getStep(from: string): Promise<string | undefined> {
  const phone = normalizePhone(from);
  const practice = await WhatsAppService.resolvePracticeByNumber(CLINIC_TO);
  if (!practice) return undefined;
  const conv = await prisma.whatsAppConversation.findUnique({
    where: {
      practiceId_patientPhone: {
        practiceId: practice.id,
        patientPhone: phone,
      },
    },
  });
  const st = (conv?.state as { step?: string } | null) ?? {};
  return st.step;
}

async function say(
  flow: string,
  from: string,
  body: string,
  opts?: { fromInteractive?: boolean; allowEmpty?: boolean },
): Promise<{
  reply: string;
  step?: string;
  doctorList?: unknown[];
  slotList?: unknown[];
  dateList?: unknown[];
  bookingList?: unknown[];
  menuList?: unknown[];
  replyButtons?: unknown[];
}> {
  let result: Awaited<ReturnType<typeof WhatsAppService.handleInboundMessage>>;
  try {
    result = await WhatsAppService.handleInboundMessage({
      from,
      to: CLINIC_TO,
      body,
      fromInteractive: opts?.fromInteractive,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.stack || err.message : String(err);
    issues.push({
      flow,
      turn: body,
      severity: "crash",
      detail,
    });
    return { reply: "" };
  }

  const step = await getStep(from);
  transcript.push({
    flow,
    from,
    body,
    reply: result.reply,
    step,
  });

  if (!result.reply?.trim() && !opts?.allowEmpty) {
    issues.push({
      flow,
      turn: body,
      severity: "empty",
      detail: "Empty bot reply",
      step,
    });
  }
  if (result.reply && looksErrorish(result.reply)) {
    issues.push({
      flow,
      turn: body,
      severity: "errorish",
      detail: "Reply looks like an internal error",
      replyPreview: preview(result.reply),
      step,
    });
  }
  // Auto-agent from gibberish is a product bug (except explicit Support / clinical handoff flows)
  if (
    flow !== "4-support" &&
    flow !== "clinical-symptom" &&
    flow !== "support-resume-bot" &&
    step === "agent_transfer" &&
    !/^(menu:support|support|agent|help|human|staff)$/i.test(body.trim()) &&
    !/talk to|callback|call back|chest pain|fever|headache|suicide|overdose/i.test(
      body,
    )
  ) {
    issues.push({
      flow,
      turn: body,
      severity: "stuck",
      detail: "Unexpected agent_transfer from non-support input",
      replyPreview: preview(result.reply),
      step,
    });
  }

  return { ...result, step };
}

async function monkeyAtStep(
  flow: string,
  from: string,
  junkSubset: string[] = JUNK.slice(0, 8),
) {
  for (const junk of junkSubset) {
    await say(flow, from, junk);
  }
}

async function ensureMenu(from: string, flow: string) {
  await say(flow, from, "Menu", { fromInteractive: true });
}

/** Pick first interactive id from last result helpers */
function firstId(
  list?: Array<{ id?: string; index?: number; iso?: string }> | null,
): string | null {
  if (!list?.length) return null;
  const row = list[0]!;
  if (row.id) return row.id;
  if (typeof row.index === "number") return String(row.index);
  if (row.iso) return row.iso;
  return null;
}

async function flowBook(from: string) {
  const flow = "1-book";
  await resetConv(from);
  await ensureMenu(from, flow);
  await monkeyAtStep(flow, from, ["zzz", "999", "🙂", "maybe later"]);

  let r = await say(flow, from, "menu:book", { fromInteractive: true });
  // If register gate, skip — book needs registered
  if ((r.step || "").includes("register") || /register|full name|aadhaar/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "menu:book",
      severity: "warn",
      detail: "Book opened registration (expected for unregistered)",
      step: r.step,
      replyPreview: preview(r.reply),
    });
    return;
  }

  await monkeyAtStep(flow, from, ["xyz", "doctor 99", "0", "kaboom"]);

  // Whom step (Self vs Family) — digit 1 must work
  if ((r.step || "").includes("book_whom") || /whom is this appointment/i.test(r.reply)) {
    await monkeyAtStep(flow, from, ["zzz", "99"]);
    r = await say(flow, from, "1");
    if ((r.step || "").includes("book_whom")) {
      issues.push({
        flow,
        turn: "1",
        severity: "stuck",
        detail: "Digit 1 did not select Self on whom step",
        replyPreview: preview(r.reply),
        step: r.step,
      });
      r = await say(flow, from, "whom:self", { fromInteractive: true });
    }
  }

  // Prefer doctor list tap / digit
  if (r.doctorList?.length) {
    const id = (r.doctorList[0] as { id?: string }).id || "1";
    r = await say(flow, from, id.startsWith("provider:") || id.length > 8 ? id : "1", {
      fromInteractive: true,
    });
  } else if (/doctor|special/i.test(r.reply) || (r.step || "").includes("provider")) {
    r = await say(flow, from, "1");
  }

  await monkeyAtStep(flow, from, ["blargh", "32/13/2099", "yesterday forever"]);

  if (r.dateList?.length) {
    const iso = (r.dateList[0] as { iso?: string }).iso || "TOMORROW";
    r = await say(flow, from, iso);
  } else if (/tomorrow|date|when/i.test(r.reply) || (r.step || "").includes("date")) {
    r = await say(flow, from, "TOMORROW");
  }

  await monkeyAtStep(flow, from, ["slot potato", "0", "888"]);

  if (r.slotList?.length) {
    r = await say(flow, from, "1");
  } else if (/slot|token|time|confirm/i.test(r.reply)) {
    r = await say(flow, from, "1");
  }

  await monkeyAtStep(flow, from, ["maybe", "confirm:nah", "🤷"]);

  // Confirm yes path
  if (/confirm|yes|book/i.test(r.reply) || (r.step || "").includes("confirm")) {
    r = await say(flow, from, "yes", { fromInteractive: true });
  }

  // Endpoint: booking confirmation or clear failure message (not crash)
  if (!/booked|confirmed|appointment|token|queue|sorry|no slots|unavailable|already|registered/i.test(r.reply)) {
    // try one more YES
    r = await say(flow, from, "yes");
  }

  if (!/booked|confirmed|appointment|token|queue|sorry|no slots|unavailable|full|closed|select|doctor|slot|date|yes|confirm/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "endpoint",
      severity: "stuck",
      detail: `Book flow did not reach a clear endpoint. step=${r.step}`,
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

async function flowMyBookings(from: string) {
  const flow = "2-bookings";
  await resetConv(from);
  await ensureMenu(from, flow);
  await monkeyAtStep(flow, from, ["nope", "42", "@@@"]);

  let r = await say(flow, from, "menu:bookings", { fromInteractive: true });
  await monkeyAtStep(flow, from, ["banana", "0", "cancel everything now!!!"]);

  if (r.bookingList?.length) {
    r = await say(flow, from, "1");
    await monkeyAtStep(flow, from, ["xyz", "99"]);
    // manage options often: reschedule/cancel/keep
    if (r.replyButtons?.length) {
      const btn = (r.replyButtons[0] as { id?: string }).id;
      if (btn) r = await say(flow, from, btn, { fromInteractive: true });
    }
  }

  // Escape home
  r = await say(flow, from, "Menu");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "Menu",
      severity: "empty",
      detail: "Could not return to menu from bookings",
    });
  }
}

async function flowFamily(from: string) {
  const flow = "3-family";
  await resetConv(from);
  await ensureMenu(from, flow);
  let r = await say(flow, from, "menu:family", { fromInteractive: true });

  await monkeyAtStep(flow, from, ["", "123", "@@@", "yes"]);

  // Name step — junk then a valid name
  if (
    (r.step || "").includes("register") ||
    /name|family|dependant|register|aadhaar|photo/i.test(r.reply)
  ) {
    await monkeyAtStep(flow, from, ["x", "🙂"]);
    r = await say(flow, from, "Monkey Testkid");
  }

  await monkeyAtStep(flow, from, ["spaceship", "gender:alien"]);

  if (
    (r.step || "").includes("relationship") ||
    /relationship|spouse|child|parent/i.test(r.reply)
  ) {
    r = await say(flow, from, "rel:child", { fromInteractive: true });
  }

  await monkeyAtStep(flow, from, ["not-a-date", "99/99/9999", "abc"]);

  if (
    (r.step || "").includes("family_details") ||
    /dob|date of birth|national|id/i.test(r.reply)
  ) {
    r = await say(flow, from, "15/08/2015 784199012345678");
  }

  await monkeyAtStep(flow, from, ["helicopter", "both"]);

  if ((r.step || "").includes("gender") || /gender/i.test(r.reply)) {
    r = await say(flow, from, "female", { fromInteractive: true });
  }

  // confirm or cancel out
  if (
    (r.step || "").includes("confirm") ||
    /confirm|yes|looks good/i.test(r.reply)
  ) {
    await monkeyAtStep(flow, from, ["maybe", "idk"]);
    r = await say(flow, from, "yes");
  }

  // Don't leave a half-registered mess — exit if still registering
  if ((r.step || "").startsWith("awaiting_register")) {
    r = await say(flow, from, "Exit");
  }
}

async function flowSupport(from: string) {
  const flow = "4-support";
  await resetConv(from);
  await ensureMenu(from, flow);
  await monkeyAtStep(flow, from, ["zzz"]);
  let r = await say(flow, from, "menu:support", { fromInteractive: true });
  await monkeyAtStep(flow, from, ["I need help with billing $$$", "!!!!!!!", "agent"]);
  // Resume / menu should recover
  r = await say(flow, from, "Menu");
  if (!/menu|book|option|help|session|ended|support|agent|admin|callback/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "recover",
      severity: "stuck",
      detail: "Support flow did not recover to a usable reply",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

async function flowMsgDoctor(from: string) {
  const flow = "5-msg-doctor";
  await resetConv(from);
  await ensureMenu(from, flow);
  let r = await say(flow, from, "menu:message_doctor", { fromInteractive: true });

  // Junk that must NOT count as the message body
  for (const junk of ["", "0", "@@@@", "🙂"]) {
    r = await say(flow, from, junk);
  }

  // Pick a visit only when we are actually on the booking picker step
  if (
    (r.step || "").includes("message_doctor_booking") ||
    (r.bookingList?.length && /select|which|pick|booking/i.test(r.reply))
  ) {
    r = await say(flow, from, "1");
  }

  r = await say(flow, from, "Monkey test: please confirm my next visit time");

  if (
    !/sent|deliver|doctor|received|message|medical team|admin|sorry|no booking|open|visit|select|menu/i.test(
      r.reply,
    )
  ) {
    issues.push({
      flow,
      turn: "message",
      severity: "stuck",
      detail: "Msg doctor did not acknowledge message",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

async function flowAttach(from: string) {
  const flow = "6-attach";
  await resetConv(from);
  await ensureMenu(from, flow);
  let r = await say(flow, from, "menu:report", { fromInteractive: true });
  await monkeyAtStep(flow, from, ["pdf please", "0", "doc:bogus"]);
  // Without real media, endpoint is the upload prompt — must be clear
  if (!/photo|pdf|document|report|attach|send|upload|lab|menu|sorry|booking/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "endpoint",
      severity: "stuck",
      detail: "Attach flow reply unclear",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
  r = await say(flow, from, "Menu");
}

async function flowRegisterFresh(from: string) {
  const flow = "register-fresh";
  await resetConv(from);
  // Delete patient if we created one earlier
  const phone = normalizePhone(from);
  try {
    await prisma.patient.deleteMany({ where: { phone } });
  } catch {
    /* ignore */
  }

  let r = await say(flow, from, "Hi");
  await monkeyAtStep(flow, from, ["blorp", "7", "menu:zzz"]);
  r = await say(flow, from, "menu:book", { fromInteractive: true });

  // Whom → Self (1) should start self-register for fresh numbers
  if ((r.step || "").includes("book_whom") || /whom is this appointment/i.test(r.reply)) {
    await monkeyAtStep(flow, from, ["###", "yes"]);
    r = await say(flow, from, "1");
  }

  await monkeyAtStep(flow, from, ["###", "🙂"]);
  if (/name|register|aadhaar|photo|id/i.test(r.reply) || (r.step || "").includes("register")) {
    r = await say(flow, from, "Monkey Freshuser");
  }

  await monkeyAtStep(flow, from, ["notgender", "robot"]);
  if (/gender/i.test(r.reply) || (r.step || "").includes("gender")) {
    r = await say(flow, from, "Male");
  }

  await monkeyAtStep(flow, from, ["email@", "nope"]);
  if (/email/i.test(r.reply) || (r.step || "").includes("email")) {
    r = await say(flow, from, "no");
  }

  await monkeyAtStep(flow, from, ["hmm"]);
  if (/confirm|yes|looks good|register/i.test(r.reply) || (r.step || "").includes("confirm")) {
    r = await say(flow, from, "yes");
  }

  // Cleanup: exit leftover flow + delete patient row if created
  if ((r.step || "").startsWith("awaiting_")) {
    await say(flow, from, "Exit");
  }
  try {
    await prisma.patient.deleteMany({ where: { phone, name: { contains: "Monkey" } } });
  } catch {
    /* ignore */
  }
}

async function flowGlobalJunk(from: string) {
  const flow = "global-junk";
  await resetConv(from);
  for (const junk of JUNK) {
    await say(flow, from, junk);
  }
  // Must still respond to Menu
  const r = await say(flow, from, "Menu");
  if (!r.menuList?.length && !/1 ·|book|menu|option/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "Menu-after-junk",
      severity: "stuck",
      detail: "Menu broken after global junk barrage",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

async function flowPostBooking(from: string) {
  const flow = "post-booking";
  await resetConv(from);
  // Force post menu by booking first if possible, else inject state
  const practice = await WhatsAppService.resolvePracticeByNumber(CLINIC_TO);
  if (!practice) return;
  const phone = normalizePhone(from);
  await prisma.whatsAppConversation.update({
    where: {
      practiceId_patientPhone: { practiceId: practice.id, patientPhone: phone },
    },
    data: {
      status: "bot_active",
      state: {
        preferredLanguage: "en",
        step: "idle",
        lastMenuKind: "post",
        postBookingCare: true,
      },
    },
  });

  let r = await say(flow, from, "Hi");
  // Simulate post menu numbers
  for (const num of ["7", "0", "asdf", "post:zzz"]) {
    await say(flow, from, num);
  }
  r = await say(flow, from, "Menu");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "Menu",
      severity: "empty",
      detail: "Empty after post-booking monkey",
    });
  }
}

/** Mid-register → Exit / Menu / Book hijacks must not crash or trap. */
async function flowHijackMidRegister(from: string) {
  const flow = "hijack-mid-register";
  await resetConv(from);
  let r = await say(flow, from, "menu:family", { fromInteractive: true });
  if ((r.step || "").includes("register") || /name|register|aadhaar/i.test(r.reply)) {
    r = await say(flow, from, "Halfway Monkey");
  }
  // Abrupt Exit
  r = await say(flow, from, "Exit");
  if ((r.step || "") !== "idle" && (r.step || "") !== undefined) {
    // Exit should land idle / session ended
    if (!/session ended|hi'|menu|ended/i.test(r.reply) && (r.step || "").startsWith("awaiting_")) {
      issues.push({
        flow,
        turn: "Exit",
        severity: "stuck",
        detail: `Exit left step=${r.step}`,
        replyPreview: preview(r.reply),
        step: r.step,
      });
    }
  }

  // Start again, then Menu hijack
  await resetConv(from);
  r = await say(flow, from, "menu:family", { fromInteractive: true });
  r = await say(flow, from, "Menu");
  if (!/menu|book|option|welcome/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "Menu-hijack",
      severity: "stuck",
      detail: "Menu mid-register did not show main menu",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }

  // Start again, Book hijack
  await resetConv(from);
  r = await say(flow, from, "menu:family", { fromInteractive: true });
  r = await say(flow, from, "Book");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "Book-hijack",
      severity: "empty",
      detail: "Empty reply after Book mid-register",
    });
  }
}

/** Yes/No flip-flops on confirm steps; double taps. */
async function flowConfirmFlipFlop(from: string) {
  const flow = "confirm-flipflop";
  await resetConv(from);
  let r = await say(flow, from, "menu:bookings", { fromInteractive: true });
  if (r.bookingList?.length) {
    r = await say(flow, from, "1");
    // Spam yes/no
    for (const t of ["no", "yes", "no", "YES", "NO", "maybe", "confirm:yes", "confirm:no"]) {
      r = await say(flow, from, t, { fromInteractive: /confirm:/.test(t) });
    }
  }
  r = await say(flow, from, "Menu");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "Menu",
      severity: "empty",
      detail: "Empty after confirm flip-flop",
    });
  }
}

/** Rapid option thrashing: switch menu options without finishing. */
async function flowRapidSwitch(from: string) {
  const flow = "rapid-switch";
  await resetConv(from);
  const taps = [
    "menu:book",
    "menu:bookings",
    "menu:family",
    "menu:support",
    "Menu",
    "menu:message_doctor",
    "menu:report",
    "menu:book",
    "Exit",
    "Hi",
    "menu:bookings",
  ];
  for (const t of taps) {
    await say(flow, from, t, {
      fromInteractive: t.startsWith("menu:"),
    });
  }
  const r = await say(flow, from, "Menu");
  if (!/menu|book|option|welcome|session/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "final-Menu",
      severity: "stuck",
      detail: "Rapid switch left bot unusable",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

/** STOP / START opt-out + Callback / Attach keywords. */
async function flowOptOutAndKeywords(from: string) {
  const flow = "optout-keywords";
  await resetConv(from);
  let r = await say(flow, from, "STOP");
  if (!/opt|alert|stop|start/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "STOP",
      severity: "stuck",
      detail: "STOP did not acknowledge opt-out",
      replyPreview: preview(r.reply),
    });
  }
  r = await say(flow, from, "START");
  if (!/opt|alert|start|stop/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "START",
      severity: "stuck",
      detail: "START did not acknowledge opt-in",
      replyPreview: preview(r.reply),
    });
  }
  r = await say(flow, from, "CallBack");
  if (!/callback|call|admin|logged|representative/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "CallBack",
      severity: "stuck",
      detail: "CallBack keyword failed",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
  r = await say(flow, from, "Attach");
  if (!/photo|pdf|document|report|attach|send|upload/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "Attach",
      severity: "stuck",
      detail: "Attach keyword unclear",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
  r = await say(flow, from, "Menu");
}

/** Language toggle chaos + Hindi replies mid-flow. */
async function flowLanguageChaos(from: string) {
  const flow = "language-chaos";
  await resetConv(from);
  let r = await say(flow, from, "lang:hi", { fromInteractive: true });
  r = await say(flow, from, "Menu");
  r = await say(flow, from, "lang:en", { fromInteractive: true });
  r = await say(flow, from, "lang:xx", { fromInteractive: true });
  r = await say(flow, from, "नमस्ते");
  r = await say(flow, from, "बुक");
  r = await say(flow, from, "Menu");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "Menu",
      severity: "empty",
      detail: "Empty after language chaos",
    });
  }
}

/** Date/slot garbage during book after whom+doctor if reachable. */
async function flowBookDateSlotChaos(from: string) {
  const flow = "book-date-slot-chaos";
  await resetConv(from);
  let r = await say(flow, from, "menu:book", { fromInteractive: true });
  if ((r.step || "").includes("book_whom") || /whom is this/i.test(r.reply)) {
    r = await say(flow, from, "whom:self", { fromInteractive: true });
  }
  // If still registering, bail with Exit — chaos is for registered book path
  if ((r.step || "").includes("register")) {
    await say(flow, from, "Exit");
    return;
  }
  if (r.doctorList?.length) {
    const id = (r.doctorList[0] as { id?: string }).id;
    r = await say(flow, from, id || "1", { fromInteractive: Boolean(id) });
  } else if (/doctor/i.test(r.reply)) {
    r = await say(flow, from, "1");
  }
  for (const bad of [
    "yesterday",
    "32/13/2099",
    "next century",
    "date:bogus",
    "mondayeday",
  ]) {
    r = await say(flow, from, bad);
  }
  r = await say(flow, from, "TOMORROW");
  for (const bad of ["0", "99", "slot:potato", "noonish", "-5"]) {
    r = await say(flow, from, bad);
  }
  // Escape
  r = await say(flow, from, "Exit");
  if (!/session ended|menu|ended|hi/i.test(r.reply) && (r.step || "").startsWith("awaiting_")) {
    issues.push({
      flow,
      turn: "Exit",
      severity: "stuck",
      detail: `Could not exit book chaos step=${r.step}`,
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

/** Cancel flow with junk reasons / flip-flops. */
async function flowCancelChaos(from: string) {
  const flow = "cancel-chaos";
  await resetConv(from);
  let r = await say(flow, from, "cancel my appointment");
  await monkeyAtStep(flow, from, ["zzz", "0", "99", "confirm:nah"]);
  if (r.bookingList?.length) {
    r = await say(flow, from, "1");
    for (const t of ["no", "maybe", "yes", "no"]) {
      r = await say(flow, from, t);
    }
  }
  r = await say(flow, from, "Menu");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "Menu",
      severity: "empty",
      detail: "Empty after cancel chaos",
    });
  }
}

/** Support → BOT resume → book; also agent trap recovery. */
async function flowSupportResumeBot(from: string) {
  const flow = "support-resume-bot";
  await resetConv(from);
  let r = await say(flow, from, "menu:support", { fromInteractive: true });
  r = await say(flow, from, "random complaint while handed off");
  r = await say(flow, from, "BOT");
  if ((r.step || "") === "agent_transfer") {
    issues.push({
      flow,
      turn: "BOT",
      severity: "stuck",
      detail: "BOT did not leave agent_transfer",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
  r = await say(flow, from, "menu:book", { fromInteractive: true });
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "book-after-bot",
      severity: "empty",
      detail: "Empty book reply after BOT resume",
    });
  }
  await say(flow, from, "Exit");
}

/** Clinical symptom free-text should not crash; prefer handoff/menu over book. */
async function flowClinicalSymptom(from: string) {
  const flow = "clinical-symptom";
  await resetConv(from);
  const r = await say(flow, from, "I have chest pain and fever since last night");
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "symptom",
      severity: "empty",
      detail: "Empty reply to clinical symptom",
    });
  }
  // Should not silently book
  if ((r.step || "").includes("book_whom") || (r.step || "").includes("awaiting_provider")) {
    issues.push({
      flow,
      turn: "symptom",
      severity: "stuck",
      detail: "Clinical symptom incorrectly started booking",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
  await say(flow, from, "Menu");
}

/** Double-send same interactive tap repeatedly. */
async function flowDoubleTap(from: string) {
  const flow = "double-tap";
  await resetConv(from);
  for (let i = 0; i < 3; i++) {
    await say(flow, from, "menu:bookings", { fromInteractive: true });
  }
  for (let i = 0; i < 3; i++) {
    await say(flow, from, "Menu");
  }
  const r = await say(flow, from, "menu:report", { fromInteractive: true });
  if (!r.reply?.trim()) {
    issues.push({
      flow,
      turn: "report",
      severity: "empty",
      detail: "Empty after double-tap barrage",
    });
  }
}

/** Unregistered patient tries Msg doctor / Attach / Status. */
async function flowUnregisteredRestricted(from: string) {
  const flow = "unreg-restricted";
  await resetConv(from);
  const phone = normalizePhone(from);
  try {
    await prisma.patient.deleteMany({ where: { phone } });
  } catch {
    /* ignore */
  }
  for (const tap of [
    "menu:message_doctor",
    "menu:report",
    "menu:bookings",
    "STATUS",
    "MY DOCS",
  ] as const) {
    const r = await say(flow, from, tap, {
      fromInteractive: tap.startsWith("menu:"),
    });
    if (!r.reply?.trim()) {
      issues.push({
        flow,
        turn: tap,
        severity: "empty",
        detail: `Empty reply for unregistered ${tap}`,
      });
    }
  }
  await say(flow, from, "Exit");
}

/** Chaos barrage interleaved with valid Menu recovery. */
async function flowChaosBarrage(from: string) {
  const flow = "chaos-barrage";
  await resetConv(from);
  for (const c of CHAOS) {
    await say(flow, from, c);
  }
  const r = await say(flow, from, "Menu");
  if (!r.menuList?.length && !/1 ·|book|menu|option|welcome/i.test(r.reply)) {
    issues.push({
      flow,
      turn: "Menu-after-chaos",
      severity: "stuck",
      detail: "Menu broken after chaos barrage",
      replyPreview: preview(r.reply),
      step: r.step,
    });
  }
}

async function main() {
  console.log("=== WhatsApp monkey test starting ===");
  const practice = await WhatsAppService.resolvePracticeByNumber(CLINIC_TO);
  if (!practice) {
    throw new Error(`No practice for ${CLINIC_TO}`);
  }
  console.log(`Practice: ${practice.name} (${practice.id})`);
  console.log(
    `Clinic line=${CLINIC_TO} registered=${REGISTERED_FROM} fresh=${FRESH_FROM}`,
  );

  // Core menu paths (registered)
  await flowGlobalJunk(REGISTERED_FROM);
  await flowBook(REGISTERED_FROM);
  await flowMyBookings(REGISTERED_FROM);
  await flowFamily(REGISTERED_FROM);
  await flowSupport(REGISTERED_FROM);
  await flowMsgDoctor(REGISTERED_FROM);
  await flowAttach(REGISTERED_FROM);
  await flowPostBooking(REGISTERED_FROM);

  // Expanded use cases (registered)
  await flowHijackMidRegister(REGISTERED_FROM);
  await flowConfirmFlipFlop(REGISTERED_FROM);
  await flowRapidSwitch(REGISTERED_FROM);
  await flowOptOutAndKeywords(REGISTERED_FROM);
  await flowLanguageChaos(REGISTERED_FROM);
  await flowBookDateSlotChaos(REGISTERED_FROM);
  await flowCancelChaos(REGISTERED_FROM);
  await flowSupportResumeBot(REGISTERED_FROM);
  await flowClinicalSymptom(REGISTERED_FROM);
  await flowDoubleTap(REGISTERED_FROM);
  await flowChaosBarrage(REGISTERED_FROM);

  // Fresh / unregistered
  await flowRegisterFresh(FRESH_FROM);
  await flowUnregisteredRestricted(FRESH_FROM);
  await flowGlobalJunk(FRESH_FROM);
  await flowChaosBarrage(FRESH_FROM);

  // Summary
  const crashes = issues.filter((i) => i.severity === "crash");
  const bad = issues.filter((i) =>
    ["crash", "empty", "errorish", "stuck"].includes(i.severity),
  );
  const warns = issues.filter((i) => i.severity === "warn");

  console.log("\n=== TRANSCRIPT (last 50) ===");
  for (const t of transcript.slice(-50)) {
    console.log(
      `[${t.flow}] >> ${preview(t.body, 40)} | step=${t.step ?? "-"} | << ${preview(t.reply)}`,
    );
  }

  console.log("\n=== ISSUES ===");
  for (const i of issues) {
    console.log(
      `- [${i.severity}] ${i.flow} @ "${preview(i.turn, 40)}": ${i.detail}${i.replyPreview ? ` | reply=${i.replyPreview}` : ""}${i.step ? ` | step=${i.step}` : ""}`,
    );
  }

  console.log(
    `\nSummary: turns=${transcript.length} issues=${issues.length} (bad=${bad.length} warn=${warns.length} crash=${crashes.length})`,
  );

  if (crashes.length || bad.length) {
    process.exitCode = 2;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
