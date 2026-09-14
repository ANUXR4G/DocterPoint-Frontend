/** Session bot prompts + free-form notification fallback.
 * Proactive Meta UTILITY bodies live in whatsapp.metaTemplates.ts (single source).
 * Free-form notification fallbacks are rendered from that catalog — do not duplicate copy here.
 * See documentation/Whatsapp-Meta-Rules.md.
 */

import {
  OPT_OUT_FOOTER,
  renderUtilityTemplateBody,
} from "./whatsapp.metaTemplates.js";
import { L, type WaLang } from "./whatsapp.i18n.js";

export type TemplatePayload = Record<string, unknown>;

function str(payload: TemplatePayload, key: string, fallback = ""): string {
  const v = payload[key];
  if (v == null || v === "") return fallback;
  return String(v);
}

function whenLabel(payload: TemplatePayload): string {
  if (payload.whenLabel) return str(payload, "whenLabel");
  if (payload.mode === "TOKEN_BASED" || payload.tokenNumber != null) {
    const token = str(payload, "tokenNumber", "?");
    const day = str(payload, "sessionDate", "the session date");
    return `Token #${token} on ${day}`;
  }
  if (payload.slotStart) {
    const d = new Date(String(payload.slotStart));
    if (!Number.isNaN(d.getTime())) return d.toLocaleString();
  }
  if (payload.newWhen) return str(payload, "newWhen");
  return "your scheduled time";
}

function withOptOut(body: string, audience?: string): string {
  if (audience === "clinic") return body;
  if (body.includes("STOP to opt out") || body.includes("STOP लिखें")) return body;
  return body + OPT_OUT_FOOTER;
}

export const BotPrompts = {
  welcome(
    practiceName: string,
    patientName?: string | null,
    lang?: WaLang,
  ): string {
    const hello = patientName
      ? L(lang, `Hi *${patientName}*!`, `नमस्ते *${patientName}*!`)
      : L(lang, "Hi!", "नमस्ते!");
    const registeredHint = patientName
      ? L(
          lang,
          `You're signed in on this number.\n\n`,
          `आप इस नंबर पर साइन-इन हैं।\n\n`,
        )
      : L(
          lang,
          `New here? Reply *REGISTER* (quick — name + gender) or go straight to *BOOK*.\n\n`,
          `नए हैं? *REGISTER* लिखें (नाम + लिंग) या सीधे *BOOK* करें।\n\n`,
        );
    return (
      L(
        lang,
        `${hello} Welcome to *${practiceName}*.\n\n` +
          `This chat is for *patients* only.\n` +
          registeredHint +
          `I can help you:\n` +
          `• *REGISTER* — create a patient account\n` +
          `• *DOCTORS* — list doctors at this clinic\n` +
          `• *BOOK* an appointment\n` +
          `• *STATUS* — view upcoming visits\n` +
          `• *REPORT* — send a visit file / photo\n` +
          `• *MY DOCS* — list files already attached\n` +
          `• *CANCEL* a booking\n` +
          `• *RESCHEDULE* to a new time\n` +
          `• *FAQ* — fees, timings, address\n` +
          `• *LANGUAGE* — change language`,
        `${hello} *${practiceName}* में आपका स्वागत है।\n\n` +
          `यह चैट सिर्फ *मरीज़ों* के लिए है।\n` +
          registeredHint +
          `मैं इनमें मदद कर सकता/सकती हूँ:\n` +
          `• *REGISTER* — मरीज़ अकाउंट बनाएँ\n` +
          `• *DOCTORS* — क्लिनिक के डॉक्टर देखें\n` +
          `• *BOOK* — अपॉइंटमेंट बुक करें\n` +
          `• *STATUS* — आने वाली विज़िट देखें\n` +
          `• *REPORT* — विज़िट के लिए फ़ाइल/फ़ोटो भेजें\n` +
          `• *MY DOCS* — जुड़े हुए फ़ाइल देखें\n` +
          `• *CANCEL* — बुकिंग रद्द करें\n` +
          `• *RESCHEDULE* — समय बदलें\n` +
          `• *FAQ* — फीस, समय, पता\n` +
          `• *LANGUAGE* / *भाषा* — भाषा बदलें`,
      )
    );
  },

  help(practiceName: string, patientName?: string | null, lang?: WaLang): string {
    return BotPrompts.welcome(practiceName, patientName, lang);
  },

  needRegisterThenBook(lang?: WaLang): string {
    return L(
      lang,
      "To book, we need a quick patient profile first.\n" +
        "Send a clear photo of your *Aadhaar / PAN / ID*, or type your *full name*.",
      "बुकिंग के लिए पहले छोटा मरीज़ प्रोफ़ाइल चाहिए।\n" +
        "अपने *आधार / पैन / ID* की साफ़ फ़ोटो भेजें, या अपना *पूरा नाम* लिखें।",
    );
  },

  askRegisterName(lang?: WaLang): string {
    return L(
      lang,
      "Let's create your patient account.\n" +
        "Send a clear photo of your *Aadhaar / PAN / ID*, or type your *full name*.",
      "आइए आपका मरीज़ अकाउंट बनाते हैं।\n" +
        "अपने *आधार / पैन / ID* की साफ़ फ़ोटो भेजें, या अपना *पूरा नाम* लिखें।",
    );
  },

  askRegisterGender(lang?: WaLang): string {
    return L(
      lang,
      "What is your gender? Reply *MALE*, *FEMALE*, or *OTHERS*.",
      "आपका लिंग क्या है? *MALE*, *FEMALE*, या *OTHERS* लिखें।",
    );
  },

  askRegisterEmail(lang?: WaLang): string {
    return L(
      lang,
      "What is your *email address*? (for your profile — you sign in with your mobile number)",
      "आपका *ईमेल पता* क्या है? (प्रोफ़ाइल के लिए — लॉगिन मोबाइल नंबर से होगा)",
    );
  },

  askRegisterConfirm(summary: string, thenBook?: boolean, lang?: WaLang): string {
    const next = thenBook
      ? L(lang, "\nAfter this we'll continue to *booking*.", "\nइसके बाद *बुकिंग* जारी रखेंगे।")
      : "";
    return L(
      lang,
      `Confirm registration:${next}\n${summary}\n\n` +
        `Reply *YES* to create your account or *NO* to cancel.`,
      `रजिस्ट्रेशन कन्फ़र्म करें:${next}\n${summary}\n\n` +
        `अकाउंट बनाने के लिए *YES*, रद्द करने के लिए *NO* लिखें।`,
    );
  },

  idOcrProcessing(lang?: WaLang): string {
    return L(
      lang,
      "📄 Got your ID photo — reading details…",
      "📄 ID फ़ोटो मिल गई — विवरण पढ़ रहा/रही हूँ…",
    );
  },

  idOcrNotConfigured(lang?: WaLang): string {
    return L(
      lang,
      "ID photo scan isn't enabled on this line yet. Please type your *full name* to register, " +
        "or reply *HELP* for options.",
      "इस लाइन पर ID स्कैन अभी चालू नहीं है। रजिस्टर करने के लिए अपना *पूरा नाम* लिखें, " +
        "या विकल्पों के लिए *HELP* लिखें।",
    );
  },

  idOcrFailed(lang?: WaLang): string {
    return L(
      lang,
      "I couldn't read that image. Send a clear, well-lit photo of your Aadhaar/PAN (JPG/PNG), " +
        "or type your *full name*.",
      "उस फ़ोटो को पढ़ नहीं पाया/पाई। आधार/पैन की साफ़, अच्छी रोशनी वाली फ़ोटो (JPG/PNG) भेजें, " +
        "या अपना *पूरा नाम* लिखें।",
    );
  },

  idOcrNeedName(lang?: WaLang): string {
    return L(
      lang,
      "I read the photo but couldn't find a clear name. Please type your *full name*.",
      "फ़ोटो पढ़ ली, लेकिन साफ़ नाम नहीं मिला। कृपया अपना *पूरा नाम* लिखें।",
    );
  },

  idOcrGotName(name: string, lang?: WaLang): string {
    return L(
      lang,
      `Read from your ID: *${name}*`,
      `आपके ID से पढ़ा: *${name}*`,
    );
  },

  idOcrConfirm(summary: string, thenBook?: boolean, lang?: WaLang): string {
    const next = thenBook
      ? L(lang, "\nAfter this we'll continue to *booking*.", "\nइसके बाद *बुकिंग* जारी रखेंगे।")
      : "";
    return L(
      lang,
      `Read from your ID — confirm registration:${next}\n${summary}\n\n` +
        `Reply *YES* to create your account, *NO* to cancel, or send another ID photo.`,
      `ID से पढ़ा — रजिस्ट्रेशन कन्फ़र्म करें:${next}\n${summary}\n\n` +
        `*YES* से अकाउंट बनाएँ, *NO* से रद्द करें, या दूसरी ID फ़ोटो भेजें।`,
    );
  },

  idOcrAlreadyRegistered(name: string, lang?: WaLang): string {
    return BotPrompts.alreadyRegistered(name, lang);
  },

  unsupportedMedia(lang?: WaLang): string {
    return L(
      lang,
      "Please send *text*, a *voice note*, an *ID photo* (to register), or a *report* (JPG/PNG/PDF) for your visit.\n" +
        "Reply *REPORT* for how to attach files, or *HELP* for options.",
      "कृपया *टेक्स्ट*, *वॉइस नोट*, रजिस्टर के लिए *ID फ़ोटो*, या विज़िट के लिए *रिपोर्ट* (JPG/PNG/PDF) भेजें।\n" +
        "फ़ाइल जोड़ने का तरीका जानने के लिए *REPORT*, या विकल्पों के लिए *HELP* लिखें।",
    );
  },

  visitDocProcessing(lang?: WaLang): string {
    return L(
      lang,
      "📎 Got it — attaching to your visit for the doctor…",
      "📎 मिल गया — डॉक्टर की विज़िट से जोड़ रहा/रही हूँ…",
    );
  },

  visitDocHowTo(lang?: WaLang): string {
    return L(
      lang,
      "To share a report with your doctor:\n" +
        "1. Book a visit (*BOOK*) if you don’t have one yet\n" +
        "2. Send a *photo* or *PDF* here (optional caption = file name)\n" +
        "3. The clinic sees it on your visit in GlucoGuide\n\n" +
        "Tip: for signup ID scan, reply *REGISTER* first, then send Aadhaar/PAN.\n" +
        "Reply *MY DOCS* to list files already attached.",
      "डॉक्टर से रिपोर्ट साझा करने के लिए:\n" +
        "1. अगर अपॉइंटमेंट नहीं है तो *BOOK* करें\n" +
        "2. यहाँ *फ़ोटो* या *PDF* भेजें (कैप्शन = फ़ाइल नाम)\n" +
        "3. क्लिनिक इसे GlucoGuide विज़िट में देखेगा\n\n" +
        "रजिस्टर ID स्कैन के लिए पहले *REGISTER*, फिर आधार/पैन भेजें।\n" +
        "जुड़ी फ़ाइलें देखने के लिए *MY DOCS* लिखें।",
    );
  },

  visitDocNoBooking(lang?: WaLang): string {
    return L(
      lang,
      "I don’t see an open appointment to attach this to.\n" +
        "Reply *BOOK* to schedule, then send the file again.\n" +
        "Or reply *REGISTER* and send an ID photo to create your account.",
      "इस फ़ाइल को जोड़ने के लिए कोई खुली अपॉइंटमेंट नहीं मिली।\n" +
        "पहले *BOOK* करें, फिर फ़ाइल फिर भेजें।\n" +
        "या अकाउंट बनाने के लिए *REGISTER* लिखकर ID फ़ोटो भेजें।",
    );
  },

  visitDocBookingClosed(lang?: WaLang): string {
    return L(
      lang,
      "That visit is already closed, so I can’t add more files. Reply *BOOK* for a new appointment.",
      "वह विज़िट बंद हो चुकी है — और फ़ाइलें नहीं जोड़ सकते। नई अपॉइंटमेंट के लिए *BOOK* लिखें।",
    );
  },

  visitDocLimitReached(max: number, lang?: WaLang): string {
    return L(
      lang,
      `This visit already has ${max} files (maximum). Ask the clinic to remove one, or bring extras in person.`,
      `इस विज़िट पर पहले से ${max} फ़ाइलें हैं (अधिकतम)। क्लिनिक से एक हटवाएँ, या बाकी साथ ले आएँ।`,
    );
  },

  visitDocBadType(lang?: WaLang): string {
    return L(
      lang,
      "Please send a *JPG/PNG photo* or *PDF* report (under 10 MB).",
      "कृपया *JPG/PNG फ़ोटो* या *PDF* रिपोर्ट भेजें (10 MB से कम)।",
    );
  },

  visitDocUploadFailed(lang?: WaLang): string {
    return L(
      lang,
      "Couldn’t save that file just now. Please try again in a moment, or upload in the GlucoGuide app.",
      "फ़ाइल अभी सेव नहीं हो सकी। थोड़ी देर बाद फिर कोशिश करें, या GlucoGuide ऐप में अपलोड करें।",
    );
  },

  visitDocAttached(opts: {
    name: string;
    count: number;
    max: number;
    whenLabel: string;
    lang?: WaLang;
  }): string {
    return L(
      opts.lang,
      `✅ Attached *${opts.name}* to your visit (${opts.whenLabel}).\n` +
        `Files on this visit: ${opts.count}/${opts.max}.\n` +
        `Your doctor can open it in the GlucoGuide visit screen.\n` +
        `Send another photo/PDF anytime, or reply *MY DOCS* / *STATUS*.`,
      `✅ *${opts.name}* आपकी विज़िट (${opts.whenLabel}) से जुड़ गई।\n` +
        `इस विज़िट पर फ़ाइलें: ${opts.count}/${opts.max}।\n` +
        `डॉक्टर इसे GlucoGuide विज़िट स्क्रीन में खोल सकते हैं।\n` +
        `और फ़ोटो/PDF भेज सकते हैं, या *MY DOCS* / *STATUS* लिखें।`,
    );
  },

  visitDocEmpty(lang?: WaLang): string {
    return L(
      lang,
      "No files on your open visit yet. Send a photo or PDF here to attach one.",
      "खुली विज़िट पर अभी कोई फ़ाइल नहीं है। जोड़ने के लिए फ़ोटो या PDF भेजें।",
    );
  },

  visitDocList(opts: {
    docs: string[];
    whenLabel: string;
    lang?: WaLang;
  }): string {
    const lines = opts.docs.map((n, i) => `${i + 1}. ${n}`).join("\n");
    return L(
      opts.lang,
      `Files on your visit (${opts.whenLabel}):\n${lines}\n\nSend another photo/PDF to add more (max 5).`,
      `आपकी विज़िट (${opts.whenLabel}) की फ़ाइलें:\n${lines}\n\nऔर जोड़ने के लिए फ़ोटो/PDF भेजें (अधिकतम 5)।`,
    );
  },

  idPhotoWrongStep(lang?: WaLang): string {
    return L(
      lang,
      "Got your photo. Finish this booking step with text, or reply *REGISTER* and send your ID again to autofill signup.\n" +
        "To attach a *visit report* instead, finish booking then send the file (or reply *REPORT*).",
      "फ़ोटो मिल गई। इस बुकिंग स्टेप को टेक्स्ट से पूरा करें, या *REGISTER* लिखकर ID फिर भेजें।\n" +
        "*विज़िट रिपोर्ट* जोड़ने के लिए बुकिंग पूरी करें फिर फ़ाइल भेजें (या *REPORT* लिखें)।",
    );
  },

  registered(
    opts: {
      name: string;
      continueToBook?: boolean;
    },
    lang?: WaLang,
  ): string {
    const next = opts.continueToBook
      ? L(lang, `\n\nContinuing to book your appointment…`, `\n\nअपॉइंटमेंट बुकिंग जारी…`)
      : L(
          lang,
          `\n\nReply *BOOK* to schedule a visit, or *HELP* for options.`,
          `\n\nविज़िट बुक करने के लिए *BOOK*, या विकल्पों के लिए *HELP* लिखें।`,
        );
    return (
      L(
        lang,
        `✅ Welcome, *${opts.name}*! Your patient profile is ready.`,
        `✅ स्वागत है, *${opts.name}*! आपका मरीज़ प्रोफ़ाइल तैयार है।`,
      ) + next
    );
  },

  alreadyRegistered(name: string, lang?: WaLang): string {
    return L(
      lang,
      `You're already registered${name ? ` as *${name}*` : ""}.\n` +
        `Reply *BOOK* to book, *STATUS* for visits, or *HELP* for the menu.`,
      `आप पहले से रजिस्टर्ड हैं${name ? ` (*${name}*)` : ""}।\n` +
        `बुक करने के लिए *BOOK*, विज़िट के लिए *STATUS*, या मेनू के लिए *HELP* लिखें।`,
    );
  },

  askDate(lang?: WaLang): string {
    return L(
      lang,
      "Which date? Reply *TODAY*, *TOMORROW*, or a date like *15-09-2026* / *2026-09-15*.",
      "कौन सी तारीख? *TODAY*, *TOMORROW*, या *15-09-2026* / *2026-09-15* जैसा लिखें।",
    );
  },

  dateInvalid(lang?: WaLang): string {
    return L(
      lang,
      "That date isn't clear. Reply *TODAY*, *TOMORROW*, or DD-MM-YYYY (e.g. *15-09-2026*).",
      "तारीख समझ नहीं आई। *TODAY*, *TOMORROW*, या DD-MM-YYYY लिखें (जैसे *15-09-2026*)।",
    );
  },

  datePast(lang?: WaLang): string {
    return L(
      lang,
      "That date is in the past. Reply *TODAY*, *TOMORROW*, or a future date (DD-MM-YYYY).",
      "वह तारीख बीत चुकी है। *TODAY*, *TOMORROW*, या आने वाली तारीख (DD-MM-YYYY) लिखें।",
    );
  },

  dateTooFar(lang?: WaLang): string {
    return L(
      lang,
      "Please pick a date within the next 6 months. Reply *TODAY*, *TOMORROW*, or DD-MM-YYYY.",
      "कृपया अगले 6 महीनों की तारीख चुनें। *TODAY*, *TOMORROW*, या DD-MM-YYYY लिखें।",
    );
  },

  noSlots(lang?: WaLang, suggested?: string): string {
    const hint = suggested
      ? L(
          lang,
          `\nNext open day: *${suggested}* — reply that date, *TODAY*, or *TOMORROW*.`,
          `\nअगला खाली दिन: *${suggested}* — वह तारीख, *TODAY*, या *TOMORROW* लिखें।`,
        )
      : L(
          lang,
          "\nTry another date: *TODAY*, *TOMORROW*, or DD-MM-YYYY.",
          "\nदूसरी तारीख आज़माएँ: *TODAY*, *TOMORROW*, या DD-MM-YYYY।",
        );
    return (
      L(
        lang,
        "No slots available for that day.",
        "उस दिन कोई स्लॉट उपलब्ध नहीं।",
      ) + hint
    );
  },

  askProvider(
    options: Array<{ index: number; name: string; detail?: string | null }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "No doctors are available at this clinic right now.",
        "इस क्लिनिक में अभी कोई डॉक्टर उपलब्ध नहीं है।",
      );
    }
    const lines = options.map((o) => {
      const detail = o.detail?.trim();
      return detail
        ? `${o.index}. *${o.name}*\n   ${detail}`
        : `${o.index}. *${o.name}*`;
    });
    return L(
      lang,
      `Which doctor?\n${lines.join("\n")}\n\nReply with the number or the doctor's name.`,
      `कौन सा डॉक्टर?\n${lines.join("\n")}\n\nनंबर या डॉक्टर का नाम लिखें।`,
    );
  },

  doctorsList(
    practiceName: string,
    options: Array<{ index: number; name: string; detail?: string | null }>,
    clinicUrl?: string | null,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        `No doctors are listed for *${practiceName}* right now. Reply *HELP* for options.`,
        `*${practiceName}* के लिए अभी कोई डॉक्टर सूचीबद्ध नहीं है। विकल्पों के लिए *HELP* लिखें।`,
      );
    }
    const lines = options.map((o) => {
      const detail = o.detail?.trim();
      return detail
        ? `${o.index}. *${o.name}*\n   ${detail}`
        : `${o.index}. *${o.name}*`;
    });
    const link = clinicUrl?.trim()
      ? L(lang, `\nClinic page: ${clinicUrl.trim()}`, `\nक्लिनिक पेज: ${clinicUrl.trim()}`)
      : "";
    return L(
      lang,
      `Doctors at *${practiceName}*:\n${lines.join("\n")}${link}\n\n` +
        `Reply *BOOK* to schedule a visit, or *HELP* for the menu.`,
      `*${practiceName}* के डॉक्टर:\n${lines.join("\n")}${link}\n\n` +
        `विज़िट बुक करने के लिए *BOOK*, या मेनू के लिए *HELP* लिखें।`,
    );
  },

  askMode(hasToken: boolean, hasTime: boolean, lang?: WaLang): string {
    const opts: string[] = [];
    if (hasTime) {
      opts.push(
        L(lang, "• *TIME* — pick a time slot", "• *TIME* — समय स्लॉट चुनें"),
      );
    }
    if (hasToken) {
      opts.push(
        L(lang, "• *TOKEN* — take a queue token", "• *TOKEN* — कतार का टोकन लें"),
      );
    }
    if (!opts.length) {
      return L(
        lang,
        "No booking modes are configured for that day.",
        "उस दिन के लिए कोई बुकिंग मोड सेट नहीं है।",
      );
    }
    return L(
      lang,
      `How would you like to book?\n${opts.join("\n")}`,
      `आप कैसे बुक करना चाहेंगे?\n${opts.join("\n")}`,
    );
  },

  askSlot(
    slots: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!slots.length) {
      return L(
        lang,
        "No open slots for that day. Try another date.",
        "उस दिन कोई खाली स्लॉट नहीं। दूसरी तारीख आज़माएँ।",
      );
    }
    const lines = slots.map((s) => `${s.index}. ${s.label}`);
    return L(
      lang,
      `Available slots:\n${lines.join("\n")}\n\nReply with the number to choose.`,
      `उपलब्ध स्लॉट:\n${lines.join("\n")}\n\nचुनने के लिए नंबर लिखें।`,
    );
  },

  askTokenConfirm(
    token: number,
    sessionStart: string,
    sessionEnd: string,
    date: string,
    lang?: WaLang,
  ): string {
    return L(
      lang,
      `Next token on ${date}: *#${token}* (${sessionStart}–${sessionEnd}).\n` +
        `Reply *YES* to confirm or *NO* to cancel.`,
      `${date} का अगला टोकन: *#${token}* (${sessionStart}–${sessionEnd})।\n` +
        `कन्फ़र्म करने के लिए *YES*, रद्द करने के लिए *NO* लिखें।`,
    );
  },

  askConfirm(summary: string, lang?: WaLang): string {
    return L(
      lang,
      `${summary}\n\nReply *YES* to confirm or *NO* to cancel.`,
      `${summary}\n\nकन्फ़र्म करने के लिए *YES*, रद्द करने के लिए *NO* लिखें।`,
    );
  },

  askCancelConfirm(summary: string, lang?: WaLang): string {
    return L(
      lang,
      `Cancel this booking?\n${summary}\n\nReply *YES* to cancel or *NO* to keep it.`,
      `यह बुकिंग रद्द करें?\n${summary}\n\nरद्द करने के लिए *YES*, रखने के लिए *NO* लिखें।`,
    );
  },

  askReschedulePick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "You have no active bookings to reschedule.",
        "रीशेड्यूल करने के लिए कोई सक्रिय बुकिंग नहीं है।",
      );
    }
    const lines = options.map((o) => `${o.index}. ${o.label}`);
    return L(
      lang,
      `Which booking should we reschedule?\n${lines.join("\n")}`,
      `किस बुकिंग का समय बदलें?\n${lines.join("\n")}`,
    );
  },

  fallback(lang?: WaLang): string {
    return L(
      lang,
      "Sorry, I didn't catch that. Reply *HELP* for options, or try REGISTER / DOCTORS / BOOK / STATUS / CANCEL / RESCHEDULE.",
      "समझ नहीं पाया/पाई। विकल्पों के लिए *HELP* लिखें, या REGISTER / DOCTORS / BOOK / STATUS / CANCEL / RESCHEDULE आज़माएँ।",
    );
  },

  practiceNotLinked(lang?: WaLang): string {
    return L(
      lang,
      "This WhatsApp number is not linked to a clinic yet.",
      "यह WhatsApp नंबर अभी किसी क्लिनिक से जुड़ा नहीं है।",
    );
  },

  voiceFailed(lang?: WaLang): string {
    return L(
      lang,
      "I received your voice note but couldn't transcribe it. Please send REGISTER, DOCTORS, BOOK, STATUS, CANCEL, or RESCHEDULE as text.",
      "वॉइस नोट मिला, लेकिन टेक्स्ट नहीं बना पाया/पाई। कृपया REGISTER, DOCTORS, BOOK, STATUS, CANCEL या RESCHEDULE टेक्स्ट में भेजें।",
    );
  },

  voiceSttNotConfigured(lang?: WaLang): string {
    return L(
      lang,
      "Voice notes aren't enabled on this line yet. Please type REGISTER, DOCTORS, BOOK, STATUS, CANCEL, or RESCHEDULE.",
      "इस लाइन पर वॉइस नोट अभी चालू नहीं हैं। कृपया REGISTER, DOCTORS, BOOK, STATUS, CANCEL या RESCHEDULE टाइप करें।",
    );
  },

  voiceProcessing(lang?: WaLang): string {
    return L(
      lang,
      "🎧 Got your voice note — converting to text…",
      "🎧 वॉइस नोट मिला — टेक्स्ट में बदल रहा/रही हूँ…",
    );
  },

  idleReset(lang?: WaLang): string {
    return L(
      lang,
      "Your previous chat timed out. Reply *HELP* to start again.",
      "पिछली चैट का समय खत्म हो गया। फिर से शुरू करने के लिए *HELP* लिखें।",
    );
  },

  // Short in-session acks only — full UTILITY copy is Meta catalog (or skipped for WHATSAPP_AI).
  bookingConfirmed(practiceName: string, detail: string, lang?: WaLang): string {
    return L(
      lang,
      `✅ Booked at *${practiceName}*.\n${detail}\n\n*STATUS* · *CANCEL* · *RESCHEDULE*`,
      `✅ *${practiceName}* पर बुकिंग हो गई।\n${detail}\n\n*STATUS* · *CANCEL* · *RESCHEDULE*`,
    );
  },

  canceled(lang?: WaLang): string {
    return L(
      lang,
      "✅ Cancelled. Reply *BOOK* for a new visit.",
      "✅ रद्द हो गई। नई विज़िट के लिए *BOOK* लिखें।",
    );
  },

  rescheduled(detail: string, lang?: WaLang): string {
    return L(
      lang,
      `✅ New time set.\n${detail}`,
      `✅ नया समय सेट।\n${detail}`,
    );
  },

  notConfigured(lang?: WaLang): string {
    return L(
      lang,
      "This clinic is not fully configured for WhatsApp booking yet.",
      "यह क्लिनिक WhatsApp बुकिंग के लिए अभी पूरी तरह सेट नहीं है।",
    );
  },

  patientsOnly(lang?: WaLang): string {
    return L(
      lang,
      "This WhatsApp assistant is for *patients* only.\n" +
        "Doctors and clinics manage bookings in the GlucoGuide web portal " +
        "(/doctor/queue, /doctor/practice) — not via this chat.",
      "यह WhatsApp सहायक सिर्फ *मरीज़ों* के लिए है।\n" +
        "डॉक्टर और क्लिनिक बुकिंग GlucoGuide वेब पोर्टल से मैनेज करते हैं " +
        "(/doctor/queue, /doctor/practice) — इस चैट से नहीं।",
    );
  },

  registrationCanceled(lang?: WaLang): string {
    return L(
      lang,
      "Registration canceled. Reply *REGISTER* or *BOOK* when ready.",
      "रजिस्ट्रेशन रद्द। तैयार होने पर *REGISTER* या *BOOK* लिखें।",
    );
  },

  bookingFlowCanceled(lang?: WaLang): string {
    return L(
      lang,
      "Okay, booking canceled. Reply BOOK when you're ready.",
      "ठीक है, बुकिंग रद्द। तैयार होने पर BOOK लिखें।",
    );
  },

  keptBooking(lang?: WaLang): string {
    return L(
      lang,
      "Kept your booking. Reply STATUS to review.",
      "बुकिंग रख ली गई। देखने के लिए STATUS लिखें।",
    );
  },

  bookingNotFound(lang?: WaLang): string {
    return L(lang, "Booking not found.", "बुकिंग नहीं मिली।");
  },

  noBookingSelected(lang?: WaLang): string {
    return L(lang, "No booking selected.", "कोई बुकिंग चुनी नहीं गई।");
  },

  tryBookAgain(msg: string, lang?: WaLang): string {
    return L(
      lang,
      `${msg}\nReply BOOK to try again.`,
      `${msg}\nफिर कोशिश के लिए BOOK लिखें।`,
    );
  },

  tryRegisterAgain(msg: string, lang?: WaLang): string {
    return L(
      lang,
      `${msg}\nReply *REGISTER* to try again.`,
      `${msg}\nफिर कोशिश के लिए *REGISTER* लिखें।`,
    );
  },

  handedOffWait(lang?: WaLang): string {
    return L(
      lang,
      "A clinic staff member may reply here.\n" +
        "To use the assistant again, reply *BOOK*, *STATUS*, *DOCTORS*, or *BOT*.",
      "क्लिनिक स्टाफ यहाँ जवाब दे सकता है।\n" +
        "असिस्टेंट फिर से चलाने के लिए *BOOK*, *STATUS*, *DOCTORS*, या *BOT* लिखें।",
    );
  },

  /** Patient replied on WA after a doctor care message — mirrored into portal/app. */
  careReplyReceived(lang?: WaLang): string {
    return L(
      lang,
      "Got it — your clinic can see this in the GlucoGuide portal and app. Reply *BOT* anytime for booking help.",
      "मिल गया — क्लिनिक इसे GlucoGuide पोर्टल और ऐप में देख सकता है। बुकिंग मदद के लिए कभी भी *BOT* लिखें।",
    );
  },
};

export function renderNotificationTemplate(
  type: string,
  payload: TemplatePayload,
): string {
  const templateKey = str(payload, "templateKey", type);
  const enriched: TemplatePayload = {
    ...payload,
    whenLabel: whenLabel(payload),
  };

  // One body source: Meta UTILITY catalog (same text as approved templates).
  const fromCatalog = renderUtilityTemplateBody(templateKey, enriched);
  if (fromCatalog) return fromCatalog;

  return withOptOut(
    `Appointment update from ${str(enriched, "practiceName", "your clinic")}.`,
    str(payload, "recipientRole"),
  );
}
