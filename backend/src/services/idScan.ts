import { AppError } from "../core/response.js";
import { settings } from "../config/index.js";
import { normalizeGender as normalizeGenderValue } from "../core/gender.js";

export type IdScanFields = {
  documentType: string | null;
  name: string | null;
  dateOfBirth: string | null;
  gender: "male" | "female" | "others" | null;
  address: string | null;
  contactNumber: string | null;
  documentNumberMasked: string | null;
  aadharNumber: string | null;
  panNumber: string | null;
  confidence: number;
};

export type ProfessionalScanFields = {
  documentType: string | null;
  name: string | null;
  clinicName: string | null;
  licenseNo: string | null;
  registrationNo: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  specialty: string | null;
  confidence: number;
};

const ID_PROMPT = `You read Indian ID cards (Aadhaar, PAN, passport, etc.).
Reply with a single JSON object only — no markdown, no explanation:
{"documentType":"AADHAAR"|"PAN"|"DRIVING_LICENCE"|"PASSPORT"|"VOTER_ID"|"OTHER"|null,"name":string|null,"dateOfBirth":"YYYY-MM-DD"|null,"gender":"male"|"female"|"others"|null,"address":string|null,"contactNumber":string|null,"documentNumberMasked":string|null,"aadharNumber":string|null,"panNumber":string|null,"confidence":number}`;

const PRO_PROMPT = `You read doctor/clinic documents (visiting card, letterhead, licence).
Reply with a single JSON object only — no markdown:
{"documentType":"VISITING_CARD"|"LETTERHEAD"|"MEDICAL_LICENCE"|"CLINIC_REGISTRATION"|"OTHER"|null,"name":string|null,"clinicName":string|null,"licenseNo":string|null,"registrationNo":string|null,"email":string|null,"phone":string|null,"address":string|null,"specialty":string|null,"confidence":number}`;

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

function isPdfMime(mimeType: string): boolean {
  const m = mimeType.toLowerCase();
  return m === "application/pdf" || m.includes("pdf");
}

/**
 * Rasterize page 1 of a PDF to PNG for the vision OCR stack
 * (OpenAI / HF chat completions only accept images).
 */
async function pdfFirstPageToPng(pdfBytes: Buffer): Promise<Buffer> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { createCanvas } = await import("@napi-rs/canvas");

  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    // Node has no web worker; keep parsing on this thread.
    disableWorker: true,
  } as Parameters<typeof getDocument>[0]);
  const pdf = await loadingTask.promise;
  if (pdf.numPages < 1) {
    throw new AppError(422, "PDF has no pages to read.");
  }

  const page = await pdf.getPage(1);
  // Cap long edge so vision payloads stay small; IDs are usually one page.
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(2.5, 1600 / Math.max(base.width, base.height, 1));
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(
    Math.max(1, Math.ceil(viewport.width)),
    Math.max(1, Math.ceil(viewport.height)),
  );
  const ctx = canvas.getContext("2d");
  await page
    .render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    })
    .promise;
  return canvas.toBuffer("image/png");
}

async function prepareDocument(input: {
  imageBase64: string;
  mimeType?: string;
}): Promise<{ mimeType: string; raw: string }> {
  let raw = input.imageBase64.trim();
  let mimeType = (input.mimeType || "image/jpeg").toLowerCase();

  const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(raw);
  if (dataUrl) {
    mimeType = dataUrl[1]!.toLowerCase();
    raw = dataUrl[2]!;
  }

  if (!ALLOWED_MIME.has(mimeType) && !isPdfMime(mimeType)) {
    throw new AppError(
      400,
      "Unsupported file type. Upload a JPG, PNG, WEBP, or PDF.",
    );
  }
  if (raw.length > 12_000_000) {
    throw new AppError(400, "File is too large. Keep under ~9 MB.");
  }

  if (isPdfMime(mimeType)) {
    try {
      const png = await pdfFirstPageToPng(Buffer.from(raw, "base64"));
      return { mimeType: "image/png", raw: png.toString("base64") };
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.warn(
        "[idScan] PDF rasterize failed:",
        err instanceof Error ? err.message : err,
      );
      throw new AppError(
        422,
        "Could not read that PDF. Send a clearer JPG/PNG/PDF of the ID, or type your full name.",
      );
    }
  }

  return { mimeType, raw };
}

function parseJsonFromModel(text: string): Record<string, unknown> {
  let raw = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  if (fenced?.[1]) raw = fenced[1].trim();
  else {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  }

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new AppError(
      422,
      "Could not read the document. Try a clearer, well-lit photo.",
    );
  }
}

function normalizeGender(value: unknown): IdScanFields["gender"] {
  return normalizeGenderValue(value);
}

function normalizeDob(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw);
  if (dmy) {
    return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  }
  return null;
}

function normalizePhone(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
}

function normalizeAadhar(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 12 ? digits : null;
}

function normalizePan(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const pan = value.trim().toUpperCase();
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan) ? pan : null;
}

function toIdFields(parsed: Record<string, unknown>): IdScanFields {
  return {
    documentType:
      typeof parsed.documentType === "string" ? parsed.documentType : null,
    name:
      typeof parsed.name === "string" && parsed.name.trim()
        ? parsed.name.trim()
        : null,
    dateOfBirth: normalizeDob(parsed.dateOfBirth),
    gender: normalizeGender(parsed.gender),
    address:
      typeof parsed.address === "string" && parsed.address.trim()
        ? parsed.address.trim()
        : null,
    contactNumber: normalizePhone(parsed.contactNumber),
    documentNumberMasked:
      typeof parsed.documentNumberMasked === "string"
        ? parsed.documentNumberMasked
        : null,
    aadharNumber: normalizeAadhar(parsed.aadharNumber),
    panNumber: normalizePan(parsed.panNumber),
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };
}

function toProfessionalFields(
  parsed: Record<string, unknown>,
): ProfessionalScanFields {
  const str = (key: string) => {
    const v = parsed[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return {
    documentType: str("documentType"),
    name: str("name"),
    clinicName: str("clinicName"),
    licenseNo: str("licenseNo"),
    registrationNo: str("registrationNo"),
    email: str("email")?.toLowerCase() ?? null,
    phone: normalizePhone(parsed.phone ?? parsed.contactNumber),
    address: str("address"),
    specialty: str("specialty"),
    confidence:
      typeof parsed.confidence === "number"
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.5,
  };
}

function extractMessageText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";

  const content = message.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const joined = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof (part as { text?: string }).text === "string"
        ) {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("\n")
      .trim();
    if (joined) return joined;
  }

  const reasoning = message.reasoning;
  if (typeof reasoning === "string" && reasoning.trim()) {
    return reasoning.trim();
  }

  return "";
}

async function callVisionModel(
  mimeType: string,
  base64: string,
  systemPrompt: string,
): Promise<string> {
  if (!settings.hfToken && !settings.openaiApiKey) {
    throw new AppError(
      503,
      "Document scan is not configured. Set OPENAI_API_KEY on the server.",
    );
  }

  const useOpenAi = Boolean(settings.openaiApiKey);
  const url = useOpenAi
    ? "https://api.openai.com/v1/chat/completions"
    : `${settings.hfBaseUrl}/chat/completions`;
  const apiKey = useOpenAi ? settings.openaiApiKey! : settings.hfToken!;
  // Prefer a small vision model for OCR; HF_CHAT_MODEL (e.g. Qwen3.8-27B) is slower/heavier.
  const model = useOpenAi
    ? "gpt-4o-mini"
    : settings.hfOcrModel ||
      settings.hfVisionModel ||
      "Qwen/Qwen3.5-9B:fastest";

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "text", text: "Extract fields from this image." },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: "low",
            },
          },
        ],
      },
    ],
  };

  if (useOpenAi) {
    body.response_format = { type: "json_object" };
  } else {
    // Qwen3 "thinking" can consume the token budget and leave content empty.
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    choices?: Array<{
      message?: Record<string, unknown>;
      finish_reason?: string;
    }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    throw new AppError(
      502,
      data.error?.message ?? "Document scan service failed. Try again.",
    );
  }

  const message = data.choices?.[0]?.message;
  const text = extractMessageText(message);
  if (!text) {
    console.warn(
      "[idScan] empty model output",
      JSON.stringify({
        finish: data.choices?.[0]?.finish_reason,
        keys: message ? Object.keys(message) : [],
      }),
    );
    throw new AppError(502, "Document scan returned no data. Try again.");
  }

  return text;
}

export const IdScanService = {
  async extractFromBase64(input: {
    imageBase64: string;
    mimeType?: string;
  }): Promise<IdScanFields> {
    const { mimeType, raw } = await prepareDocument(input);
    const text = await callVisionModel(mimeType, raw, ID_PROMPT);
    const fields = toIdFields(parseJsonFromModel(text));

    if (
      !fields.name &&
      !fields.dateOfBirth &&
      !fields.address &&
      !fields.contactNumber &&
      !fields.aadharNumber &&
      !fields.panNumber
    ) {
      throw new AppError(
        422,
        "Could not read identity details. Use a clear JPG/PNG/PDF of the ID.",
      );
    }

    return fields;
  },

  async extractProfessionalFromBase64(input: {
    imageBase64: string;
    mimeType?: string;
  }): Promise<ProfessionalScanFields> {
    const { mimeType, raw } = await prepareDocument(input);
    const text = await callVisionModel(mimeType, raw, PRO_PROMPT);
    const fields = toProfessionalFields(parseJsonFromModel(text));

    if (
      !fields.name &&
      !fields.clinicName &&
      !fields.licenseNo &&
      !fields.registrationNo &&
      !fields.email &&
      !fields.phone &&
      !fields.address
    ) {
      throw new AppError(
        422,
        "Could not read details. Use a clear JPG/PNG/PDF of the document.",
      );
    }

    return fields;
  },
};
