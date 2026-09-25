import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import { AppError } from "../core/response.js";
import { settings } from "../config/index.js";
import { normalizeGender as normalizeGenderValue } from "../core/gender.js";
import { llmChatProviders, llmVisionProviders } from "../lib/llm.js";

const nodeRequire = createRequire(import.meta.url);

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

/**
 * Strong Aadhaar/PAN OCR instructions — English Latin name preferred,
 * Indian DOB formats, bilingual cards. Phone is optional (WhatsApp uses sender).
 */
const ID_PROMPT = `You are an expert OCR system for Indian identity documents (Aadhaar, PAN, passport, driving licence, voter ID).

Return ONE JSON object only — no markdown, no commentary:
{"documentType":"AADHAAR"|"PAN"|"DRIVING_LICENCE"|"PASSPORT"|"VOTER_ID"|"OTHER"|null,"name":string|null,"dateOfBirth":"YYYY-MM-DD"|null,"gender":"male"|"female"|"others"|null,"address":string|null,"contactNumber":null,"documentNumberMasked":string|null,"aadharNumber":string|null,"panNumber":string|null,"confidence":number}

Rules:
- Prefer the English / Latin-script name printed on the card (not Devanagari alone). Title-case the name (e.g. "Anurag Nanda"). Omit titles like Mr/Mrs/Shri.
- dateOfBirth: look for labels "Date of Birth", "DOB", "जन्मतिथि" — value is often DD/MM/YYYY under or beside the label. Convert to YYYY-MM-DD. Never invent a DOB.
- gender: map M/Male/पुरुष → male; F/Female/महिला → female; else others when printed.
- address: full address line(s) as printed; keep pin code if visible.
- aadharNumber: 12 digits only when clearly visible (Aadhaar). panNumber: ABCDE1234F form when clearly visible (PAN).
- documentNumberMasked: last 4 digits / masked form if full number is hidden.
- contactNumber: ALWAYS null (registered mobile is NOT taken from the ID).
- confidence: 0–1 for how sure you are of name + DOB.
- If the image is blurry or unreadable, still return JSON with nulls and low confidence — do not guess.`;

const PRO_PROMPT = `You read doctor/clinic documents (visiting card, letterhead, medical licence, clinic registration).

Return ONE JSON object only — no markdown:
{"documentType":"VISITING_CARD"|"LETTERHEAD"|"MEDICAL_LICENCE"|"CLINIC_REGISTRATION"|"OTHER"|null,"name":string|null,"clinicName":string|null,"licenseNo":string|null,"registrationNo":string|null,"email":string|null,"phone":string|null,"address":string|null,"specialty":string|null,"confidence":number}

Rules:
- Prefer Latin-script name and clinic name.
- phone: 10-digit Indian mobile when printed; else null.
- Do not invent licence numbers. confidence 0–1.`;

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

function looksLikePdf(bytes: Buffer): boolean {
  if (bytes.length < 5) return false;
  // BOM / leading whitespace then %PDF
  const head = bytes.subarray(0, 1024).toString("latin1");
  return /%PDF-/i.test(head);
}

type PdfJsPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: Record<string, unknown>) => { promise: Promise<void> };
  getTextContent: () => Promise<{ items: Array<{ str?: string }> }>;
};

type PdfJsDoc = {
  numPages: number;
  getPage: (n: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<void>;
};

class NodeCanvasFactory {
  create(width: number, height: number) {
    const w = Math.max(1, Math.ceil(width));
    const h = Math.max(1, Math.ceil(height));
    const canvas = createCanvas(w, h);
    const context = canvas.getContext("2d");
    return { canvas, context };
  }
  reset(
    canvasAndContext: { canvas: { width: number; height: number } },
    width: number,
    height: number,
  ) {
    canvasAndContext.canvas.width = Math.max(1, Math.ceil(width));
    canvasAndContext.canvas.height = Math.max(1, Math.ceil(height));
  }
  destroy(canvasAndContext: {
    canvas: { width: number; height: number };
  }) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
  }
}

function pdfAssetUrls(): { cMapUrl: string; standardFontDataUrl: string } {
  const root = path.dirname(nodeRequire.resolve("pdfjs-dist/package.json"));
  return {
    cMapUrl: `${pathToFileURL(path.join(root, "cmaps")).href}/`,
    standardFontDataUrl: `${pathToFileURL(path.join(root, "standard_fonts")).href}/`,
  };
}

async function loadPdfDocument(pdfBytes: Buffer): Promise<PdfJsDoc> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { cMapUrl, standardFontDataUrl } = pdfAssetUrls();
  const canvasFactory = new NodeCanvasFactory();
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBytes),
    useSystemFonts: true,
    disableWorker: true,
    isEvalSupported: false,
    cMapUrl,
    cMapPacked: true,
    standardFontDataUrl,
    canvasFactory,
    verbosity: 0,
  } as Parameters<typeof getDocument>[0]);
  return (await loadingTask.promise) as unknown as PdfJsDoc;
}

/** Pull selectable text (DigiLocker / e-Aadhaar text PDFs). */
async function extractPdfPlainText(pdf: PdfJsDoc): Promise<string> {
  const maxPages = Math.min(pdf.numPages, 3);
  const parts: string[] = [];
  for (let n = 1; n <= maxPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => (typeof it.str === "string" ? it.str : ""))
      .filter(Boolean)
      .join(" ");
    if (line.trim()) parts.push(line.trim());
  }
  return parts.join("\n").replace(/[ \t]+/g, " ").trim();
}

function nonWhiteRatio(
  ctx: {
    getImageData: (
      x: number,
      y: number,
      w: number,
      h: number,
    ) => { data: Uint8ClampedArray };
  },
  width: number,
  height: number,
): number {
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));
  let nonWhite = 0;
  let samples = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const { data } = ctx.getImageData(x, y, 1, 1);
      samples++;
      if (data[0]! < 250 || data[1]! < 250 || data[2]! < 250) nonWhite++;
    }
  }
  return samples ? nonWhite / samples : 0;
}

/**
 * One-pass PDF prepare: extract embedded text + raster pages 1–2 to PNG.
 * CanvasFactory + cmaps/fonts so DigiLocker / CID glyphs actually draw.
 */
async function preparePdfForOcr(
  pdfBytes: Buffer,
): Promise<{ png: Buffer; pdfText: string }> {
  const pdf = await loadPdfDocument(pdfBytes);
  try {
    if (pdf.numPages < 1) {
      throw new AppError(422, "PDF has no pages to read.");
    }

    let pdfText = "";
    try {
      pdfText = await extractPdfPlainText(pdf);
    } catch (err) {
      console.warn(
        "[idScan] PDF text extract failed:",
        err instanceof Error ? err.message : err,
      );
    }

    const pageCount = Math.min(pdf.numPages, 2);
    const pagePngs: Array<{
      width: number;
      height: number;
      canvas: Canvas;
    }> = [];

    for (let n = 1; n <= pageCount; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      // Target ~2200px on the long edge for small Aadhaar print.
      const scale = Math.min(3.5, 2200 / Math.max(base.width, base.height, 1));
      const viewport = page.getViewport({ scale });
      const width = Math.max(1, Math.ceil(viewport.width));
      const height = Math.max(1, Math.ceil(viewport.height));
      const canvas: Canvas = createCanvas(width, height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);

      await page.render({
        canvasContext: ctx,
        viewport,
        canvas,
        background: "#ffffff",
      }).promise;

      const ink = nonWhiteRatio(ctx, width, height);
      console.info(
        `[idScan] PDF page ${n}/${pageCount} raster ${width}x${height} ink=${ink.toFixed(3)}`,
      );
      // Mostly-white DigiLocker pages can still have usable text; only skip near-empty.
      if (ink < 0.0008 && !pdfText) {
        console.warn(`[idScan] PDF page ${n} looks blank after rasterize`);
        continue;
      }
      if (ink < 0.0008 && pdfText) {
        // Keep a blank-ish page if we already have text — vision is fallback only.
        continue;
      }
      pagePngs.push({ width, height, canvas });
    }

    // Text-only DigiLocker: synthesize a simple PNG so callers always get an image.
    if (pagePngs.length === 0) {
      if (pdfText && textLooksUsefulForId(pdfText)) {
        const stub: Canvas = createCanvas(32, 32);
        const sctx = stub.getContext("2d");
        sctx.fillStyle = "#ffffff";
        sctx.fillRect(0, 0, 32, 32);
        return { png: stub.toBuffer("image/png"), pdfText };
      }
      throw new AppError(
        422,
        "Could not render that PDF. Export a clearer DigiLocker PDF or send a JPG/PNG photo of the ID.",
      );
    }

    if (pagePngs.length === 1) {
      return { png: pagePngs[0]!.canvas.toBuffer("image/png"), pdfText };
    }

    // Stack pages vertically with a small gap (front + back of Aadhaar).
    const gap = 16;
    const totalW = Math.max(...pagePngs.map((p) => p.width));
    const totalH =
      pagePngs.reduce((sum, p) => sum + p.height, 0) +
      gap * (pagePngs.length - 1);
    const stacked: Canvas = createCanvas(totalW, totalH);
    const sctx = stacked.getContext("2d");
    sctx.fillStyle = "#ffffff";
    sctx.fillRect(0, 0, totalW, totalH);
    let y = 0;
    for (const p of pagePngs) {
      sctx.drawImage(p.canvas, 0, y);
      y += p.height + gap;
    }
    return { png: stacked.toBuffer("image/png"), pdfText };
  } finally {
    try {
      await pdf.destroy?.();
    } catch {
      /* pdfjs may not expose destroy */
    }
  }
}

const TEXT_ID_PROMPT = `You extract identity fields from OCR / DigiLocker PDF text of an Indian ID (Aadhaar, PAN, etc.).
Return ONE JSON object only — no markdown:
{"documentType":"AADHAAR"|"PAN"|"DRIVING_LICENCE"|"PASSPORT"|"VOTER_ID"|"OTHER"|null,"name":string|null,"dateOfBirth":"YYYY-MM-DD"|null,"gender":"male"|"female"|"others"|null,"address":string|null,"contactNumber":null,"documentNumberMasked":string|null,"aadharNumber":string|null,"panNumber":string|null,"confidence":number}
Prefer English Latin name. Look for "Date of Birth" / "DOB" / "जन्मतिथि" and convert DD/MM/YYYY to YYYY-MM-DD. contactNumber must be null. Do not invent values.`;

/** Regex fallback when vision/LLM misses an obvious labeled DOB on the card. */
export function heuristicDobFromText(text: string): string | null {
  if (!text?.trim()) return null;
  const labeled = text.match(
    /(?:जन्मतिथि|date\s*of\s*birth|d\.?\s*o\.?\s*b\.?)\s*[:\-]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
  );
  if (labeled?.[1]) return normalizeDob(labeled[1]);
  // DigiLocker often puts the date on the next line after the label.
  const nextLine = text.match(
    /(?:जन्मतिथि|date\s*of\s*birth|d\.?\s*o\.?\s*b\.?)\s*[:\-]?\s*[\r\n]+\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{4})/i,
  );
  if (nextLine?.[1]) return normalizeDob(nextLine[1]);
  return null;
}

function mergeHeuristicDob(fields: IdScanFields, text?: string | null): IdScanFields {
  if (fields.dateOfBirth || !text) return fields;
  const dob = heuristicDobFromText(text);
  if (!dob) return fields;
  console.info(`[idScan] heuristic DOB from text: ${dob}`);
  return { ...fields, dateOfBirth: dob };
}

async function callTextModel(systemPrompt: string, userText: string): Promise<string> {
  const providers = llmChatProviders({ includeDeepSeek: true });
  if (!providers.length) {
    throw new AppError(503, "Document scan is not configured. Set OPENAI_API_KEY.");
  }
  let lastErr: unknown;
  for (const provider of providers) {
    try {
      const body: Record<string, unknown> = {
        model: provider.model,
        temperature: 0,
        max_tokens: 900,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Extract identity fields from this document text:\n\n${userText.slice(0, 12000)}`,
          },
        ],
      };
      if (provider.jsonObject) body.response_format = { type: "json_object" };
      else body.chat_template_kwargs = { enable_thinking: false };

      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        choices?: Array<{ message?: Record<string, unknown> }>;
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(data.error?.message ?? `${provider.label} failed`);
      }
      const text = extractMessageText(data.choices?.[0]?.message);
      if (!text) throw new Error(`${provider.label} empty text OCR`);
      console.info(`[idScan] PDF text OCR via ${provider.label}`);
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[idScan] text OCR ${provider.label} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("PDF text OCR failed");
}

function textLooksUsefulForId(text: string): boolean {
  if (text.length < 40) return false;
  const letters = (text.match(/[A-Za-z\u0900-\u097F]/g) || []).length;
  if (letters < 12) return false;
  // DigiLocker / Aadhaar / PAN cues
  return /aadhaar|aadhar|uidai|permanent account|pan|dob|date of birth|जन्मतिथि|gender|male|female|पुरुष|महिला|\d{4}\s?\d{4}\s?\d{4}/i.test(
    text,
  ) || letters >= 40;
}

async function prepareDocument(input: {
  imageBase64: string;
  mimeType?: string;
}): Promise<{ mimeType: string; raw: string; pdfText?: string }> {
  let raw = input.imageBase64.trim();
  let mimeType = (input.mimeType || "image/jpeg").toLowerCase();

  const dataUrl = /^data:([^;]+);base64,(.+)$/i.exec(raw);
  if (dataUrl) {
    mimeType = dataUrl[1]!.toLowerCase();
    raw = dataUrl[2]!;
  }

  if (raw.length > 12_000_000) {
    throw new AppError(400, "File is too large. Keep under ~9 MB.");
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(raw, "base64");
  } catch {
    throw new AppError(400, "Invalid file encoding.");
  }

  const isPdf = isPdfMime(mimeType) || looksLikePdf(bytes);
  if (
    !ALLOWED_MIME.has(mimeType) &&
    !isPdfMime(mimeType) &&
    !isPdf
  ) {
    throw new AppError(
      400,
      "Unsupported file type. Upload a JPG, PNG, WEBP, or PDF.",
    );
  }

  if (isPdf) {
    try {
      // Single open: text first (DigiLocker), then high-DPI raster for vision.
      const { png, pdfText } = await preparePdfForOcr(bytes);
      console.info(
        `[idScan] PDF prepared pngBytes=${png.length} textChars=${pdfText.length}`,
      );
      return {
        mimeType: "image/png",
        raw: png.toString("base64"),
        pdfText: pdfText || undefined,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      console.warn(
        "[idScan] PDF prepare failed:",
        err instanceof Error ? err.message : err,
      );
      throw new AppError(
        422,
        "Could not read that PDF. Send a clearer DigiLocker PDF or a JPG/PNG photo of the ID.",
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

const MONTHS: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  sept: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

function normalizeDob(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split("-").map(Number);
    if (
      y! >= 1900 &&
      y! <= new Date().getFullYear() &&
      m! >= 1 &&
      m! <= 12 &&
      d! >= 1 &&
      d! <= 31
    ) {
      return raw;
    }
    return null;
  }

  // DD/MM/YYYY or DD-MM-YYYY (India)
  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(raw);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (
      year >= 1900 &&
      year <= new Date().getFullYear() &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31
    ) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // 01 Jan 1990 / 1 January 1990
  const named =
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(raw) ||
    /^(\d{1,2})-([A-Za-z]+)-(\d{4})$/.exec(raw);
  if (named) {
    const month = MONTHS[named[2]!.toLowerCase()];
    const day = Number(named[1]);
    const year = Number(named[3]);
    if (
      month &&
      year >= 1900 &&
      year <= new Date().getFullYear() &&
      day >= 1 &&
      day <= 31
    ) {
      return `${year}-${month}-${String(day).padStart(2, "0")}`;
    }
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

/** Clean OCR name: drop titles, collapse spaces, prefer printable Latin+space. */
function normalizeName(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  let name = value
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(
      /^(shri|shree|smt|mr|mrs|ms|miss|dr|prof)\.?\s+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  // If mixed scripts, prefer a Latin-heavy segment when present.
  const latin = name.match(/[A-Za-z][A-Za-z .']{1,}/g);
  if (latin && latin.join(" ").replace(/\s+/g, " ").trim().length >= 3) {
    const latinJoined = latin.join(" ").replace(/\s+/g, " ").trim();
    if (latinJoined.length >= Math.min(3, name.length / 2)) {
      name = latinJoined;
    }
  }

  if (name.length < 2) return null;
  // Title-case Latin words; leave non-Latin as-is.
  name = name
    .split(" ")
    .map((w) =>
      /^[A-Za-z'.]+$/.test(w)
        ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        : w,
    )
    .join(" ");
  return name.slice(0, 120);
}

function toIdFields(parsed: Record<string, unknown>): IdScanFields {
  return {
    documentType:
      typeof parsed.documentType === "string" ? parsed.documentType : null,
    name: normalizeName(parsed.name),
    dateOfBirth: normalizeDob(parsed.dateOfBirth),
    gender: normalizeGender(parsed.gender),
    address:
      typeof parsed.address === "string" && parsed.address.trim()
        ? parsed.address.trim().slice(0, 500)
        : null,
    // Never trust ID-printed phone for GlucoGuide registration (WhatsApp sender is used).
    contactNumber: null,
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
    name: normalizeName(parsed.name),
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

async function callVisionModelOnce(
  mimeType: string,
  base64: string,
  systemPrompt: string,
  provider: {
    label: string;
    url: string;
    apiKey: string;
    model: string;
    jsonObject?: boolean;
  },
): Promise<string> {
  // ID OCR needs high detail — "low" often misses Aadhaar name/DOB text.
  const model =
    /openai/i.test(provider.label) && process.env.OPENAI_OCR_MODEL
      ? process.env.OPENAI_OCR_MODEL
      : provider.model;

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Read all printed fields carefully from this identity/document image and return JSON only.",
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
  };

  if (provider.jsonObject) {
    body.response_format = { type: "json_object" };
  } else {
    // Qwen3 "thinking" can consume the token budget and leave content empty.
    body.chat_template_kwargs = { enable_thinking: false };
  }

  const res = await fetch(provider.url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
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
    throw new Error(
      data.error?.message ?? `${provider.label} document scan failed (${res.status})`,
    );
  }

  const message = data.choices?.[0]?.message;
  const text = extractMessageText(message);
  if (!text) {
    console.warn(
      "[idScan] empty model output",
      JSON.stringify({
        provider: provider.label,
        model,
        finish: data.choices?.[0]?.finish_reason,
        keys: message ? Object.keys(message) : [],
      }),
    );
    throw new Error(`${provider.label} returned empty OCR content`);
  }

  return text;
}

async function callVisionModel(
  mimeType: string,
  base64: string,
  systemPrompt: string,
): Promise<string> {
  const providers = llmVisionProviders();
  if (providers.length === 0) {
    throw new AppError(
      503,
      "Document scan is not configured. Set OPENAI_API_KEY on the server.",
    );
  }

  // Prefer OpenAI for OCR, then HF. Prefer HF OCR model when configured.
  const ordered = [...providers].sort((a, b) => {
    const rank = (p: { label: string }) =>
      /openai/i.test(p.label) ? 0 : /hugging/i.test(p.label) ? 1 : 2;
    return rank(a) - rank(b);
  });

  // Use dedicated HF OCR/vision model when present.
  const withHfOcr = ordered.map((p) => {
    if (/hugging/i.test(p.label)) {
      return {
        ...p,
        model:
          settings.hfOcrModel ||
          settings.hfVisionModel ||
          p.model ||
          "Qwen/Qwen3.5-9B:fastest",
      };
    }
    // Default OpenAI OCR to gpt-4o for small ID text (override with OPENAI_OCR_MODEL).
    if (/openai/i.test(p.label)) {
      return {
        ...p,
        model: process.env.OPENAI_OCR_MODEL || "gpt-4o",
      };
    }
    return p;
  });

  let lastErr: unknown;
  for (const provider of withHfOcr) {
    try {
      const text = await callVisionModelOnce(
        mimeType,
        base64,
        systemPrompt,
        provider,
      );
      console.info(`[idScan] OCR via ${provider.label} model=${provider.model}`);
      return text;
    } catch (err) {
      lastErr = err;
      console.warn(
        `[idScan] ${provider.label} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (lastErr instanceof AppError) throw lastErr;
  throw new AppError(
    502,
    lastErr instanceof Error
      ? lastErr.message
      : "Document scan service failed. Try again.",
  );
}

export const IdScanService = {
  async extractFromBase64(input: {
    imageBase64: string;
    mimeType?: string;
  }): Promise<IdScanFields> {
    const { mimeType, raw, pdfText } = await prepareDocument(input);

    // DigiLocker / text PDFs: parse embedded text first (more reliable than raster).
    if (pdfText && textLooksUsefulForId(pdfText)) {
      try {
        const textJson = await callTextModel(TEXT_ID_PROMPT, pdfText);
        const fromText = mergeHeuristicDob(
          toIdFields(parseJsonFromModel(textJson)),
          pdfText,
        );
        if (fromText.name || fromText.dateOfBirth || fromText.aadharNumber || fromText.panNumber) {
          console.info(
            `[idScan] PDF text path ok name=${fromText.name ?? "—"} dob=${fromText.dateOfBirth ?? "—"}`,
          );
          return fromText;
        }
      } catch (err) {
        console.warn(
          "[idScan] PDF text path failed, falling back to vision:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    const text = await callVisionModel(mimeType, raw, ID_PROMPT);
    const fields = mergeHeuristicDob(
      toIdFields(parseJsonFromModel(text)),
      pdfText,
    );

    if (
      !fields.name &&
      !fields.dateOfBirth &&
      !fields.address &&
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
