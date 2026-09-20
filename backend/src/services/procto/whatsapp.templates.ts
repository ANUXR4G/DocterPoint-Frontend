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
    return (
      L(
        lang,
        `${hello} Welcome to *${practiceName}*.\n\n` +
          `How can I help you? Tap *Menu* below to choose an option.`,
        `${hello} *${practiceName}* में आपका स्वागत है।\n\n` +
          `मैं कैसे मदद करूँ? विकल्प चुनने के लिए नीचे *Menu* दबाएँ।`,
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
        "Send a clear *photo or PDF* of your *Aadhaar / PAN / ID* (JPG/PNG/PDF), or type your *full name*.",
      "बुकिंग के लिए पहले छोटा मरीज़ प्रोफ़ाइल चाहिए।\n" +
        "अपने *आधार / पैन / ID* की साफ़ *फ़ोटो या PDF* (JPG/PNG/PDF) भेजें, या अपना *पूरा नाम* लिखें।",
    );
  },

  askRegisterName(lang?: WaLang): string {
    return L(
      lang,
      "Let's create your patient account.\n" +
        "Send a clear *photo or PDF* of your *Aadhaar / PAN / ID* (JPG/PNG/PDF), or type your *full name*.",
      "आइए आपका मरीज़ अकाउंट बनाते हैं।\n" +
        "अपने *आधार / पैन / ID* की साफ़ *फ़ोटो या PDF* (JPG/PNG/PDF) भेजें, या अपना *पूरा नाम* लिखें।",
    );
  },

  askRegisterGender(lang?: WaLang): string {
    return L(lang, "What is your gender?", "आपका लिंग क्या है?");
  },

  askRegisterEmail(lang?: WaLang): string {
    return L(
      lang,
      "What is your *email address*? (for your profile — you sign in with your mobile number)",
      "आपका *ईमेल पता* क्या है? (प्रोफ़ाइल के लिए — लॉगिन मोबाइल नंबर से होगा)",
    );
  },

  askRegisterEmailOpt(lang?: WaLang): string {
    return L(
      lang,
      "Would you like to add an *email* to your profile?\n" +
        "(You always sign in with your mobile number.)",
      "क्या आप प्रोफ़ाइल में *ईमेल* जोड़ना चाहते हैं?\n" +
        "(लॉगिन हमेशा मोबाइल नंबर से होगा।)",
    );
  },

  askRegisterConfirm(summary: string, thenBook?: boolean, lang?: WaLang): string {
    const next = thenBook
      ? L(lang, "\nAfter this we'll continue to *booking*.", "\nइसके बाद *बुकिंग* जारी रखेंगे।")
      : "";
    return L(
      lang,
      `Confirm registration:${next}\n${summary}`,
      `रजिस्ट्रेशन कन्फ़र्म करें:${next}\n${summary}`,
    );
  },

  idOcrProcessing(lang?: WaLang): string {
    return L(
      lang,
      "📄 Got your ID — reading details…",
      "📄 ID मिल गई — विवरण पढ़ रहा/रही हूँ…",
    );
  },

  idOcrNotConfigured(lang?: WaLang): string {
    return L(
      lang,
      "ID scan isn't enabled on this line yet. Please type your *full name* to register, " +
        "or reply *HELP* for options.",
      "इस लाइन पर ID स्कैन अभी चालू नहीं है। रजिस्टर करने के लिए अपना *पूरा नाम* लिखें, " +
        "या विकल्पों के लिए *HELP* लिखें।",
    );
  },

  idOcrFailed(lang?: WaLang): string {
    return L(
      lang,
      "I couldn't read that file. Send a clear, well-lit *photo or PDF* of your Aadhaar/PAN (JPG/PNG/PDF), " +
        "or type your *full name*.",
      "उस फ़ाइल को पढ़ नहीं पाया/पाई। आधार/पैन की साफ़ *फ़ोटो या PDF* (JPG/PNG/PDF) भेजें, " +
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
        `Or send another ID photo to try again.`,
      `ID से पढ़ा — रजिस्ट्रेशन कन्फ़र्म करें:${next}\n${summary}\n\n` +
        `फिर से कोशिश के लिए दूसरी ID फ़ोटो भेज सकते हैं।`,
    );
  },

  idOcrAlreadyRegistered(name: string, lang?: WaLang): string {
    return BotPrompts.alreadyRegistered(name, lang);
  },

  unsupportedMedia(lang?: WaLang): string {
    return L(
      lang,
      "Please send *text*, a *voice note*, an *ID photo/PDF* (to register), or a *report* (JPG/PNG/PDF) for your visit.\n" +
        "Reply *REPORT* for how to attach files, or *HELP* for options.",
      "कृपया *टेक्स्ट*, *वॉइस नोट*, रजिस्टर के लिए *ID फ़ोटो/PDF*, या विज़िट के लिए *रिपोर्ट* (JPG/PNG/PDF) भेजें।\n" +
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
        "Tip: for signup ID scan, reply *REGISTER* first, then send Aadhaar/PAN (JPG/PNG/PDF).\n" +
        "Reply *MY DOCS* to list files already attached.",
      "डॉक्टर से रिपोर्ट साझा करने के लिए:\n" +
        "1. अगर अपॉइंटमेंट नहीं है तो *BOOK* करें\n" +
        "2. यहाँ *फ़ोटो* या *PDF* भेजें (कैप्शन = फ़ाइल नाम)\n" +
        "3. क्लिनिक इसे GlucoGuide विज़िट में देखेगा\n\n" +
        "रजिस्टर ID स्कैन के लिए पहले *REGISTER*, फिर आधार/पैन (JPG/PNG/PDF) भेजें।\n" +
        "जुड़ी फ़ाइलें देखने के लिए *MY DOCS* लिखें।",
    );
  },

  visitDocNoBooking(lang?: WaLang): string {
    return L(
      lang,
      "I don’t see an open appointment to attach this to.\n" +
        "Reply *BOOK* to schedule, then send the file again.\n" +
        "Or reply *REGISTER* and send an ID photo/PDF to create your account.",
      "इस फ़ाइल को जोड़ने के लिए कोई खुली अपॉइंटमेंट नहीं मिली।\n" +
        "पहले *BOOK* करें, फिर फ़ाइल फिर भेजें।\n" +
        "या अकाउंट बनाने के लिए *REGISTER* लिखकर ID फ़ोटो/PDF भेजें।",
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
          `\n\nTap *Menu* below for options.`,
          `\n\nविकल्पों के लिए नीचे *Menu* दबाएँ।`,
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
        `Tap *Menu* below for options.`,
      `आप पहले से रजिस्टर्ड हैं${name ? ` (*${name}*)` : ""}।\n` +
        `विकल्पों के लिए नीचे *Menu* दबाएँ।`,
    );
  },

  askRegisterFamilyOpt(name: string, lang?: WaLang): string {
    const who = name ? ` (*${name}*)` : "";
    return L(
      lang,
      `You're already registered${who}.\n` +
        `Do you want to register a *family member*?\n` +
        `Tap *Yes* to add them, or *No* to go back.`,
      `आप पहले से रजिस्टर्ड हैं${who}।\n` +
        `क्या आप किसी *परिवार के सदस्य* को रजिस्टर करना चाहते हैं?\n` +
        `जोड़ने के लिए *Yes*, वापस जाने के लिए *No* दबाएँ।`,
    );
  },

  askRegisterFamilyName(lang?: WaLang): string {
    return L(
      lang,
      "Send a clear *photo or PDF* of their *Aadhaar / PAN / ID*, or type the *family member's full name*.",
      "उनके *आधार / पैन / ID* की साफ़ *फ़ोटो या PDF* भेजें, या *परिवार के सदस्य का पूरा नाम* लिखें।",
    );
  },

  askRegisterFamilyGender(lang?: WaLang): string {
    return L(
      lang,
      "What is your family member's gender?",
      "आपके परिवार के सदस्य का लिंग क्या है?",
    );
  },

  askRegisterFamilyPhone(lang?: WaLang): string {
    return L(
      lang,
      "Type your *family member's mobile number* (with country code if outside India, e.g. 9715xxxxxxx or 9876543210).\n" +
        "They will use this number to sign in.",
      "अपने *परिवार के सदस्य का मोबाइल नंबर* लिखें (भारत के बाहर हो तो कंट्री कोड सहित, जैसे 9715xxxxxxx या 9876543210)।\n" +
        "लॉगिन इसी नंबर से होगा।",
    );
  },

  familyRegistered(name: string, lang?: WaLang): string {
    return L(
      lang,
      `✅ Family member *${name}* is registered.\n` +
        `They can sign in with their mobile number. Tap *Menu* to book for them or yourself.`,
      `✅ परिवार के सदस्य *${name}* रजिस्टर हो गए।\n` +
        `वे अपने मोबाइल नंबर से साइन इन कर सकते हैं। बुकिंग के लिए *Menu* दबाएँ।`,
    );
  },

  askDate(lang?: WaLang): string {
    return L(
      lang,
      "Which date?\nTap *Dates* below to choose.",
      "कौन सी तारीख?\nचुनने के लिए नीचे *Dates* दबाएँ।",
    );
  },

  doctorSelectedAskDate(
    doctorName: string,
    suggested?: string | null,
    lang?: WaLang,
  ): string {
    const head = L(
      lang,
      `✅ *${doctorName}* selected.\n\n`,
      `✅ *${doctorName}* चुने गए।\n\n`,
    );
    const hint = suggested
      ? L(
          lang,
          `\n\n💡 Next open day: *${suggested}*.`,
          `\n\n💡 अगला खाली दिन: *${suggested}*।`,
        )
      : "";
    return head + BotPrompts.askDate(lang) + hint;
  },

  dateInvalid(lang?: WaLang): string {
    return L(
      lang,
      "That date isn't clear. Tap *Dates* below to choose again.",
      "तारीख समझ नहीं आई। फिर से चुनने के लिए नीचे *Dates* दबाएँ।",
    );
  },

  voiceDateUnclear(lang?: WaLang): string {
    return L(
      lang,
      "I couldn't catch a clear date in your voice note.\n" +
        "Tap *Dates* below to choose.",
      "वॉइस नोट में तारीख साफ़ नहीं मिली।\n" +
        "चुनने के लिए नीचे *Dates* दबाएँ।",
    );
  },

  datePast(lang?: WaLang): string {
    return L(
      lang,
      "That date is in the past. Tap *Dates* below to choose a future day.",
      "वह तारीख बीत चुकी है। आने वाला दिन चुनने के लिए नीचे *Dates* दबाएँ।",
    );
  },

  dateTooFar(lang?: WaLang): string {
    return L(
      lang,
      "Please pick a date within the next 6 months — tap *Dates* below.",
      "कृपया अगले 6 महीनों की तारीख चुनें — नीचे *Dates* दबाएँ।",
    );
  },

  noSlots(lang?: WaLang, suggested?: string): string {
    const hint = suggested
      ? L(
          lang,
          `\nNext open day: *${suggested}* — tap *Dates* below.`,
          `\nअगला खाली दिन: *${suggested}* — नीचे *Dates* दबाएँ।`,
        )
      : L(
          lang,
          "\nTap *Dates* below to try another day.",
          "\nदूसरा दिन आज़माने के लिए नीचे *Dates* दबाएँ।",
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
    return L(
      lang,
      "Choose your doctor — tap *Doctors* below.",
      "अपना डॉक्टर चुनें — नीचे *Doctors* दबाएँ।",
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
        `No doctors are listed for *${practiceName}* right now. Tap *Menu* for options.`,
        `*${practiceName}* के लिए अभी कोई डॉक्टर सूचीबद्ध नहीं है। विकल्पों के लिए *Menu* दबाएँ।`,
      );
    }
    const link = clinicUrl?.trim()
      ? L(lang, `\nClinic page: ${clinicUrl.trim()}`, `\nक्लिनिक पेज: ${clinicUrl.trim()}`)
      : "";
    return L(
      lang,
      `Doctors at *${practiceName}* — tap *Doctors* below to view or pick one.${link}`,
      `*${practiceName}* के डॉक्टर — देखने या चुनने के लिए नीचे *Doctors* दबाएँ।${link}`,
    );
  },

  askMode(hasToken: boolean, hasTime: boolean, lang?: WaLang): string {
    if (!hasToken && !hasTime) {
      return L(
        lang,
        "No booking modes are configured for that day.",
        "उस दिन के लिए कोई बुकिंग मोड सेट नहीं है।",
      );
    }
    return L(
      lang,
      "How would you like to book?",
      "आप कैसे बुक करना चाहेंगे?",
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
    return L(
      lang,
      "Pick a time below.",
      "नीचे समय चुनें।",
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
      `Next token on ${date}: *#${token}* (${sessionStart}–${sessionEnd}).`,
      `${date} का अगला टोकन: *#${token}* (${sessionStart}–${sessionEnd})।`,
    );
  },

  askConfirm(summary: string, lang?: WaLang): string {
    return L(lang, summary, summary);
  },

  askCancelConfirm(summary: string, lang?: WaLang): string {
    return L(
      lang,
      `Cancel this booking?\n${summary}`,
      `यह बुकिंग रद्द करें?\n${summary}`,
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
    return L(
      lang,
      "Which booking should we reschedule? Choose below.",
      "किस बुकिंग का समय बदलें? नीचे चुनें।",
    );
  },

  fallback(lang?: WaLang): string {
    return L(
      lang,
      "Sorry, I didn't catch that. Tap *Menu* below for options.",
      "समझ नहीं पाया/पाई। विकल्पों के लिए नीचे *Menu* दबाएँ।",
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
      "Your voice note wasn't clear enough for me to understand.\n" +
        "Please send another voice note a bit slower, or tap *Menu* below.",
      "आपका वॉइस नोट साफ़ समझ नहीं आया।\n" +
        "कृपया थोड़ा धीरे दूसरा वॉइस नोट भेजें, या नीचे *Menu* दबाएँ।",
    );
  },

  voiceUnclear(lang?: WaLang): string {
    return BotPrompts.voiceFailed(lang);
  },

  voiceSttNotConfigured(lang?: WaLang): string {
    return L(
      lang,
      "Voice notes aren't enabled on this line yet. Please type what you need in your own words — e.g. *Book tomorrow at 10 am*, *Status*, or *Register*.",
      "इस लाइन पर वॉइस नोट अभी चालू नहीं हैं। अपनी बात सीधे लिखें — जैसे *कल 10 बजे बुक*, *Status*, या *Register*।",
    );
  },

  voiceProcessing(lang?: WaLang): string {
    return L(
      lang,
      "🎧 Got your voice note — listening…",
      "🎧 वॉइस नोट मिला — सुन रहा/रही हूँ…",
    );
  },

  voiceHeard(transcript: string, lang?: WaLang): string {
    const short =
      transcript.length > 120 ? `${transcript.slice(0, 117)}…` : transcript;
    return L(
      lang,
      `Heard: "_${short}_"`,
      `सुना: "_${short}_"`,
    );
  },

  idleReset(lang?: WaLang): string {
    return L(
      lang,
      "Your previous chat timed out. Tap *Menu* below to start again.",
      "पिछली चैट का समय खत्म हो गया। फिर से शुरू करने के लिए नीचे *Menu* दबाएँ।",
    );
  },

  // Short in-session acks only — full UTILITY copy is Meta catalog (or skipped for WHATSAPP_AI).
  bookingConfirmed(practiceName: string, detail: string, lang?: WaLang): string {
    return L(
      lang,
      `✅ Booked at *${practiceName}*.\n${detail}\n\n` +
        `What would you like to do next? Choose below.`,
      `✅ *${practiceName}* पर बुकिंग हो गई।\n${detail}\n\n` +
        `अब क्या करना है? नीचे से चुनें।`,
    );
  },

  /** After an active booking — reschedule / cancel / new book / message doctor. */
  postBookingAsk(
    practiceName: string,
    whenDetail?: string | null,
    lang?: WaLang,
  ): string {
    const when = whenDetail?.trim()
      ? L(lang, `\nYour visit: *${whenDetail.trim()}*`, `\nआपकी विज़िट: *${whenDetail.trim()}*`)
      : "";
    return L(
      lang,
      `Hi — you already have a booking at *${practiceName}*.${when}\n\n` +
        `What do you want to do?\n` +
        `1️⃣ Reschedule\n` +
        `2️⃣ Cancel\n` +
        `3️⃣ New booking\n` +
        `4️⃣ Message your doctor`,
      `नमस्ते — *${practiceName}* पर आपकी बुकिंग पहले से है।${when}\n\n` +
        `आप क्या करना चाहते हैं?\n` +
        `1️⃣ रीशेड्यूल\n` +
        `2️⃣ रद्द करें\n` +
        `3️⃣ नई बुकिंग\n` +
        `4️⃣ डॉक्टर को संदेश`,
    );
  },

  messageDoctorHandoff(lang?: WaLang): string {
    return L(
      lang,
      "Okay — write your message for your doctor here.\n" +
        "The clinic will see it in GlucoGuide. Reply *BOT* anytime for booking help.",
      "ठीक है — डॉक्टर के लिए अपना संदेश यहाँ लिखें।\n" +
        "क्लिनिक इसे GlucoGuide में देखेगा। बुकिंग मदद के लिए कभी भी *BOT* लिखें।",
    );
  },

  canceled(lang?: WaLang): string {
    return L(
      lang,
      "✅ Cancelled. Tap *Menu* below for options.",
      "✅ रद्द हो गई। विकल्पों के लिए नीचे *Menu* दबाएँ।",
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
      "Registration canceled. Tap *Menu* below when you're ready.",
      "रजिस्ट्रेशन रद्द। तैयार होने पर नीचे *Menu* दबाएँ।",
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
