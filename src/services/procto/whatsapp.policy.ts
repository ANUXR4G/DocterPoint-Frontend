/** GlucoGuide WhatsApp policy: AI disclosure, FAQ KB, clinical guardrails, human handoff. */

import { L, type WaLang } from "./whatsapp.i18n.js";

/**
 * Inbound: patient asking for medical advice (not booking / uploading a visit file).
 * Do NOT match "lab report" / "test result" — those are visit-document intents.
 */
const CLINICAL_RE =
  /\b(diagnos(?:e|is|ed|ing)?|prescrib\w*|medication|dosage|symptom|fever|sugar\s*level|insulin|treatment for|therapy for|pain\s*in|chest\s*pain|headache|migraine|nausea|vomit\w*|dizz(?:y|iness)|bleeding|suicide|overdose|what medicine|which medicine)\b/i;

/** Outbound: only block replies that look like giving medical advice. */
const CLINICAL_ADVICE_OUT_RE =
  /\b(diagnos(?:e|is|ed|ing)?|prescrib\w*|you should take|take \d+\s*mg|dosage of|insulin dose|treatment for your|therapy for your)\b/i;

const HANDOFF_RE =
  /\b(talk to (a )?(human|person|doctor|receptionist|someone)|human please|agent|real person|call me|इंसान|डॉक्टर से बात|स्टाफ)\b/i;

export function looksClinical(text: string): boolean {
  return CLINICAL_RE.test(text);
}

export function wantsHuman(text: string): boolean {
  return HANDOFF_RE.test(text);
}

/** True for structured bot menus (welcome / help) — never replace these. */
function looksLikeBotMenu(reply: string): boolean {
  return (
    /\*(REGISTER|BOOK|DOCTORS|STATUS|FAQ|RESCHEDULE|CANCEL|REPORT|MY DOCS|LANGUAGE)\*/i.test(
      reply,
    ) ||
    /\bWelcome to\b|\bWelcome back\b|\bमें आपका स्वागत है\b|\bवापसी पर स्वागत\b|\bHow can I assist you\b|\bHow can I help you\b|\bमैं आपकी कैसे मदद करूँ\b|\bमैं कैसे मदद करूँ\b|\bTap \*Menu\*|नीचे \*Menu\*|\*Main menu\*|\*मुख्य मेनू\*/i.test(
      reply,
    )
  );
}

/** Strip / block medical-advice style outbound content. */
/** True when `guardOutbound` would replace a reply containing this text. */
export function triggersOutboundGuard(text: string): boolean {
  return CLINICAL_ADVICE_OUT_RE.test(text);
}

export function guardOutbound(reply: string, lang?: WaLang): string {
  if (looksLikeBotMenu(reply)) return reply;
  if (!CLINICAL_ADVICE_OUT_RE.test(reply)) return reply;
  return L(
    lang,
    "I can only help with *appointments* (book, reschedule, cancel) and clinic info like fees or timings.\n" +
      "For medical questions, please speak with the doctor during your visit.\n" +
      "Reply *Menu* anytime, or *Book* / *Status* / *Doctors*.",
    "मैं सिर्फ *अपॉइंटमेंट* (बुक, रीशेड्यूल, रद्द) और क्लिनिक जानकारी (फीस, समय) में मदद कर सकता/सकती हूँ।\n" +
      "मेडिकल सवालों के लिए अपनी विज़िट पर डॉक्टर से बात करें।\n" +
      "कभी भी *Menu*, या *Book* / *Status* / *Doctors* लिखें।",
  );
}

export function aiDisclosure(practiceName: string, lang?: WaLang): string {
  return L(
    lang,
    `Hi — I'm the *AI assistant* for *${practiceName}* (not a doctor).\n` +
      `I can help with bookings and clinic FAQs only. For medical advice, see the doctor.\n\n`,
    `नमस्ते — मैं *${practiceName}* का *AI सहायक* हूँ (डॉक्टर नहीं)।\n` +
      `मैं सिर्फ बुकिंग और क्लिनिक FAQ में मदद करता/करती हूँ। मेडिकल सलाह के लिए डॉक्टर से मिलें।\n\n`,
  );
}

export type FaqPracticeExtras = {
  /** Live practice.consultationFee — preferred over faqKb.fee */
  consultationFee?: number | null;
  address?: string | null;
  phone?: string | null;
  specialty?: string | null;
  email?: string | null;
};

function formatConsultationFee(
  fee: number | null | undefined,
  kbFee: string | null | undefined,
): string | null {
  if (fee != null && Number.isFinite(Number(fee)) && Number(fee) > 0) {
    return `₹${Number(fee)}`;
  }
  const trimmed = kbFee?.trim();
  return trimmed || null;
}

/** Merge faqKb JSON with live practice fields (fee is always preferred from DB). */
export function buildFaqKb(
  faqKb: unknown,
  extras?: FaqPracticeExtras,
): Record<string, string> {
  const kb: Record<string, string> = {};
  if (faqKb && typeof faqKb === "object" && !Array.isArray(faqKb)) {
    for (const [k, v] of Object.entries(faqKb as Record<string, unknown>)) {
      if (v == null) continue;
      const s = String(v).trim();
      if (s) kb[k] = s;
    }
  }
  const fee = formatConsultationFee(extras?.consultationFee, kb.fee);
  if (fee) kb.fee = fee;
  if (extras?.address?.trim()) kb.address = extras.address.trim();
  if (extras?.specialty?.trim()) kb.specialty = extras.specialty.trim();
  if (extras?.phone?.trim()) kb.phone = extras.phone.trim();
  if (extras?.email?.trim()) kb.email = extras.email.trim();
  return kb;
}

function formatFaqDump(kb: Record<string, string>): string {
  const order = [
    "fee",
    "specialty",
    "address",
    "timings",
    "phone",
    "email",
    "parking",
    "documents",
  ];
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const key of order) {
    const match = Object.keys(kb).find((k) => k.toLowerCase() === key);
    if (match && kb[match]) {
      lines.push(`• *${match}*: ${kb[match]}`);
      seen.add(match);
    }
  }
  for (const [k, v] of Object.entries(kb)) {
    if (seen.has(k) || !v) continue;
    lines.push(`• *${k}*: ${v}`);
  }
  return lines.join("\n");
}

export function faqReply(
  faqKb: unknown,
  practiceName: string,
  query: string,
  lang?: WaLang,
  extras?: FaqPracticeExtras,
): string | null {
  const kb = buildFaqKb(faqKb, extras);
  const q = query.toLowerCase();
  const keys = Object.keys(kb);
  if (!keys.length) return null;

  const pick = (aliases: string[]) => {
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (aliases.some((a) => kl.includes(a))) {
        return kb[k];
      }
    }
    return null;
  };

  if (/fee|charge|cost|price|₹|rs\b|फीस|शुल्क/.test(q)) {
    const v = pick(["fee", "charge", "cost", "price"]);
    if (v) {
      return L(
        lang,
        `Appointment / consultation fee at *${practiceName}*:\n*${v}*`,
        `*${practiceName}* पर अपॉइंटमेंट / कंसल्टेशन फीस:\n*${v}*`,
      );
    }
  }
  if (/timing|hours|open|close|when|समय|खुल|बंद/.test(q)) {
    const v = pick(["timing", "hours", "schedule", "open"]);
    if (v) {
      return L(lang, `Clinic timings:\n${v}`, `क्लिनिक का समय:\n${v}`);
    }
  }
  if (/address|location|where|map|direction|पता|लोकेशन|कहाँ/.test(q)) {
    const v = pick(["address", "location", "where"]);
    if (v) {
      return L(lang, `Clinic address:\n${v}`, `क्लिनिक का पता:\n${v}`);
    }
  }
  if (/park|पार्किंग/.test(q)) {
    const v = pick(["parking", "park"]);
    if (v) return L(lang, `Parking:\n${v}`, `पार्किंग:\n${v}`);
  }
  if (/document|id|bring|carry|report|दस्तावेज|लाएँ/.test(q)) {
    const v = pick(["document", "bring", "id", "report"]);
    if (v) {
      return L(lang, `Please bring:\n${v}`, `कृपया साथ लाएँ:\n${v}`);
    }
  }

  if (
    /^faq$|frequently|clinic info|information|जानकारी/.test(q.trim()) ||
    // Intent "faq" with plain "info" / empty-ish — full dump when KB has content
    (keys.length > 0 && /^(faq|info|details)$/i.test(q.trim()))
  ) {
    const body = formatFaqDump(kb);
    if (!body) return null;
    return L(
      lang,
      `Clinic details for *${practiceName}*:\n${body}`,
      `*${practiceName}* की क्लिनिक जानकारी:\n${body}`,
    );
  }
  return null;
}

/** Branch D — Talk to Support / Agent. */
export function escalateReply(lang?: WaLang): string {
  return L(
    lang,
    "Connecting you to an agent... A team member will reply shortly.",
    "आपको एक एजेंट से जोड़ा जा रहा है... टीम सदस्य जल्द जवाब देगा।",
  );
}

export function isOptOut(text: string): boolean {
  return /^(stop|unsubscribe|opt\s*out|cancel alerts|बंद करो|अलर्ट बंद)$/i.test(
    text.trim(),
  );
}

export function isOptIn(text: string): boolean {
  return /^(start|subscribe|opt\s*in|अलर्ट चालू)$/i.test(text.trim());
}

export function optOutAck(lang?: WaLang): string {
  return L(
    lang,
    "You're out of *clinic WhatsApp chat* and back with the booking assistant.\n" +
      "Appointment alert messages are paused. Reply *START* to turn alerts back on.\n" +
      "Reply *Menu* anytime for booking help.",
    "आप *क्लिनिक WhatsApp चैट* से बाहर हैं और बुकिंग असिस्टेंट पर वापस हैं।\n" +
      "अपॉइंटमेंट अलर्ट रोक दिए गए हैं। अलर्ट फिर चालू करने के लिए *START* लिखें।\n" +
      "बुकिंग मदद के लिए कभी भी *Menu* लिखें।",
  );
}

export function optInAck(lang?: WaLang): string {
  return L(
    lang,
    "You're opted back in to appointment WhatsApp alerts from this clinic.\n" +
      "Reply *STOP* anytime to opt out again.",
    "आप फिर से इस क्लिनिक की अपॉइंटमेंट WhatsApp अलर्ट पा रहे हैं।\n" +
      "बंद करने के लिए कभी भी *STOP* लिखें।",
  );
}
