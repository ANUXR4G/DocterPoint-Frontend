/**
 * Canonical Meta Cloud API template catalog for GlucoGuide / GlucoGuide.
 * All patient-facing proactive messages MUST use UTILITY category templates
 * (or free-form only inside an open customer-service window).
 *
 * See documentation/Whatsapp-Meta-Rules.md.
 */

export type MetaTemplateCategory = "UTILITY" | "AUTHENTICATION" | "MARKETING";

export type MetaTemplateDef = {
  /** Internal GlucoGuide key (notification payload.templateKey) */
  key: string;
  /** snake_case name submitted to Meta (must be unique per WABA+language) */
  metaName: string;
  category: MetaTemplateCategory;
  language: string;
  /** Body with named {{params}} for Meta review */
  body: string;
  /** Example values for Meta template creation API */
  examples: Record<string, string>;
  /** Ordered named params for send payload */
  paramNames: string[];
  /** Never send as free-form outside the 24h window */
  requiresTemplateOutsideWindow: boolean;
  /** Recipient: patient | clinic */
  audience: "patient" | "clinic";
};

/** Footer appended to free-form / session replies that are transactional. */
export const OPT_OUT_FOOTER =
  "\n\nReply STOP to opt out of appointment WhatsApp alerts from this clinic.";

/**
 * Approved utility copy — no promos, discounts, upsells, or “check our offers”.
 * Keep variables factual (clinic, doctor, time, token, location).
 */
export const META_UTILITY_TEMPLATES: MetaTemplateDef[] = [
  {
    key: "BOOKING_CONFIRMATION",
    metaName: "docline_booking_confirm",
    category: "UTILITY",
    language: "en",
    body:
      "Your appointment at {{practice_name}} is confirmed.\n" +
      "When: {{when_label}}\n" +
      "Doctor: {{provider_name}}\n" +
      "Location: {{location}}\n" +
      "Reply CANCEL to cancel, RESCHEDULE to change, or STATUS to view.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      when_label: "26 Aug 2026, 10:30 AM",
      provider_name: "Dr Anjali Mehta",
      location: "Road 11, Gulshan-2, Gulshan",
    },
    paramNames: ["practice_name", "when_label", "provider_name", "location"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "REMINDER",
    metaName: "docline_appointment_reminder",
    category: "UTILITY",
    language: "en",
    body:
      "Reminder: you have an appointment at {{practice_name}}.\n" +
      "When: {{when_label}}\n" +
      "Doctor: {{provider_name}}\n" +
      "Please arrive 10 minutes early.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      when_label: "Tomorrow, 10:30 AM",
      provider_name: "Dr Anjali Mehta",
    },
    paramNames: ["practice_name", "when_label", "provider_name"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "CANCELLATION",
    metaName: "docline_booking_cancelled",
    category: "UTILITY",
    language: "en",
    body:
      "Your appointment at {{practice_name}} ({{when_label}}) has been cancelled.\n" +
      "Reply BOOK to schedule again, or STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      when_label: "26 Aug 2026, 10:30 AM",
    },
    paramNames: ["practice_name", "when_label"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "RESCHEDULE",
    metaName: "docline_booking_rescheduled",
    category: "UTILITY",
    language: "en",
    body:
      "Your appointment at {{practice_name}} was rescheduled.\n" +
      "Previous: {{old_when}}\n" +
      "New: {{when_label}}\n" +
      "Doctor: {{provider_name}}\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      old_when: "26 Aug 2026, 10:30 AM",
      when_label: "27 Aug 2026, 11:00 AM",
      provider_name: "Dr Anjali Mehta",
    },
    paramNames: ["practice_name", "old_when", "when_label", "provider_name"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "OVERRIDE_IMPACT",
    metaName: "docline_schedule_change",
    category: "UTILITY",
    language: "en",
    body:
      "Schedule update from {{practice_name}}.\n" +
      "Your visit ({{when_label}}) is affected{{reason_suffix}}.\n" +
      "Reply RESCHEDULE to pick a new time, or CANCEL to cancel.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      when_label: "26 Aug 2026, 10:30 AM",
      reason_suffix: " (doctor leave)",
    },
    paramNames: ["practice_name", "when_label", "reason_suffix"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "QUEUE_ALERT",
    metaName: "docline_queue_ready",
    category: "UTILITY",
    language: "en",
    body:
      "You are up next at {{practice_name}}{{token_suffix}}.\n" +
      "Please be ready at the clinic.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      token_suffix: ". Token #12",
    },
    paramNames: ["practice_name", "token_suffix"],
    requiresTemplateOutsideWindow: false,
    audience: "patient",
  },
  {
    key: "CLINIC_NEW_BOOKING",
    metaName: "docline_clinic_new_booking",
    category: "UTILITY",
    language: "en",
    body:
      "New booking at {{practice_name}}.\n" +
      "Patient: {{patient_name}}\n" +
      "When: {{when_label}}\n" +
      "Doctor: {{provider_name}}\n" +
      "Channel: {{channel}}",
    examples: {
      practice_name: "City Care Clinic",
      patient_name: "Anurag Nanda",
      when_label: "26 Aug 2026, 10:30 AM",
      provider_name: "Dr Anjali Mehta",
      channel: "WHATSAPP_AI",
    },
    paramNames: [
      "practice_name",
      "patient_name",
      "when_label",
      "provider_name",
      "channel",
    ],
    requiresTemplateOutsideWindow: true,
    audience: "clinic",
  },
  {
    key: "CLINIC_CANCEL",
    metaName: "docline_clinic_booking_cancelled",
    category: "UTILITY",
    language: "en",
    body:
      "Booking cancelled at {{practice_name}}.\n" +
      "Patient: {{patient_name}}\n" +
      "Was: {{when_label}}",
    examples: {
      practice_name: "City Care Clinic",
      patient_name: "Anurag Nanda",
      when_label: "26 Aug 2026, 10:30 AM",
    },
    paramNames: ["practice_name", "patient_name", "when_label"],
    requiresTemplateOutsideWindow: true,
    audience: "clinic",
  },
  {
    key: "CLINIC_RESCHEDULE",
    metaName: "docline_clinic_booking_rescheduled",
    category: "UTILITY",
    language: "en",
    body:
      "Booking rescheduled at {{practice_name}}.\n" +
      "Patient: {{patient_name}}\n" +
      "Previous: {{old_when}}\n" +
      "New: {{when_label}}",
    examples: {
      practice_name: "City Care Clinic",
      patient_name: "Anurag Nanda",
      old_when: "26 Aug 2026, 10:30 AM",
      when_label: "27 Aug 2026, 11:00 AM",
    },
    paramNames: ["practice_name", "patient_name", "old_when", "when_label"],
    requiresTemplateOutsideWindow: true,
    audience: "clinic",
  },
  {
    key: "CLINIC_QUEUE_ALERT",
    metaName: "docline_clinic_queue_alert",
    category: "UTILITY",
    language: "en",
    body:
      "Patient {{patient_name}} is now in progress at {{practice_name}} ({{when_label}}).",
    examples: {
      patient_name: "Anurag Nanda",
      practice_name: "City Care Clinic",
      when_label: "Token #12",
    },
    paramNames: ["patient_name", "practice_name", "when_label"],
    requiresTemplateOutsideWindow: false,
    audience: "clinic",
  },
  {
    key: "CLINIC_CARE_MESSAGE",
    metaName: "docline_clinic_care_message",
    category: "UTILITY",
    language: "en",
    body:
      "Message from {{provider_name}} at {{practice_name}}:\n" +
      "{{message_preview}}\n\n" +
      "Open the GlucoGuide app or patient portal to read and reply.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      provider_name: "Dr Anjali Mehta",
      practice_name: "City Care Clinic",
      message_preview: "Please bring your latest lab report to tomorrow's visit.",
    },
    paramNames: ["provider_name", "practice_name", "message_preview"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "VISIT_SUMMARY",
    metaName: "docline_visit_summary",
    category: "UTILITY",
    language: "en",
    body:
      "Your visit at {{practice_name}} is complete.\n" +
      "Doctor: {{provider_name}}\n" +
      "Remarks: {{remarks_preview}}\n" +
      "Medicines: {{medicines_preview}}\n" +
      "Documents: {{documents_preview}}\n" +
      "Open the GlucoGuide app or patient portal for full details and files.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      provider_name: "Dr Anjali Mehta",
      remarks_preview: "Rest well; follow up in 2 weeks.",
      medicines_preview: "Metformin 500mg — morning, night",
      documents_preview: "2 file(s) — view in app",
    },
    paramNames: [
      "practice_name",
      "provider_name",
      "remarks_preview",
      "medicines_preview",
      "documents_preview",
    ],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
  {
    key: "PRESCRIPTION_UPDATE",
    metaName: "docline_prescription",
    category: "UTILITY",
    language: "en",
    body:
      "Prescription update from {{practice_name}}.\n" +
      "Doctor: {{provider_name}}\n" +
      "Medicines: {{medicines_preview}}\n" +
      "Open the GlucoGuide app or patient portal for full details.\n" +
      "Reply STOP to opt out of appointment alerts.",
    examples: {
      practice_name: "City Care Clinic",
      provider_name: "Dr Anjali Mehta",
      medicines_preview: "Metformin 500mg — morning, night",
    },
    paramNames: ["practice_name", "provider_name", "medicines_preview"],
    requiresTemplateOutsideWindow: true,
    audience: "patient",
  },
];

export function getMetaTemplateByKey(key: string): MetaTemplateDef | undefined {
  return META_UTILITY_TEMPLATES.find((t) => t.key === key);
}

/** Fill `{{param}}` placeholders from a values map. */
export function fillTemplateBody(
  body: string,
  values: Record<string, string>,
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = values[name];
    return v == null || v === "" ? "—" : v;
  });
}

/**
 * Free-form / fallback body from the Meta catalog — single source of truth.
 * Returns null for unknown keys (caller may use a generic line).
 */
export function renderUtilityTemplateBody(
  key: string,
  payload: Record<string, unknown>,
): string | null {
  const def = getMetaTemplateByKey(key);
  if (!def) return null;
  return fillTemplateBody(def.body, payloadToMetaParams(key, payload));
}

export function buildNamedTemplateComponents(
  def: MetaTemplateDef,
  values: Record<string, string>,
): Array<{
  type: "body";
  parameters: Array<{
    type: "text";
    parameter_name: string;
    text: string;
  }>;
}> {
  return [
    {
      type: "body",
      parameters: def.paramNames.map((name) => ({
        type: "text" as const,
        parameter_name: name,
        text: (values[name] ?? "—").slice(0, 1024) || "—",
      })),
    },
  ];
}

/** Map notification payload → Meta named params. */
export function payloadToMetaParams(
  key: string,
  payload: Record<string, unknown>,
): Record<string, string> {
  const s = (k: string, fb = "—") => {
    const v = payload[k];
    if (v == null || v === "") return fb;
    return String(v);
  };
  const reason = s("reason", "");
  const token =
    payload.tokenNumber != null ? `. Token #${payload.tokenNumber}` : "";

  switch (key) {
    case "BOOKING_CONFIRMATION":
      return {
        practice_name: s("practiceName", "your clinic"),
        when_label: s("whenLabel", "your scheduled time"),
        provider_name: s("providerName", "your doctor"),
        location: s("location", "clinic"),
      };
    case "REMINDER":
      return {
        practice_name: s("practiceName", "your clinic"),
        when_label: s("whenLabel", "your scheduled time"),
        provider_name: s("providerName", "your doctor"),
      };
    case "CANCELLATION":
      return {
        practice_name: s("practiceName", "your clinic"),
        when_label: s("whenLabel", "your scheduled time"),
      };
    case "RESCHEDULE":
      return {
        practice_name: s("practiceName", "your clinic"),
        old_when: s("oldWhen", "previous time"),
        when_label: s("whenLabel", "new time"),
        provider_name: s("providerName", "your doctor"),
      };
    case "OVERRIDE_IMPACT":
      return {
        practice_name: s("practiceName", "your clinic"),
        when_label: s("whenLabel", "your scheduled time"),
        reason_suffix: reason ? ` (${reason})` : "",
      };
    case "QUEUE_ALERT":
      return {
        practice_name: s("practiceName", "your clinic"),
        token_suffix: token,
      };
    case "CLINIC_NEW_BOOKING":
      return {
        practice_name: s("practiceName", "clinic"),
        patient_name: s("patientName", "Patient"),
        when_label: s("whenLabel", "scheduled"),
        provider_name: s("providerName", "doctor"),
        channel: s("channel", "app"),
      };
    case "CLINIC_CANCEL":
      return {
        practice_name: s("practiceName", "clinic"),
        patient_name: s("patientName", "Patient"),
        when_label: s("whenLabel", "scheduled"),
      };
    case "CLINIC_RESCHEDULE":
      return {
        practice_name: s("practiceName", "clinic"),
        patient_name: s("patientName", "Patient"),
        old_when: s("oldWhen", "previous"),
        when_label: s("whenLabel", "new"),
      };
    case "CLINIC_QUEUE_ALERT":
      return {
        patient_name: s("patientName", "Patient"),
        practice_name: s("practiceName", "clinic"),
        when_label: s("whenLabel", "now"),
      };
    case "CLINIC_CARE_MESSAGE":
      return {
        provider_name: s("providerName", "your clinic"),
        practice_name: s("practiceName", "your clinic"),
        message_preview: s("messagePreview", "Please check the GlucoGuide app."),
      };
    case "VISIT_SUMMARY":
      return {
        practice_name: s("practiceName", "your clinic"),
        provider_name: s("providerName", "your doctor"),
        remarks_preview: s("remarksPreview", "None noted"),
        medicines_preview: s("medicinesPreview", "None prescribed"),
        documents_preview: s("documentsPreview", "None attached"),
      };
    case "PRESCRIPTION_UPDATE":
      return {
        practice_name: s("practiceName", "your clinic"),
        provider_name: s("providerName", "your doctor"),
        medicines_preview: s("medicinesPreview", "None prescribed"),
      };
    default:
      return {};
  }
}
