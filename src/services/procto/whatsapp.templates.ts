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
  /** Numbered 1–9 options — always shown with the main menu. */
  mainMenuOptions(lang?: WaLang): string {
    return L(
      lang,
      "*Main menu*\n" +
        "1 · Book — doctor, date, slot\n" +
        "2 · Doctors — see doctor list\n" +
        "3 · Status — upcoming visits\n" +
        "4 · Register — create patient profile\n" +
        "5 · FAQ — clinic info & fees\n" +
        "6 · Cancel — cancel a visit\n" +
        "7 · Reschedule — change date/time\n" +
        "8 · Language — English / हिंदी\n" +
        "9 · Attach document — send a report to your doctor\n\n" +
        "Reply with a *number* (1–9) or tap *Menu* below.",
      "*मुख्य मेनू*\n" +
        "1 · बुक — डॉक्टर, तारीख, स्लॉट\n" +
        "2 · डॉक्टर — सूची देखें\n" +
        "3 · स्टेटस — आने वाली विज़िट\n" +
        "4 · रजिस्टर — मरीज़ प्रोफ़ाइल\n" +
        "5 · FAQ — क्लिनिक जानकारी व शुल्क\n" +
        "6 · रद्द — विज़िट रद्द करें\n" +
        "7 · रीशेड्यूल — तारीख/समय बदलें\n" +
        "8 · भाषा — English / हिंदी\n" +
        "9 · दस्तावेज़ भेजें — डॉक्टर को रिपोर्ट\n\n" +
        "*संख्या* (1–9) लिखें या नीचे *Menu* दबाएँ।",
    );
  },

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
        `${hello} Welcome to *${practiceName}*.\n\n`,
        `${hello} *${practiceName}* में आपका स्वागत है।\n\n`,
      ) + BotPrompts.mainMenuOptions(lang)
    );
  },

  help(practiceName: string, patientName?: string | null, lang?: WaLang): string {
    const hello = patientName
      ? L(lang, `Hi *${patientName}*!`, `नमस्ते *${patientName}*!`)
      : L(lang, "Hi!", "नमस्ते!");
    return (
      L(
        lang,
        `${hello} Here's how I can help at *${practiceName}*:\n\n`,
        `${hello} *${practiceName}* पर मैं इस तरह मदद कर सकता/सकती हूँ:\n\n`,
      ) + BotPrompts.mainMenuOptions(lang)
    );
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
      "To send a report to your doctor:\n" +
        "1. You need an *open booking* (*Menu* → *Book* if you don’t have one)\n" +
        "2. Send a *photo* or *PDF* in this chat now\n" +
        "3. Your doctor sees it on the visit in GlucoGuide (web + app)\n\n" +
        "Waiting for your file…\n" +
        "Or reply *No* / *SKIP* to cancel.\n" +
        "Tip: for signup ID scan, use *Menu* → *Register*, then send Aadhaar/PAN.\n" +
        "Reply *MY DOCS* to list files already attached.",
      "डॉक्टर को रिपोर्ट भेजने के लिए:\n" +
        "1. एक *खुली बुकिंग* चाहिए (नहीं है तो *Menu* → *Book*)\n" +
        "2. *अभी फ़ोटो या PDF* भेजें\n" +
        "3. डॉक्टर इसे GlucoGuide विज़िट (वेब + ऐप) में देखेंगे\n\n" +
        "आपकी फ़ाइल का इंतज़ार है…\n" +
        "रद्द करने के लिए *No* / *SKIP* लिखें।\n" +
        "रजिस्टर ID स्कैन: *Menu* → *Register*, फिर आधार/पैन भेजें।\n" +
        "जुड़ी फ़ाइलें: *MY DOCS*।",
    );
  },

  visitDocNoBooking(lang?: WaLang): string {
    return L(
      lang,
      "I don’t see an open appointment to attach this to.\n" +
        "Tap *Menu* → *Book* (or reply *Book*), then send the file again.\n" +
        "Or tap *Menu* → *Register* and send an ID photo/PDF.",
      "इस फ़ाइल को जोड़ने के लिए कोई खुली अपॉइंटमेंट नहीं मिली।\n" +
        "*Menu* → *Book* (या *Book* लिखें), फिर फ़ाइल भेजें।\n" +
        "या *Menu* → *Register* करके ID फ़ोटो/PDF भेजें।",
    );
  },

  visitDocBookingClosed(lang?: WaLang): string {
    return L(
      lang,
      "That visit is already closed, so I can’t add more files. Tap *Menu* → *Book* for a new appointment.",
      "वह विज़िट बंद हो चुकी है — और फ़ाइलें नहीं जोड़ सकते। नई अपॉइंटमेंट के लिए *Menu* → *Book*।",
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
      `✅ Your report has been sent to the doctor.\n` +
        `File: *${opts.name}* · Visit: ${opts.whenLabel}\n` +
        `They can open it in GlucoGuide (dashboard + app). Files on this visit: ${opts.count}/${opts.max}.\n` +
        `Reply *Menu* anytime for more options.`,
      `✅ आपकी रिपोर्ट डॉक्टर को भेज दी गई है।\n` +
        `फ़ाइल: *${opts.name}* · विज़िट: ${opts.whenLabel}\n` +
        `डॉक्टर इसे GlucoGuide (डैशबोर्ड + ऐप) में देख सकते हैं। इस विज़िट पर फ़ाइलें: ${opts.count}/${opts.max}।\n` +
        `और विकल्पों के लिए कभी भी *Menu* लिखें।`,
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
    const lines = options.map((o) => {
      const detail = o.detail?.trim() ? ` — ${o.detail.trim()}` : "";
      return `${o.index}. ${o.name}${detail}`;
    });
    return L(
      lang,
      `Choose your doctor (reply with a *number*, or tap *Doctors* below):\n${lines.join("\n")}`,
      `अपना डॉक्टर चुनें (*संख्या* लिखें, या नीचे *Doctors* दबाएँ):\n${lines.join("\n")}`,
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
    const lines = options.map((o) => {
      const detail = o.detail?.trim() ? ` — ${o.detail.trim()}` : "";
      return `${o.index}. ${o.name}${detail}`;
    });
    const link = clinicUrl?.trim()
      ? L(
          lang,
          `\n\nClinic page (open on your phone):\n${clinicUrl.trim()}`,
          `\n\nक्लिनिक पेज (फ़ोन पर खोलें):\n${clinicUrl.trim()}`,
        )
      : "";
    return L(
      lang,
      `Doctors at *${practiceName}*:\n${lines.join("\n")}${link}\n\nTo book with one of them, tap *Menu* → *Book* (or reply *1*).`,
      `*${practiceName}* के डॉक्टर:\n${lines.join("\n")}${link}\n\nबुकिंग के लिए *Menu* → *Book* (या *1* लिखें)।`,
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
      `Are you sure you want to cancel this booking?\n*${summary}*\n\nReply *Yes* to confirm, or *No* to keep it.`,
      `क्या आप वाकई यह बुकिंग रद्द करना चाहते हैं?\n*${summary}*\n\nपुष्टि के लिए *Yes*, रखने के लिए *No* लिखें।`,
    );
  },

  askCancelPick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "You have no active bookings to cancel.",
        "रद्द करने के लिए कोई सक्रिय बुकिंग नहीं है।",
      );
    }
    if (options.length === 1) {
      return L(
        lang,
        `Which booking do you want to cancel?\n*${options[0]!.label}*`,
        `कौन सी बुकिंग रद्द करनी है?\n*${options[0]!.label}*`,
      );
    }
    return L(
      lang,
      `You have *${options.length}* bookings. Tap the one to cancel:`,
      `आपकी *${options.length}* बुकिंग हैं। रद्द करने वाली चुनें:`,
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

  askReportPick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "You have no open visits to attach a document to.\nTap *Menu* → *Book* first.",
        "दस्तावेज़ जोड़ने के लिए कोई खुली विज़िट नहीं है।\nपहले *Menu* → *Book* करें।",
      );
    }
    if (options.length === 1) {
      return L(
        lang,
        `Attach a report to this visit?\n*${options[0]!.label}*\n\nSend a *photo* or *PDF* now.`,
        `इस विज़िट पर रिपोर्ट जोड़ें?\n*${options[0]!.label}*\n\nअभी *फ़ोटो* या *PDF* भेजें।`,
      );
    }
    return L(
      lang,
      `You have *${options.length}* open visits. Which one should get the document?\n` +
        options.map((o) => `${o.index}. ${o.label}`).join("\n") +
        `\n\nTap a visit below, or reply with a *number*.`,
      `आपकी *${options.length}* खुली विज़िट हैं। दस्तावेज़ किस पर जोड़ें?\n` +
        options.map((o) => `${o.index}. ${o.label}`).join("\n") +
        `\n\nनीचे विज़िट चुनें, या *संख्या* लिखें।`,
    );
  },

  askReportForVisit(visitLabel: string, lang?: WaLang): string {
    const visit = visitLabel.trim();
    return L(
      lang,
      `Send a *photo* or *PDF* for this visit:\n*${visit}*\n\n` +
        `It goes to your doctor in GlucoGuide (web + app).\n` +
        `Or reply *No* / *SKIP* to cancel.`,
      `इस विज़िट के लिए *फ़ोटो* या *PDF* भेजें:\n*${visit}*\n\n` +
        `यह डॉक्टर की GlucoGuide (वेब + ऐप) पर जाएगी।\n` +
        `रद्द करने के लिए *No* / *SKIP* लिखें।`,
    );
  },

  askMessageDoctorPick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "You have no active appointments to message a doctor about.",
        "डॉक्टर को संदेश भेजने के लिए कोई सक्रिय अपॉइंटमेंट नहीं है।",
      );
    }
    return L(
      lang,
      "Which appointment's doctor should we message? Choose below.",
      "किस अपॉइंटमेंट के डॉक्टर को संदेश भेजें? नीचे चुनें।",
    );
  },

  askBookPatientPick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "No patient profiles found on this number. Reply *REGISTER* to add one.",
        "इस नंबर पर कोई मरीज़ प्रोफ़ाइल नहीं मिली। जोड़ने के लिए *REGISTER* लिखें।",
      );
    }
    return L(
      lang,
      "Who is this booking for?\nChoose *yourself* or a *family member* below.",
      "यह बुकिंग किसके लिए है?\nनीचे *अपने लिए* या *परिवार के सदस्य* को चुनें।",
    );
  },

  bookPatientSelected(name: string, isSelf: boolean, lang?: WaLang): string {
    if (isSelf) {
      return L(
        lang,
        `Booking for *you* (${name}).`,
        `बुकिंग *आपके* लिए (${name})।`,
      );
    }
    return L(
      lang,
      `Booking for family member *${name}*.`,
      `बुकिंग परिवार के सदस्य *${name}* के लिए।`,
    );
  },

  noBookingForMessageDoctor(lang?: WaLang): string {
    return L(
      lang,
      "No active appointment found to message a doctor. Tap *Menu* → *Book* to schedule one.",
      "डॉक्टर को संदेश के लिए कोई सक्रिय अपॉइंटमेंट नहीं मिली। बुक करने के लिए *Menu* → *Book*।",
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

  /** Proactive nudge when the patient goes quiet mid-flow. */
  idleReminder(lang?: WaLang): string {
    return L(
      lang,
      "Are you still there? Reply to continue — this chat will close soon if there's no reply.",
      "क्या आप अभी भी यहाँ हैं? जारी रखने के लिए जवाब दें — जवाब न आने पर यह चैट जल्द बंद हो जाएगी।",
    );
  },

  /** After idle close (proactive or on next message). */
  chatClosed(lang?: WaLang): string {
    return L(
      lang,
      "This chat is now closed. Tap *Menu* below anytime to start again.",
      "यह चैट अब बंद हो गई है। फिर से शुरू करने के लिए कभी भी नीचे *Menu* दबाएँ।",
    );
  },

  /** @deprecated Prefer chatClosed — kept for call sites / older wording. */
  idleReset(lang?: WaLang): string {
    return BotPrompts.chatClosed(lang);
  },

  // Short in-session acks only — full UTILITY copy is Meta catalog (or skipped for WHATSAPP_AI).
  bookingConfirmed(practiceName: string, detail: string, lang?: WaLang): string {
    return L(
      lang,
      `✅ Booked at *${practiceName}*.\n${detail}`,
      `✅ *${practiceName}* पर बुकिंग हो गई।\n${detail}`,
    );
  },

  askAttachDocument(lang?: WaLang): string {
    return L(
      lang,
      "Would you like to send a *report or document* to your doctor?\n\n" +
        "Tap *Yes* or *No* below.",
      "क्या आप डॉक्टर को कोई *रिपोर्ट या दस्तावेज़* भेजना चाहेंगे?\n\n" +
        "नीचे *Yes* या *No* दबाएँ।",
    );
  },

  askAttachDocumentNow(lang?: WaLang): string {
    return L(
      lang,
      "Please send a *photo* or *PDF* of your report now.\n" +
        "It goes to your doctor’s visit in GlucoGuide (web + app).\n\n" +
        "Or reply *No* / *SKIP* to continue without a document.",
      "कृपया अभी अपनी रिपोर्ट की *फ़ोटो* या *PDF* भेजें।\n" +
        "यह डॉक्टर की GlucoGuide विज़िट (वेब + ऐप) पर जाएगी।\n\n" +
        "बिना दस्तावेज़ के आगे बढ़ने के लिए *No* / *SKIP* लिखें।",
    );
  },

  attachDocumentSkipped(lang?: WaLang): string {
    return L(
      lang,
      "Okay — no document sent. You can attach one later via *Menu* → *Report*, or post-visit menu option *5*.",
      "ठीक है — कोई दस्तावेज़ नहीं भेजा। बाद में *Menu* → *Report*, या विज़िट मेनू विकल्प *5* से जोड़ सकते हैं।",
    );
  },

  /** After active booking(s) — interactive menu has the actions. */
  postBookingAsk(
    practiceName: string,
    whenDetail?: string | string[] | null,
    lang?: WaLang,
  ): string {
    const visits = (
      Array.isArray(whenDetail)
        ? whenDetail
        : whenDetail
          ? [whenDetail]
          : []
    )
      .map((v) => String(v).trim())
      .filter(Boolean);

    if (visits.length === 0) {
      return L(
        lang,
        `Hi — you already have a booking at *${practiceName}*.\n\n` +
          `Tap *Menu* below to choose an option.`,
        `नमस्ते — *${practiceName}* पर आपकी बुकिंग पहले से है।\n\n` +
          `विकल्प चुनने के लिए नीचे *Menu* दबाएँ।`,
      );
    }

    if (visits.length === 1) {
      return L(
        lang,
        `Hi — you already have a booking at *${practiceName}*.\n` +
          `Your visit: *${visits[0]}*\n\n` +
          `Tap *Menu* below to choose an option.`,
        `नमस्ते — *${practiceName}* पर आपकी बुकिंग पहले से है।\n` +
          `आपकी विज़िट: *${visits[0]}*\n\n` +
          `विकल्प चुनने के लिए नीचे *Menu* दबाएँ।`,
      );
    }

    const numbered = visits.map((v, i) => `${i + 1}. *${v}*`).join("\n");
    return L(
      lang,
      `Hi — you have *${visits.length}* bookings at *${practiceName}*:\n` +
        `${numbered}\n\n` +
        `Tap *Menu* below to choose an option.`,
      `नमस्ते — *${practiceName}* पर आपकी *${visits.length}* बुकिंग हैं:\n` +
        `${numbered}\n\n` +
        `विकल्प चुनने के लिए नीचे *Menu* दबाएँ।`,
    );
  },

  messageDoctorHandoff(
    lang?: WaLang,
    opts?: { doctorName?: string | null; whenLabel?: string | null },
  ): string {
    const doc = opts?.doctorName?.trim();
    const when = opts?.whenLabel?.trim();
    const who = doc
      ? L(lang, ` your doctor *${doc}*`, ` अपने डॉक्टर *${doc}*`)
      : L(lang, " your doctor", " अपने डॉक्टर");
    const visit = when
      ? L(lang, `\nVisit: *${when}*`, `\nविज़िट: *${when}*`)
      : "";
    return L(
      lang,
      `Okay — write your message for${who} here.${visit}\n` +
        `The clinic will see it in GlucoGuide. Reply *BOT* anytime for booking help.`,
      `ठीक है —${who} के लिए अपना संदेश यहाँ लिखें।${visit}\n` +
        `क्लिनिक इसे GlucoGuide में देखेगा। बुकिंग मदद के लिए कभी भी *BOT* लिखें।`,
    );
  },

  askCancelReason(visitLabel?: string, lang?: WaLang): string {
    const visit = visitLabel?.trim()
      ? L(lang, `\nVisit: *${visitLabel.trim()}*`, `\nविज़िट: *${visitLabel.trim()}*`)
      : "";
    return L(
      lang,
      `Please share a short reason for cancelling.${visit}\n` +
        `Example: feeling better / schedule conflict / booked elsewhere.\n\n` +
        `• Reply *SKIP* to cancel without a reason\n` +
        `• Reply *NO* to keep this booking`,
      `कृपया रद्द करने का छोटा सा कारण लिखें।${visit}\n` +
        `उदाहरण: तकलीफ़ कम हो गई / समय नहीं मिल रहा / कहीं और बुक है।\n\n` +
        `• बिना कारण के रद्द: *SKIP*\n` +
        `• बुकिंग रखने के लिए: *NO* / *नहीं*`,
    );
  },

  canceled(lang?: WaLang): string {
    return L(
      lang,
      "✅ Cancelled.\nTap *Menu* below for the full options list (Book, Status, …).",
      "✅ रद्द हो गई।\nपूरे विकल्पों (बुक, स्टेटस, …) के लिए नीचे *Menu* दबाएँ।",
    );
  },

  canceledWithReason(
    reason: string | null,
    lang?: WaLang,
    opts?: { hasMoreVisits?: boolean },
  ): string {
    const more = opts?.hasMoreVisits
      ? L(
          lang,
          "\nYou still have other visits — use the menu below.",
          "\nआपकी और विज़िट हैं — नीचे मेनू देखें।",
        )
      : L(
          lang,
          "\nTap *Menu* below for Book, Status, and more.",
          "\nबुक, स्टेटस आदि के लिए नीचे *Menu* दबाएँ।",
        );
    if (reason) {
      return L(
        lang,
        `✅ Cancelled.\nReason shared with your doctor: *${reason}*${more}`,
        `✅ रद्द हो गई।\nडॉक्टर को कारण भेज दिया: *${reason}*${more}`,
      );
    }
    return L(lang, `✅ Cancelled.${more}`, `✅ रद्द हो गई।${more}`);
  },

  keptBooking(lang?: WaLang): string {
    return L(
      lang,
      "Okay — your booking is *kept*.\nTap *Menu* below if you need anything else.",
      "ठीक है — आपकी बुकिंग *रखी गई* है।\nऔर मदद के लिए नीचे *Menu* दबाएँ।",
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

  patientsOnly(lang?: WaLang, webOrigin?: string | null): string {
    const base = (webOrigin || "").replace(/\/$/, "");
    const queue = base ? `${base}/doctor/queue` : "Doctor Queue (web)";
    const practice = base
      ? `${base}/settings?tab=practice`
      : "Practice settings (web)";
    return L(
      lang,
      "This WhatsApp assistant is for *patients* only.\n" +
        "Doctors and clinics manage bookings in the GlucoGuide web portal:\n" +
        `• Queue: ${queue}\n` +
        `• Practice: ${practice}\n` +
        "— not via this chat.",
      "यह WhatsApp सहायक सिर्फ *मरीज़ों* के लिए है।\n" +
        "डॉक्टर और क्लिनिक बुकिंग GlucoGuide वेब पोर्टल से मैनेज करते हैं:\n" +
        `• कतार: ${queue}\n` +
        `• क्लिनिक: ${practice}\n` +
        "— इस चैट से नहीं।",
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
      "Okay — that booking step is cancelled.\nTap *Menu* below, then *Book* when you're ready.",
      "ठीक है — वह बुकिंग चरण रद्द है।\nनीचे *Menu* दबाएँ, फिर तैयार होने पर *Book* चुनें।",
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
