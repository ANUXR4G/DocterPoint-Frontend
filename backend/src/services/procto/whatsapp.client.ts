import { createHmac, timingSafeEqual } from "crypto";
import { settings } from "../../config/index.js";
import { renderNotificationTemplate } from "./whatsapp.templates.js";
import {
  buildNamedTemplateComponents,
  getMetaTemplateByKey,
  payloadToMetaParams,
} from "./whatsapp.metaTemplates.js";
import {
  parseMetaGraphError,
  type MetaGraphErrorBody,
} from "./whatsapp.metaErrors.js";

export interface WhatsAppSendResult {
  ok: boolean;
  messageId?: string;
  simulated?: boolean;
  /** Patient/clinic-safe message (mapped Meta codes when known). */
  error?: string;
  /** Raw Meta / transport message for logs. */
  errorDetail?: string;
  errorCode?: number;
  usedTemplate?: boolean;
}

function failFromMeta(
  err: MetaGraphErrorBody | undefined,
  statusText: string,
  extra?: Partial<WhatsAppSendResult>,
): WhatsAppSendResult {
  const parsed = parseMetaGraphError(err, statusText);
  return {
    ok: false,
    error: parsed.userMessage,
    errorDetail: parsed.message,
    errorCode: parsed.code,
    ...extra,
  };
}

/**
 * Normalize to Meta `to` digits (no +).
 * Strip trunk `00…` prefixes; keep full international MSISDNs; only invent
 * India `91` for bare 10-digit mobiles that look Indian (start 6–9).
 * Never force `91` onto US/other 10-digit values (e.g. corrupted `1507801104`).
 */
export function formatE164(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  while (digits.startsWith("00") && digits.length > 11) {
    digits = digits.slice(2);
  }
  if (digits.length >= 11 && digits.length <= 15) return digits;
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  return digits;
}

export async function sendWhatsAppText(
  to: string,
  body: string,
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const token = settings.whatsappAccessToken;
  const phoneId = phoneNumberId ?? settings.whatsappPhoneNumberId;

  if (!token || !phoneId) {
    console.log(`[WhatsApp simulated] → ${to}: ${body.slice(0, 200)}`);
    return { ok: true, simulated: true };
  }

  const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatE164(to),
        type: "text",
        text: { body },
      }),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: MetaGraphErrorBody;
    };

    if (!res.ok) {
      return failFromMeta(data.error, res.statusText);
    }

    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

/** Send an approved Meta template (required outside the 24h customer-service window). */
export async function sendWhatsAppTemplate(
  to: string,
  templateKey: string,
  payload: Record<string, unknown>,
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const def = getMetaTemplateByKey(templateKey);
  if (!def) {
    return { ok: false, error: `Unknown template key: ${templateKey}` };
  }

  const token = settings.whatsappAccessToken;
  const phoneId = phoneNumberId ?? settings.whatsappPhoneNumberId;
  const params = payloadToMetaParams(templateKey, payload);
  const components = buildNamedTemplateComponents(def, params);

  if (!token || !phoneId) {
    console.log(
      `[WhatsApp template simulated] → ${to} ${def.metaName}:`,
      JSON.stringify(params),
    );
    return { ok: true, simulated: true, usedTemplate: true };
  }

  const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/messages`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatE164(to),
        type: "template",
        template: {
          name: def.metaName,
          language: { code: def.language === "en" ? "en" : def.language },
          components,
        },
      }),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: MetaGraphErrorBody;
    };

    if (!res.ok) {
      return failFromMeta(data.error, res.statusText, { usedTemplate: true });
    }

    return {
      ok: true,
      messageId: data.messages?.[0]?.id,
      usedTemplate: true,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "template send failed",
      usedTemplate: true,
    };
  }
}

/** Interactive list (tap-to-pick) — ideal for clinic doctor selection demos. */
export async function sendWhatsAppInteractiveList(
  to: string,
  opts: {
    body: string;
    buttonLabel: string;
    header?: string;
    sectionTitle: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  },
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const token = settings.whatsappAccessToken;
  const phoneId = phoneNumberId ?? settings.whatsappPhoneNumberId;
  const rows = opts.rows.slice(0, 10).map((r) => ({
    id: r.id.slice(0, 200),
    title: r.title.slice(0, 24),
    ...(r.description
      ? { description: r.description.slice(0, 72) }
      : {}),
  }));

  if (!rows.length) {
    return { ok: false, error: "no list rows" };
  }

  if (!token || !phoneId) {
    console.log(
      `[WhatsApp interactive list simulated] → ${to}: ${opts.body.slice(0, 120)} | rows=${rows.length}`,
    );
    return { ok: true, simulated: true };
  }

  const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/messages`;
  const interactive: Record<string, unknown> = {
    type: "list",
    body: { text: opts.body.slice(0, 1024) },
    action: {
      button: opts.buttonLabel.slice(0, 20),
      sections: [
        {
          title: opts.sectionTitle.slice(0, 24),
          rows,
        },
      ],
    },
  };
  if (opts.header?.trim()) {
    interactive.header = {
      type: "text",
      text: opts.header.trim().slice(0, 60),
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatE164(to),
        type: "interactive",
        interactive,
      }),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: MetaGraphErrorBody;
    };

    if (!res.ok) {
      return failFromMeta(data.error, res.statusText);
    }

    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "interactive list send failed",
    };
  }
}

/** Interactive reply buttons (Yes/No etc.) — max 3. */
export async function sendWhatsAppInteractiveButtons(
  to: string,
  opts: {
    body: string;
    header?: string;
    buttons: Array<{ id: string; title: string }>;
  },
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const token = settings.whatsappAccessToken;
  const phoneId = phoneNumberId ?? settings.whatsappPhoneNumberId;
  const buttons = opts.buttons.slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: {
      id: b.id.slice(0, 256),
      title: b.title.slice(0, 20),
    },
  }));

  if (!buttons.length) {
    return { ok: false, error: "no buttons" };
  }

  if (!token || !phoneId) {
    console.log(
      `[WhatsApp interactive buttons simulated] → ${to}: ${opts.body.slice(0, 120)} | buttons=${buttons.map((b) => b.reply.title).join(",")}`,
    );
    return { ok: true, simulated: true };
  }

  const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/messages`;
  const interactive: Record<string, unknown> = {
    type: "button",
    body: { text: opts.body.slice(0, 1024) },
    action: { buttons },
  };
  if (opts.header?.trim()) {
    interactive.header = {
      type: "text",
      text: opts.header.trim().slice(0, 60),
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatE164(to),
        type: "interactive",
        interactive,
      }),
    });

    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: MetaGraphErrorBody;
    };

    if (!res.ok) {
      return failFromMeta(data.error, res.statusText);
    }

    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "interactive buttons send failed",
    };
  }
}

/**
 * Upload bytes then send as a WhatsApp document (e.g. appointment .ics).
 * Media upload uses the phone-number-id media endpoint.
 */
export async function sendWhatsAppDocument(
  to: string,
  opts: {
    filename: string;
    mimeType: string;
    buffer: Buffer;
    caption?: string;
  },
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const token = settings.whatsappAccessToken;
  const phoneId = phoneNumberId ?? settings.whatsappPhoneNumberId;

  if (!token || !phoneId) {
    console.log(
      `[WhatsApp document simulated] → ${to}: ${opts.filename} (${opts.buffer.length} bytes)`,
    );
    return { ok: true, simulated: true };
  }

  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", opts.mimeType);
    form.append(
      "file",
      new Blob([new Uint8Array(opts.buffer)], { type: opts.mimeType }),
      opts.filename,
    );

    const uploadRes = await fetch(
      `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      },
    );
    const uploadData = (await uploadRes.json()) as {
      id?: string;
      error?: MetaGraphErrorBody;
    };
    if (!uploadRes.ok || !uploadData.id) {
      return failFromMeta(uploadData.error, uploadRes.statusText);
    }

    const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatE164(to),
        type: "document",
        document: {
          id: uploadData.id,
          filename: opts.filename.slice(0, 240),
          ...(opts.caption?.trim()
            ? { caption: opts.caption.trim().slice(0, 1024) }
            : {}),
        },
      }),
    });
    const data = (await res.json()) as {
      messages?: { id: string }[];
      error?: MetaGraphErrorBody;
    };
    if (!res.ok) {
      return failFromMeta(data.error, res.statusText);
    }
    return { ok: true, messageId: data.messages?.[0]?.id };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "document send failed",
    };
  }
}

const PRESCRIPTION_FILE_TEMPLATE = "docline_prescription_file";

async function uploadTemplateSample(buffer: Buffer, filename: string): Promise<string> {
  const token = settings.whatsappAccessToken;
  const appId = settings.metaAppId?.trim();
  if (!token || !appId) throw new Error("WhatsApp app id is not configured.");
  const sessionRes = await fetch(
    `https://graph.facebook.com/${settings.whatsappApiVersion}/${appId}/uploads?file_name=${encodeURIComponent(filename)}&file_length=${buffer.length}&file_type=${encodeURIComponent("application/pdf")}`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  const session = (await sessionRes.json()) as { id?: string; error?: MetaGraphErrorBody };
  if (!sessionRes.ok || !session.id) {
    throw new Error(session.error?.message || "Could not start the prescription file upload.");
  }
  const uploadRes = await fetch(
    `https://graph.facebook.com/${settings.whatsappApiVersion}/${session.id}`,
    {
      method: "POST",
      headers: {
        Authorization: `OAuth ${token}`,
        file_offset: "0",
        "Content-Type": "application/pdf",
      },
      body: new Uint8Array(buffer),
    },
  );
  const uploaded = (await uploadRes.json()) as { h?: string; error?: MetaGraphErrorBody };
  if (!uploadRes.ok || !uploaded.h) {
    throw new Error(uploaded.error?.message || "Could not upload the prescription sample.");
  }
  return uploaded.h;
}

let prescriptionTemplateApproved = false;

async function prescriptionFileTemplateStatus(): Promise<"APPROVED" | "PENDING" | "MISSING" | "REJECTED"> {
  if (prescriptionTemplateApproved) return "APPROVED";
  const token = settings.whatsappAccessToken;
  const waba = settings.whatsappWabaId?.trim();
  if (!token || !waba) return "MISSING";
  const url = `https://graph.facebook.com/${settings.whatsappApiVersion}/${waba}/message_templates?name=${PRESCRIPTION_FILE_TEMPLATE}&fields=name,status`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = (await res.json()) as { data?: Array<{ status?: string }> };
  const status = data.data?.[0]?.status;
  if (!status) return "MISSING";
  if (status === "APPROVED") {
    prescriptionTemplateApproved = true;
    return "APPROVED";
  }
  if (status === "REJECTED") return "REJECTED";
  return "PENDING";
}

async function ensurePrescriptionFileTemplate(sample: Buffer): Promise<"APPROVED" | "PENDING" | "REJECTED"> {
  const current = await prescriptionFileTemplateStatus();
  if (current !== "MISSING") return current;
  const token = settings.whatsappAccessToken;
  const waba = settings.whatsappWabaId?.trim();
  if (!token || !waba) throw new Error("WhatsApp business account is not configured.");
  const handle = await uploadTemplateSample(sample, "Prescription-sample.pdf");
  const res = await fetch(
    `https://graph.facebook.com/${settings.whatsappApiVersion}/${waba}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: PRESCRIPTION_FILE_TEMPLATE,
        language: "en",
        category: "UTILITY",
        parameter_format: "NAMED",
        components: [
          {
            type: "HEADER",
            format: "DOCUMENT",
            example: { header_handle: [handle] },
          },
          {
            type: "BODY",
            text:
              "Your prescription from {{practice_name}} is attached.\n" +
              "Doctor: {{provider_name}}\n" +
              "Reply STOP to opt out of appointment alerts.",
            example: {
              body_text_named_params: [
                { param_name: "practice_name", example: "City Care Clinic" },
                { param_name: "provider_name", example: "Dr Anjali Mehta" },
              ],
            },
          },
        ],
      }),
    },
  );
  const created = (await res.json()) as { error?: MetaGraphErrorBody };
  if (!res.ok && !/already exists|duplicate/i.test(created.error?.message || "")) {
    throw new Error(created.error?.message || "Could not submit the prescription file template.");
  }
  const status = await prescriptionFileTemplateStatus();
  return status === "MISSING" ? "PENDING" : status;
}

/**
 * Send the prescription PDF outside the 24-hour chat window.
 * WhatsApp only delivers a file then when it is the header of an approved utility template.
 */
export async function sendPrescriptionPdfTemplate(
  to: string,
  opts: {
    filename: string;
    buffer: Buffer;
    practiceName: string;
    doctorName: string;
  },
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const token = settings.whatsappAccessToken;
  const phoneId = phoneNumberId ?? settings.whatsappPhoneNumberId;
  if (!token || !phoneId) {
    console.log(
      `[WhatsApp prescription template simulated] → ${to}: ${opts.filename}`,
    );
    return { ok: true, simulated: true, usedTemplate: true };
  }

  const status = prescriptionTemplateApproved
    ? "APPROVED"
    : await prescriptionFileTemplateStatus();
  if (status !== "APPROVED") {
    if (status === "MISSING") {
      void ensurePrescriptionFileTemplate(opts.buffer).catch((err) => {
        console.warn(
          "[whatsapp] prescription template submit failed:",
          err instanceof Error ? err.message : err,
        );
      });
    }
    return { ok: false, usedTemplate: true, error: "template-not-ready" };
  }

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", "application/pdf");
  form.append(
    "file",
    new Blob([new Uint8Array(opts.buffer)], { type: "application/pdf" }),
    opts.filename,
  );
  const uploadRes = await fetch(
    `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/media`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const uploadData = (await uploadRes.json()) as { id?: string; error?: MetaGraphErrorBody };
  if (!uploadRes.ok || !uploadData.id) {
    return failFromMeta(uploadData.error, uploadRes.statusText, { usedTemplate: true });
  }

  const res = await fetch(
    `https://graph.facebook.com/${settings.whatsappApiVersion}/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: formatE164(to),
        type: "template",
        template: {
          name: PRESCRIPTION_FILE_TEMPLATE,
          language: { code: "en" },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "document",
                  document: {
                    id: uploadData.id,
                    filename: opts.filename.slice(0, 240),
                  },
                },
              ],
            },
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  parameter_name: "practice_name",
                  text: opts.practiceName.slice(0, 200) || "Clinic",
                },
                {
                  type: "text",
                  parameter_name: "provider_name",
                  text: opts.doctorName.slice(0, 200) || "Doctor",
                },
              ],
            },
          ],
        },
      }),
    },
  );
  const data = (await res.json()) as {
    messages?: { id: string }[];
    error?: MetaGraphErrorBody;
  };
  if (!res.ok) {
    return failFromMeta(data.error, res.statusText, { usedTemplate: true });
  }
  return { ok: true, messageId: data.messages?.[0]?.id, usedTemplate: true };
}

/**
 * Prefer Meta template for proactive utility alerts; fall back to free-form
 * only when simulated / template not approved yet (dev) or send fails.
 */
export async function sendNotificationWhatsApp(
  to: string,
  templateKey: string,
  payload: Record<string, unknown>,
  phoneNumberId?: string,
): Promise<WhatsAppSendResult> {
  const def = getMetaTemplateByKey(templateKey);
  if (def) {
    const templated = await sendWhatsAppTemplate(
      to,
      templateKey,
      payload,
      phoneNumberId,
    );
    if (templated.ok || templated.simulated) return templated;
    console.warn(
      `[WhatsApp] template ${def.metaName} failed (${templated.error}); falling back to text`,
    );
  }

  const body = buildNotificationMessage(templateKey, {
    ...payload,
    templateKey,
  });
  return sendWhatsAppText(to, body, phoneNumberId);
}

export async function downloadWhatsAppMedia(
  mediaId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const token = settings.whatsappAccessToken;
  if (!token) {
    console.warn("[WhatsApp] media download skipped — WHATSAPP_ACCESS_TOKEN unset");
    return null;
  }

  const metaRes = await fetch(
    `https://graph.facebook.com/${settings.whatsappApiVersion}/${mediaId}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!metaRes.ok) {
    console.warn(
      `[WhatsApp] media meta failed ${metaRes.status} for ${mediaId}`,
    );
    return null;
  }

  const meta = (await metaRes.json()) as {
    url?: string;
    mime_type?: string;
  };
  if (!meta.url) return null;

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) {
    console.warn(`[WhatsApp] media bytes failed ${fileRes.status}`);
    return null;
  }

  return {
    buffer: Buffer.from(await fileRes.arrayBuffer()),
    mimeType: meta.mime_type || fileRes.headers.get("content-type") || "audio/ogg",
  };
}

function audioFilename(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) return "voice.mp3";
  if (mime.includes("mp4") || mime.includes("m4a")) return "voice.m4a";
  if (mime.includes("wav")) return "voice.wav";
  if (mime.includes("webm")) return "voice.webm";
  return "voice.ogg";
}

async function transcribeWithOpenAI(
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const apiKey = settings.openaiApiKey;
  if (!apiKey) return null;

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/ogg" }),
    audioFilename(mimeType),
  );
  form.append("model", "whisper-1");
  const lang = (process.env.WHATSAPP_STT_LANGUAGE ?? "").trim();
  if (lang) form.append("language", lang);

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(`[WhatsApp STT] OpenAI failed ${res.status}: ${errText.slice(0, 200)}`);
    return null;
  }
  const data = (await res.json()) as { text?: string };
  return data.text?.trim() || null;
}

async function transcribeWithHuggingFace(
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  const token = settings.hfToken;
  if (!token) return null;

  const model =
    process.env.WHATSAPP_STT_HF_MODEL || "openai/whisper-large-v3";

  let payload = buffer;
  let contentType = mimeType || "audio/ogg";
  const mime = (mimeType || "").toLowerCase().split(";")[0]!.trim();
  const needsConvert =
    mime &&
    !mime.includes("wav") &&
    !mime.includes("mpeg") &&
    !mime.includes("mp3") &&
    !mime.includes("flac");

  if (needsConvert) {
    try {
      const { normalizeAudioForStt } = await import("../../lib/audioToWav.js");
      const normalized = await normalizeAudioForStt(buffer, mimeType);
      payload = normalized.buffer;
      contentType = normalized.mimeType;
    } catch (err) {
      console.warn("[WhatsApp STT] audio normalize failed:", err);
      return null;
    }
  }

  const res = await fetch(
    `https://router.huggingface.co/hf-inference/models/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": contentType,
      },
      body: new Uint8Array(payload),
    },
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn(
      `[WhatsApp STT] HF failed ${res.status}: ${errText.slice(0, 200)}`,
    );
    return null;
  }

  const data = (await res.json()) as
    | { text?: string }
    | Array<{ text?: string }>;
  if (Array.isArray(data)) return data[0]?.text?.trim() || null;
  return data.text?.trim() || null;
}

/**
 * Speech-to-text for WhatsApp voice notes.
 * Prefers OpenAI Whisper when OPENAI_API_KEY is set; falls back to HF_TOKEN.
 */
export async function transcribeAudio(
  buffer: Buffer,
  mimeType = "audio/ogg",
): Promise<string | null> {
  if (!buffer.length) return null;

  const fromOpenAI = await transcribeWithOpenAI(buffer, mimeType);
  if (fromOpenAI) return fromOpenAI;

  const fromHf = await transcribeWithHuggingFace(buffer, mimeType);
  if (fromHf) return fromHf;

  if (!settings.openaiApiKey && !settings.hfToken) {
    console.warn(
      "[WhatsApp STT] No OPENAI_API_KEY or HF_TOKEN — cannot transcribe voice notes",
    );
  }
  return null;
}

export function isSttConfigured(): boolean {
  return Boolean(settings.openaiApiKey || settings.hfToken);
}

export function verifyMetaWebhookSignature(
  rawBody: string,
  signatureHeader: string | undefined,
): boolean {
  const secret = settings.whatsappAppSecret;
  if (!secret) return true;
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.slice(7);

  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export function buildNotificationMessage(
  type: string,
  payload: Record<string, unknown>,
): string {
  return renderNotificationTemplate(type, payload);
}
