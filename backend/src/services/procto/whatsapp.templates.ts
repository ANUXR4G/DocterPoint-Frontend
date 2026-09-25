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
import { formatPracticeDateTime } from "./slotEngine.js";

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
    if (!Number.isNaN(d.getTime())) return formatPracticeDateTime(d);
  }
  if (payload.newWhen) return str(payload, "newWhen");
  return "your scheduled time";
}

function withOptOut(body: string, audience?: string): string {
  if (audience === "clinic") return body;
  if (body.includes("STOP to opt out") || body.includes("STOP लिखें")) return body;
  return body + OPT_OUT_FOOTER;
}

/** First token of a full name for compact Self labels (buttons / Branch A). */
export function firstGivenName(full: string | null | undefined): string {
  const t = String(full || "").trim();
  if (!t) return "";
  return t.split(/\s+/)[0] || t;
}

export const BotPrompts = {
  /** Numbered 1–6 options — always shown with the main interactive menu. */
  mainMenuOptions(lang?: WaLang): string {
    return L(
      lang,
      "*Main menu*\n" +
        "1 · Book New Appointment\n" +
        "2 · View / Manage Existing Bookings\n" +
        "3 · Register Family Member / Dependant\n" +
        "4 · Talk to Support / Agent\n" +
        "5 · Message to Doctor\n" +
        "6 · Attach Document\n\n" +
        "Reply with a *number* (1–6) or tap *Menu* below.",
      "*मुख्य मेनू*\n" +
        "1 · नई अपॉइंटमेंट बुक करें\n" +
        "2 · बुकिंग देखें / मैनेज करें\n" +
        "3 · परिवार सदस्य रजिस्टर करें\n" +
        "4 · सपोर्ट / एजेंट से बात करें\n" +
        "5 · डॉक्टर को संदेश\n" +
        "6 · दस्तावेज़ भेजें\n\n" +
        "*संख्या* (1–6) लिखें या नीचे *Menu* दबाएँ।",
    );
  },

  /**
   * Entry greeting after phone lookup.
   * - `patientName` null/undefined → new number (clinic intro + menu)
   * - string (incl. empty) → known patient in DB (welcome back + menu)
   */
  welcome(
    practiceName: string,
    patientName?: string | null,
    lang?: WaLang,
  ): string {
    const known = patientName !== null && patientName !== undefined;
    const name = known ? String(patientName).trim() : "";

    if (known) {
      return (
        L(
          lang,
          name
            ? `Welcome back, *${name}*! How can I assist you today?\n\n`
            : `Welcome back! How can I assist you today?\n\n`,
          name
            ? `वापसी पर स्वागत है, *${name}*! आज मैं आपकी कैसे मदद करूँ?\n\n`
            : `वापसी पर स्वागत है! आज मैं आपकी कैसे मदद करूँ?\n\n`,
        ) + BotPrompts.mainMenuOptions(lang)
      );
    }

    return (
      L(
        lang,
        `Welcome to *${practiceName}*! I can help you schedule appointments, contact your doctor, attach documents, or manage your profile.\n\n`,
        `*${practiceName}* में आपका स्वागत है! मैं अपॉइंटमेंट शेड्यूल करने, डॉक्टर से संपर्क, दस्तावेज़ भेजने, या प्रोफ़ाइल मैनेज करने में मदद कर सकता/सकती हूँ।\n\n`,
      ) + BotPrompts.mainMenuOptions(lang)
    );
  },

  /** Same entry copy as welcome — used for Menu / HELP / hi when idle. */
  help(practiceName: string, patientName?: string | null, lang?: WaLang): string {
    return BotPrompts.welcome(practiceName, patientName, lang);
  },

  needRegisterThenBook(lang?: WaLang): string {
    return L(
      lang,
      "To book for *yourself*, we need a quick patient profile first.\n" +
        "Send a clear *photo or PDF* of your *Aadhaar / PAN / ID* (JPG/PNG/PDF), or type your *full name*, date of birth, and gender.",
      "अपने लिए बुक करने हेतु पहले छोटा मरीज़ प्रोफ़ाइल चाहिए।\n" +
        "अपने *आधार / पैन / ID* की साफ़ *फ़ोटो या PDF* भेजें, या *पूरा नाम*, जन्म तारीख और लिंग लिखें।",
    );
  },

  needRegisterDependentThenBook(lang?: WaLang): string {
    return L(
      lang,
      "To book for a *family member / dependent*, we need their profile first.\n" +
        "Send a clear *photo or PDF* of their *Aadhaar / PAN / ID*, or type their *full name*, date of birth, and gender.",
      "परिवार सदस्य / आश्रित के लिए बुक करने हेतु पहले उनकी प्रोफ़ाइल चाहिए।\n" +
        "उनके *आधार / पैन / ID* की साफ़ *फ़ोटो या PDF* भेजें, या *पूरा नाम*, जन्म तारीख और लिंग लिखें।",
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

  askRegisterDob(lang?: WaLang): string {
    return L(
      lang,
      "Please enter your *Date of Birth* as DD/MM/YYYY.\n" +
        "You may also include your *Emirates ID / National ID* in the same message.",
      "कृपया अपनी *जन्म तारीख* DD/MM/YYYY में लिखें।\n" +
        "उसी संदेश में *Emirates ID / National ID* भी लिख सकते हैं।",
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
      `✅ Document received and saved to your record.\n` +
        `File: *${opts.name}* · Visit: ${opts.whenLabel}\n` +
        `Your doctor can open it in GlucoGuide. Files on this visit: ${opts.count}/${opts.max}.\n` +
        `Reply *Menu* anytime for more options.`,
      `✅ दस्तावेज़ मिल गया और आपके रिकॉर्ड में सेव हो गया।\n` +
        `फ़ाइल: *${opts.name}* · विज़िट: ${opts.whenLabel}\n` +
        `डॉक्टर इसे GlucoGuide में देख सकते हैं। इस विज़िट पर फ़ाइलें: ${opts.count}/${opts.max}।\n` +
        `और विकल्पों के लिए कभी भी *Menu* लिखें।`,
    );
  },

  /** Branch F — uploaded without linking to a visit. */
  documentSavedGeneral(opts: { name: string; lang?: WaLang }): string {
    return L(
      opts.lang,
      `✅ Document received and saved to your record.\n` +
        `File: *${opts.name}* (general document).\n` +
        `Reply *Menu* anytime for more options.`,
      `✅ दस्तावेज़ मिल गया और आपके रिकॉर्ड में सेव हो गया।\n` +
        `फ़ाइल: *${opts.name}* (सामान्य दस्तावेज़)।\n` +
        `और विकल्पों के लिए कभी भी *Menu* लिखें।`,
    );
  },

  /** Branch F — Prompt 1 */
  askAttachDocumentUpload(lang?: WaLang): string {
    return L(
      lang,
      "Please upload or attach your document (e.g., Lab Report, Insurance Card, ID, PDF, or Photo).",
      "कृपया अपना दस्तावेज़ अपलोड या अटैच करें (जैसे लैब रिपोर्ट, इंश्योरेंस कार्ड, ID, PDF, या फ़ोटो)।",
    );
  },

  /** Branch F — after upload, when active appointments exist. */
  askLinkDocumentToAppointment(lang?: WaLang): string {
    return L(
      lang,
      "Would you like to link this document to an upcoming appointment?",
      "क्या आप इस दस्तावेज़ को किसी आगामी अपॉइंटमेंट से जोड़ना चाहेंगे?",
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
      age?: number | null;
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
    const ageLine =
      opts.age != null
        ? L(lang, `\nAge: *${opts.age}*`, `\nआयु: *${opts.age}*`)
        : "";
    return (
      L(
        lang,
        `✅ Welcome, *${opts.name}*! Your patient profile is ready.`,
        `✅ स्वागत है, *${opts.name}*! आपका मरीज़ प्रोफ़ाइल तैयार है।`,
      ) +
      ageLine +
      next
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
        `Do you want to register a *family member / dependent*?\n` +
        `Tap *Yes* to add them, or *No* to go back.`,
      `आप पहले से रजिस्टर्ड हैं${who}।\n` +
        `क्या आप किसी *परिवार सदस्य / आश्रित* को रजिस्टर करना चाहते हैं?\n` +
        `जोड़ने के लिए *Yes*, वापस जाने के लिए *No* दबाएँ।`,
    );
  },

  /** Branch C — Prompt 1 (when primary is already registered, lead with that). */
  askRegisterFamilyName(
    lang?: WaLang,
    alreadyRegisteredAs?: string | null,
  ): string {
    const who = alreadyRegisteredAs?.trim()
      ? ` as *${alreadyRegisteredAs.trim()}*`
      : "";
    const already = alreadyRegisteredAs
      ? L(
          lang,
          `You're already registered${who}.\n`,
          `आप पहले से रजिस्टर्ड हैं${who ? ` (*${alreadyRegisteredAs.trim()}*)` : ""}।\n`,
        )
      : "";
    return (
      already +
      L(
        lang,
        "Please enter the *full name* of the family member.\n" +
          "Or send a clear *photo or PDF* of their *Aadhaar / PAN / ID* (JPG/PNG/PDF).",
        "कृपया परिवार के सदस्य का *पूरा नाम* लिखें।\n" +
          "या उनके *आधार / पैन / ID* की साफ़ *फ़ोटो या PDF* (JPG/PNG/PDF) भेजें।",
      )
    );
  },

  /** Branch C — Prompt 2 */
  askRegisterFamilyRelationship(lang?: WaLang): string {
    return L(
      lang,
      "Please select or type their *relationship* to you (e.g., Spouse, Child, Parent).",
      "कृपया आपके साथ उनका *रिश्ता* चुनें या लिखें (जैसे पति/पत्नी, बच्चा, माता-पिता)।",
    );
  },

  /** Branch C — Prompt 3 */
  askRegisterFamilyDobAndId(lang?: WaLang): string {
    return L(
      lang,
      "Please enter their *Date of Birth* (DD/MM/YYYY) and *Emirates ID / National ID*.\n" +
        "Example: `15/08/2015 784-1990-1234567-1`",
      "कृपया उनकी *जन्म तारीख* (DD/MM/YYYY) और *Emirates ID / National ID* लिखें।\n" +
        "उदाहरण: `15/08/2015 784-1990-1234567-1`",
    );
  },

  askRegisterFamilyDobOnly(lang?: WaLang): string {
    return L(
      lang,
      "Please enter their *Date of Birth* as DD/MM/YYYY.",
      "कृपया जन्म तारीख DD/MM/YYYY में लिखें।",
    );
  },

  askRegisterFamilyIdOnly(lang?: WaLang): string {
    return L(
      lang,
      "Please enter their *Emirates ID / National ID*.",
      "कृपया उनका *Emirates ID / National ID* लिखें।",
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

  /** Branch C — success */
  familyRegistered(
    name: string,
    lang?: WaLang,
    relationship?: string | null,
    age?: number | null,
  ): string {
    const rel = relationship?.trim();
    const who = rel ? `*${name}* (${rel})` : `*${name}*`;
    const ageLine =
      age != null
        ? L(lang, `\nAge: *${age}*`, `\nआयु: *${age}*`)
        : "";
    return L(
      lang,
      `✅ Family member added successfully!\n` +
        `${who} is saved under your profile.` +
        ageLine +
        `\nTap *Menu* to book for them or yourself.`,
      `✅ परिवार सदस्य सफलतापूर्वक जोड़ दिया गया!\n` +
        `${who} आपकी प्रोफ़ाइल में सेव है।` +
        ageLine +
        `\nबुकिंग के लिए *Menu* दबाएँ।`,
    );
  },

  askDate(lang?: WaLang): string {
    return L(
      lang,
      "Which date works for you?\n" +
        "Tap *Dates* below for *Today*, *Tomorrow*, or *Select Date*.",
      "कौन सी तारीख ठीक रहेगी?\n" +
        "नीचे *Dates* में *आज*, *कल*, या *Select Date* चुनें।",
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

  slotPast(lang?: WaLang): string {
    return L(
      lang,
      "That time has already passed. Please pick a later slot.",
      "वह समय बीत चुका है। कृपया बाद का स्लॉट चुनें।",
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

  /**
   * Branch A booking summary before confirm.
   * Example:
   * Appointment details:
   * • Patient: Satheesh Kumar
   * • Doctor: Dr. Priya Nair
   * • Date & Time: Sept 28, 2026 at 11:00 AM
   * • Location: Main Clinic, Abu Dhabi
   */
  bookingSummary(
    details: {
      patient: string;
      doctor: string;
      dateTime: string;
      location: string;
    },
    lang?: WaLang,
  ): string {
    return L(
      lang,
      `*Appointment details*\n` +
        `• Patient: ${details.patient}\n` +
        `• Doctor: ${details.doctor}\n` +
        `• Date & Time: ${details.dateTime}\n` +
        `• Location: ${details.location}\n\n` +
        `Tap a button below to continue.`,
      `*अपॉइंटमेंट विवरण*\n` +
        `• मरीज़: ${details.patient}\n` +
        `• डॉक्टर: ${details.doctor}\n` +
        `• तारीख और समय: ${details.dateTime}\n` +
        `• स्थान: ${details.location}\n\n` +
        `जारी रखने के लिए नीचे बटन दबाएँ।`,
    );
  },

  askConfirm(summary: string, lang?: WaLang): string {
    // Prefer full bookingSummary; keep this for legacy/re-prompt text.
    if (/Appointment details|अपॉइंटमेंट विवरण/i.test(summary)) {
      return summary;
    }
    return L(
      lang,
      `*Appointment details*\n${summary}\n\nTap a button below to continue.`,
      `*अपॉइंटमेंट विवरण*\n${summary}\n\nजारी रखने के लिए नीचे बटन दबाएँ।`,
    );
  },

  changeBookingDetails(lang?: WaLang): string {
    return L(
      lang,
      "OK — let's update the appointment details.\nChoose again below.",
      "ठीक है — अपॉइंटमेंट विवरण अपडेट करते हैं।\nनीचे फिर से चुनें।",
    );
  },

  askCancelConfirm(summary: string, lang?: WaLang): string {
    return L(
      lang,
      `Cancel this booking?\n*${summary}*\n\nTap *Confirm Cancel* to release the slot, or *Keep Booking* to leave it.`,
      `यह बुकिंग रद्द करें?\n*${summary}*\n\nस्लॉट छोड़ने के लिए *Confirm Cancel*, रखने के लिए *Keep Booking* दबाएँ।`,
    );
  },

  askManageBookingsPick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "You have no upcoming appointments at this clinic.\nTap *Menu* → *Book* to schedule one.",
        "इस क्लिनिक पर कोई आगामी अपॉइंटमेंट नहीं है।\nबुक करने के लिए *Menu* → *Book* दबाएँ।",
      );
    }
    if (options.length === 1) {
      return L(
        lang,
        `Your upcoming appointment:\n*${options[0]!.label}*`,
        `आपकी आगामी अपॉइंटमेंट:\n*${options[0]!.label}*`,
      );
    }
    return L(
      lang,
      `Your upcoming appointments (*${options.length}*):\n` +
        options.map((o) => `${o.index}. ${o.label}`).join("\n") +
        `\n\nTap a visit below to *reschedule* or *cancel*.`,
      `आपकी आगामी अपॉइंटमेंट (*${options.length}*):\n` +
        options.map((o) => `${o.index}. ${o.label}`).join("\n") +
        `\n\n*रीशेड्यूल* या *रद्द* करने के लिए नीचे विज़िट चुनें।`,
    );
  },

  askManageAction(summary: string, lang?: WaLang): string {
    return L(
      lang,
      `Selected:\n*${summary}*\n\nWhat would you like to do?`,
      `चयनित:\n*${summary}*\n\nआप क्या करना चाहेंगे?`,
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

  rescheduleAskDate(visitLabel: string, lang?: WaLang): string {
    return L(
      lang,
      `Rescheduling:\n*${visitLabel}*\n\n${BotPrompts.askDate(lang)}`,
      `रीशेड्यूल:\n*${visitLabel}*\n\n${BotPrompts.askDate(lang)}`,
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
      "Whom is this appointment for?\nChoose *Self* or a *family member / dependent* below.",
      "यह अपॉइंटमेंट किसके लिए है?\nनीचे *स्वयं* या *परिवार सदस्य / आश्रित* चुनें।",
    );
  },

  askBookFamilyPick(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return BotPrompts.needRegisterDependentThenBook(lang);
    }
    const lines = options.map((o) => `${o.index}. ${o.label}`).join("\n");
    return L(
      lang,
      `Which *family member / dependent*?\n${lines}\n\nTap a profile below, or reply with a *number*.`,
      `कौन सा *परिवार सदस्य / आश्रित*?\n${lines}\n\nनीचे प्रोफ़ाइल चुनें, या *संख्या* लिखें।`,
    );
  },

  askBookWhom(selfName: string | null, lang?: WaLang): string {
    const short = firstGivenName(selfName);
    const selfLabel = short
      ? L(lang, `Self (*${short}*)`, `स्वयं (*${short}*)`)
      : L(lang, "Self", "स्वयं");
    return L(
      lang,
      `Whom is this appointment for?\n` +
        `• ${selfLabel}\n` +
        `• Family member / dependent\n\n` +
        `Tap a button below.`,
      `यह अपॉइंटमेंट किसके लिए है?\n` +
        `• ${selfLabel}\n` +
        `• परिवार सदस्य / आश्रित\n\n` +
        `नीचे बटन दबाएँ।`,
    );
  },

  askSpecialty(
    options: Array<{ index: number; label: string }>,
    lang?: WaLang,
  ): string {
    if (!options.length) {
      return L(
        lang,
        "No departments are available right now. Tap *Menu* for options.",
        "अभी कोई विभाग उपलब्ध नहीं है। विकल्पों के लिए *Menu* दबाएँ।",
      );
    }
    const lines = options.map((o) => `${o.index}. ${o.label}`).join("\n");
    return L(
      lang,
      `Choose a *department / specialty*:\n${lines}\n\nReply with a *number*, or tap *Departments* below.`,
      `*विभाग / विशेषता* चुनें:\n${lines}\n\n*संख्या* लिखें, या नीचे *Departments* दबाएँ।`,
    );
  },

  specialtySelectedAskDoctor(specialty: string, lang?: WaLang): string {
    return L(
      lang,
      `✅ *${specialty}* selected.\nChoose your doctor below.`,
      `✅ *${specialty}* चुना गया।\nनीचे अपना डॉक्टर चुनें।`,
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

  /** Branch E — no active/recent visit: still collect message for Admin assignment. */
  askMessageDoctorAdmin(lang?: WaLang): string {
    return L(
      lang,
      "No active appointment found.\n" +
        "Please type the *message* you'd like to send — an admin will assign a doctor.",
      "कोई सक्रिय अपॉइंटमेंट नहीं मिली।\n" +
        "कृपया अपना *संदेश* लिखें — एडमिन डॉक्टर असाइन करेगा।",
    );
  },

  noBookingForMessageDoctor(lang?: WaLang): string {
    return BotPrompts.askMessageDoctorAdmin(lang);
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

  /** Proactive nudge when the patient goes quiet mid-flow (>10 min). */
  idleReminder(lang?: WaLang): string {
    return L(
      lang,
      "It looks like you stepped away. Tap *Continue* to finish or *Main Menu* to start over.",
      "लगता है आप थोड़ी देर के लिए चले गए। जारी रखने के लिए *Continue*, या फिर से शुरू करने के लिए *Main Menu* दबाएँ।",
    );
  },

  idleContinueAck(lang?: WaLang): string {
    return L(
      lang,
      "Welcome back — let's continue where we left off.",
      "वापस स्वागत है — जहाँ छोड़ा था वहाँ से जारी रखते हैं।",
    );
  },

  /** NLU freeform booking confirmation. */
  nluBookConfirm(summary: string, lang?: WaLang): string {
    return L(
      lang,
      `Did you mean you want to book an appointment for *${summary}*?\n\nTap *Yes* to continue, or *No* to start over.`,
      `क्या आप *${summary}* के लिए अपॉइंटमेंट बुक करना चाहते हैं?\n\nजारी रखने के लिए *Yes*, या फिर से शुरू करने के लिए *No* दबाएँ।`,
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
  bookingConfirmed(
    practiceName: string,
    detail: string,
    lang?: WaLang,
    extras?: {
      referenceId?: string | null;
      googleCalendarUrl?: string | null;
      mapsUrl?: string | null;
      icsUrl?: string | null;
    },
  ): string {
    const ref = extras?.referenceId?.trim();
    const head = L(
      lang,
      `✅ Booking confirmed at *${practiceName}*.\n` +
        (ref ? `*Booking reference:* \`${ref}\`\n` : "") +
        `${detail}`,
      `✅ *${practiceName}* पर बुकिंग कन्फ़र्म हो गई।\n` +
        (ref ? `*बुकिंग रेफ़रेंस:* \`${ref}\`\n` : "") +
        `${detail}`,
    );
    const links: string[] = [];
    if (extras?.googleCalendarUrl) {
      links.push(
        L(
          lang,
          `📅 Add to Google Calendar:\n${extras.googleCalendarUrl}`,
          `📅 Google Calendar में जोड़ें:\n${extras.googleCalendarUrl}`,
        ),
      );
    }
    if (extras?.icsUrl) {
      links.push(
        L(
          lang,
          `🗓 Download calendar file (.ics):\n${extras.icsUrl}`,
          `🗓 कैलेंडर फ़ाइल (.ics) डाउनलोड:\n${extras.icsUrl}`,
        ),
      );
    }
    if (extras?.mapsUrl) {
      links.push(
        L(
          lang,
          `📍 Location on Google Maps:\n${extras.mapsUrl}`,
          `📍 Google Maps पर स्थान:\n${extras.mapsUrl}`,
        ),
      );
    }
    return links.length ? `${head}\n\n${links.join("\n\n")}` : head;
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
    return BotPrompts.askAttachDocumentUpload(lang);
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

  /** Branch E — Prompt when an appointment (and doctor) is known. */
  askMessageDoctorText(
    doctorName?: string | null,
    lang?: WaLang,
  ): string {
    const raw = (doctorName || "").trim();
    const withDr =
      !raw || /^your doctor$/i.test(raw)
        ? "your doctor"
        : /^dr\.?\s/i.test(raw)
          ? raw
          : `Dr. ${raw}`;
    return L(
      lang,
      `Please type the message you'd like to send regarding your appointment with *${withDr}*.`,
      `कृपया *${withDr}* के साथ अपनी अपॉइंटमेंट के बारे में जो संदेश भेजना चाहते हैं, लिखें।`,
    );
  },

  /** @deprecated Prefer askMessageDoctorText — kept for older call sites. */
  messageDoctorHandoff(
    lang?: WaLang,
    opts?: { doctorName?: string | null; whenLabel?: string | null },
  ): string {
    return BotPrompts.askMessageDoctorText(opts?.doctorName, lang);
  },

  /** Branch E — delivery confirmation. */
  messageDoctorDelivered(lang?: WaLang): string {
    return L(
      lang,
      "Your message has been delivered to the medical team.",
      "आपका संदेश मेडिकल टीम तक पहुँचा दिया गया है।",
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
    opts?: {
      hasMoreVisits?: boolean;
      referenceId?: string | null;
      visitLabel?: string | null;
    },
  ): string {
    const ref = opts?.referenceId?.trim();
    const visit = opts?.visitLabel?.trim();
    const head = L(
      lang,
      `✅ *Cancellation receipt*\n` +
        (ref ? `• Booking reference: \`${ref}\`\n` : "") +
        (visit ? `• Visit: *${visit}*\n` : "") +
        (reason
          ? `• Reason shared with your doctor: *${reason}*\n`
          : "") +
        `Your slot has been released.`,
      `✅ *रद्दीकरण रसीद*\n` +
        (ref ? `• बुकिंग रेफ़रेंस: \`${ref}\`\n` : "") +
        (visit ? `• विज़िट: *${visit}*\n` : "") +
        (reason ? `• डॉक्टर को कारण: *${reason}*\n` : "") +
        `आपका स्लॉट मुक्त कर दिया गया है।`,
    );
    const more = opts?.hasMoreVisits
      ? L(
          lang,
          "\n\nYou still have other visits — use the menu below.",
          "\n\nआपकी और विज़िट हैं — नीचे मेनू देखें।",
        )
      : L(
          lang,
          "\n\nTap *Menu* below for Book, Status, and more.",
          "\n\nबुक, स्टेटस आदि के लिए नीचे *Menu* दबाएँ।",
        );
    return head + more;
  },

  keptBooking(lang?: WaLang): string {
    return L(
      lang,
      "Okay — your booking is *kept*.\nTap *Menu* below if you need anything else.",
      "ठीक है — आपकी बुकिंग *रखी गई* है।\nऔर मदद के लिए नीचे *Menu* दबाएँ।",
    );
  },

  rescheduled(
    detail: string,
    lang?: WaLang,
    opts?: { referenceId?: string | null },
  ): string {
    const ref = opts?.referenceId?.trim();
    return L(
      lang,
      `✅ *Reschedule confirmed*\n` +
        (ref ? `• Booking reference: \`${ref}\`\n` : "") +
        `• New time: ${detail}`,
      `✅ *रीशेड्यूल कन्फ़र्म*\n` +
        (ref ? `• बुकिंग रेफ़रेंस: \`${ref}\`\n` : "") +
        `• नया समय: ${detail}`,
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

  /** Branch D — while chat is in Agent Transfer. */
  handedOffWait(lang?: WaLang): string {
    return L(
      lang,
      "You're connected to *support*. A team member will reply shortly.\n" +
        "To use the assistant again, reply *Menu* or *BOT*.",
      "आप *सपोर्ट* से जुड़े हैं। टीम सदस्य जल्द जवाब देगा।\n" +
        "असिस्टेंट फिर से चलाने के लिए *Menu* या *BOT* लिखें।",
    );
  },

  /** Branch D — initial handoff confirmation (same copy as escalateReply). */
  agentTransferConnecting(lang?: WaLang): string {
    return L(
      lang,
      "Connecting you to an agent... A team member will reply shortly.",
      "आपको एक एजेंट से जोड़ा जा रहा है... टीम सदस्य जल्द जवाब देगा।",
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

  /** Global keyword — Exit / Cancel */
  sessionEnded(lang?: WaLang): string {
    return L(
      lang,
      "Session ended. Type 'Hi' anytime to start again.",
      "सेशन समाप्त। फिर से शुरू करने के लिए कभी भी 'Hi' लिखें।",
    );
  },

  /** Global keyword — CallBack */
  callbackRequestLogged(lang?: WaLang): string {
    return L(
      lang,
      "We have logged your callback request. An admin representative will call you shortly.",
      "आपका कॉलबैक अनुरोध लॉग हो गया है। एडमिन प्रतिनिधि जल्द आपको कॉल करेगा।",
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

  // Clinic activity alerts without dedicated Meta templates → free-form WA text.
  const practice = str(enriched, "practiceName", "your clinic");
  const patient = str(enriched, "patientName", "Patient");
  const when = str(enriched, "whenLabel", "scheduled time");
  if (templateKey === "CLINIC_WAITING") {
    return withOptOut(
      `Patient ${patient} is waiting at ${practice} (${when}).`,
      str(payload, "recipientRole"),
    );
  }
  if (templateKey === "CLINIC_NO_SHOW") {
    return withOptOut(
      `Patient ${patient} marked no-show at ${practice} (${when}).`,
      str(payload, "recipientRole"),
    );
  }
  if (templateKey === "CLINIC_COMPLETED") {
    return withOptOut(
      `Visit completed for ${patient} at ${practice} (${when}).`,
      str(payload, "recipientRole"),
    );
  }
  if (templateKey === "CLINIC_DOCUMENT") {
    const docName = str(enriched, "docName", "Document");
    const kind =
      str(enriched, "docKind", "visit") === "general"
        ? "general document"
        : "visit document";
    return withOptOut(
      `${patient} shared a ${kind} via WhatsApp: ${docName} (${practice}).`,
      str(payload, "recipientRole"),
    );
  }
  if (templateKey === "CLINIC_OVERRIDE") {
    const reason = str(enriched, "reason", "");
    return withOptOut(
      `Schedule override affects ${patient} at ${practice} (${when})${
        reason ? `: ${reason}` : "."
      }`,
      str(payload, "recipientRole"),
    );
  }

  return withOptOut(
    `Appointment update from ${practice}.`,
    str(payload, "recipientRole"),
  );
}
