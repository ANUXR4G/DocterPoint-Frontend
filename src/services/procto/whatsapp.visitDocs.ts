/**
 * Patient WhatsApp image/PDF → PracticeBooking.documents (doctor visit).
 * Uses the same Cloudinary unsigned preset as web/provider uploads.
 */
import { BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { uuidToBase64 } from "../../core/security.js";
import { socketManager } from "../../core/socket.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";
import type { WaLang } from "./whatsapp.i18n.js";
import { BotPrompts } from "./whatsapp.templates.js";

const CLOUD_NAME = "dwhlynqj3";
const UPLOAD_PRESET = "gluco-guide-users";
const MAX_BOOKING_DOCUMENTS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

const OPEN_STATUSES: BookingStatus[] = [
  BookingStatus.SCHEDULED,
  BookingStatus.REQUESTED,
  BookingStatus.ACCEPTED,
  BookingStatus.WAITING,
  BookingStatus.IN_PROGRESS,
];

export type VisitDocItem = {
  name: string;
  url: string;
  uploadedAt: string;
};

function last10(phone: string): string {
  return String(phone || "").replace(/\D/g, "").slice(-10);
}

export function isVisitDocumentMime(mimeType: string): boolean {
  const m = (mimeType || "").toLowerCase();
  return (
    m.startsWith("image/") ||
    m.includes("pdf") ||
    m === "application/pdf"
  );
}

/** Captions that mean “this is my ID for registration”, not a visit report. */
export function isIdRegistrationCaption(caption: string): boolean {
  const t = caption.trim().toLowerCase();
  if (!t) return false;
  return /\b(aadhaar|aadhar|pan|passport|voter|id\s*card|identity|register|signup|sign\s*up|आधार|पैन)\b/.test(
    t,
  );
}

export function isReportHowToCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(report|reports|document|documents|send\s*report|attach|lab\s*report|prescription|rx|रिपोर्ट|दस्तावेज)(\s|$)/i.test(
    t,
  );
}

export function isListDocsCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  return /^(my\s*docs?|list\s*docs?|documents?|मेरे\s*डॉक|मेरी\s*रिपोर्ट)(\s|$)/i.test(
    t,
  );
}

function safeFilename(name: string, mimeType: string): string {
  const base = name
    .replace(/[^\w.\- ()[\]]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80)
    .trim();
  if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return base;
  const m = (mimeType || "").toLowerCase();
  const ext = m.includes("pdf")
    ? "pdf"
    : m.includes("png")
      ? "png"
      : m.includes("webp")
        ? "webp"
        : "jpg";
  return `${base || "report"}.${ext}`;
}

function publicIdFromName(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .slice(0, 40);
  return `wa-${base || "doc"}-${Date.now()}`;
}

export async function uploadBufferToCloudinary(opts: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<{ url: string; name: string }> {
  if (opts.buffer.length > MAX_BYTES) {
    throw new Error("File too large (max 10 MB).");
  }
  const filename = safeFilename(opts.filename, opts.mimeType);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(opts.buffer)], {
      type: opts.mimeType || "application/octet-stream",
    }),
    filename,
  );
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("public_id", publicIdFromName(filename));

  const endpoint = (opts.mimeType || "").toLowerCase().startsWith("image/")
    ? "image/upload"
    : "auto/upload";

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${endpoint}`,
    { method: "POST", body: form },
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Cloudinary upload failed ${res.status}: ${errText.slice(0, 160)}`,
    );
  }
  const data = (await res.json()) as {
    secure_url?: string;
    original_filename?: string;
  };
  if (!data.secure_url) throw new Error("Cloudinary returned no URL.");
  return {
    url: data.secure_url,
    name: filename || data.original_filename || "Document",
  };
}

export async function findOpenBookingForWhatsApp(
  practiceId: string,
  patientPhone: string,
) {
  const digits = last10(patientPhone);
  if (digits.length < 10) return null;

  return prisma.practiceBooking.findFirst({
    where: {
      practiceId,
      status: { in: OPEN_STATUSES },
      OR: [
        { patientPhone: { endsWith: digits } },
        { patientPhone },
      ],
    },
    orderBy: [{ slotStart: "desc" }, { updatedAt: "desc" }],
  });
}

function readDocuments(raw: unknown): VisitDocItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((d) => {
      const row = d as { name?: string; url?: string; uploadedAt?: string };
      return {
        name: String(row.name || "").trim() || "Document",
        url: String(row.url || "").trim(),
        uploadedAt: row.uploadedAt || new Date().toISOString(),
      };
    })
    .filter((d) => d.url.length > 0)
    .slice(0, MAX_BOOKING_DOCUMENTS);
}

async function notifyDoctorCareChat(opts: {
  practiceId: string;
  patientPhone: string;
  providerId: string;
  patientId?: string | null;
  docName: string;
  docCount: number;
}) {
  const digits = last10(opts.patientPhone);
  let patientUserId = opts.patientId ?? null;
  if (!patientUserId) {
    const user = await prisma.user.findFirst({
      where: {
        role: "user",
        OR: [
          { phone: { endsWith: digits } },
          { patient: { is: { contactNumber: { endsWith: digits } } } },
        ],
      },
      select: { id: true },
    });
    patientUserId = user?.id ?? null;
  }
  if (!patientUserId) return;

  const content =
    `📎 Attached a visit document via WhatsApp: *${opts.docName}* ` +
    `(${opts.docCount}/${MAX_BOOKING_DOCUMENTS}). Open the visit to view.`;

  const created = await prisma.message.create({
    data: {
      content,
      type: "direct",
      senderId: patientUserId,
      receiverId: opts.providerId,
      isSeen: false,
    },
  });

  const payload: Record<string, unknown> = {
    id: uuidToBase64(created.id),
    sender_id: uuidToBase64(created.senderId),
    content: created.content,
    is_seen: created.isSeen,
    type: created.type,
    created_at: created.createdAt,
    idUuid: created.id,
    senderId: created.senderId,
    receiverId: created.receiverId,
    receiver_id: uuidToBase64(created.receiverId!),
  };

  await socketManager.sendPrivateMsg(
    `${uuidToBase64(opts.providerId)}_CHAT`,
    payload,
  );
  await socketManager.sendPrivateMsg(
    `${uuidToBase64(patientUserId)}_CHAT`,
    payload,
  );
}

export async function attachWhatsAppVisitDocument(opts: {
  practiceId: string;
  patientPhone: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  caption?: string;
  lang?: WaLang;
}): Promise<{ reply: string; attached: boolean; bookingId?: string }> {
  const lang = opts.lang;
  const booking = await findOpenBookingForWhatsApp(
    opts.practiceId,
    opts.patientPhone,
  );
  if (!booking) {
    return {
      attached: false,
      reply: BotPrompts.visitDocNoBooking(lang),
    };
  }

  if (
    booking.status === BookingStatus.COMPLETED ||
    booking.status === BookingStatus.CANCELED ||
    booking.status === BookingStatus.NO_SHOW
  ) {
    return {
      attached: false,
      reply: BotPrompts.visitDocBookingClosed(lang),
    };
  }

  const existing = readDocuments(booking.documents);
  if (existing.length >= MAX_BOOKING_DOCUMENTS) {
    return {
      attached: false,
      reply: BotPrompts.visitDocLimitReached(MAX_BOOKING_DOCUMENTS, lang),
    };
  }

  if (!isVisitDocumentMime(opts.mimeType)) {
    return {
      attached: false,
      reply: BotPrompts.visitDocBadType(lang),
    };
  }

  let uploaded: { url: string; name: string };
  try {
    uploaded = await uploadBufferToCloudinary({
      buffer: opts.buffer,
      mimeType: opts.mimeType,
      filename:
        opts.caption?.trim() ||
        opts.filename ||
        `WhatsApp report ${existing.length + 1}`,
    });
  } catch (err) {
    console.warn(
      "[WhatsApp visit-doc] upload failed:",
      err instanceof Error ? err.message : err,
    );
    return {
      attached: false,
      reply: BotPrompts.visitDocUploadFailed(lang),
    };
  }

  const doc: VisitDocItem = {
    name: uploaded.name,
    url: uploaded.url,
    uploadedAt: new Date().toISOString(),
  };
  const nextDocs = [...existing, doc].slice(0, MAX_BOOKING_DOCUMENTS);
  const noteLine = `[WhatsApp] Patient attached: ${doc.name}`;
  const prevNotes = booking.notes?.trim() || "";
  const nextNotes = prevNotes.includes(noteLine)
    ? prevNotes
    : prevNotes
      ? `${prevNotes}\n${noteLine}`
      : noteLine;

  const updated = await prisma.practiceBooking.update({
    where: { id: booking.id },
    data: {
      documents: nextDocs as unknown as Prisma.InputJsonValue,
      notes: nextNotes,
    },
  });

  void broadcastProctoEvent(
    booking.practiceId,
    {
      event: "booking_updated",
      booking: serializeBooking(updated),
    },
    updated.patientId ?? booking.patientId,
  ).catch(() => undefined);

  void notifyDoctorCareChat({
    practiceId: booking.practiceId,
    patientPhone: opts.patientPhone,
    providerId: booking.providerId,
    patientId: booking.patientId,
    docName: doc.name,
    docCount: nextDocs.length,
  }).catch((err) => {
    console.warn(
      "[WhatsApp visit-doc] care-chat notify failed:",
      err instanceof Error ? err.message : err,
    );
  });

  return {
    attached: true,
    bookingId: booking.id,
    reply: BotPrompts.visitDocAttached({
      name: doc.name,
      count: nextDocs.length,
      max: MAX_BOOKING_DOCUMENTS,
      whenLabel: booking.slotStart
        ? booking.slotStart.toLocaleString()
        : booking.sessionDate
          ? booking.sessionDate.toISOString().slice(0, 10)
          : "your visit",
      lang,
    }),
  };
}

export async function listWhatsAppVisitDocuments(opts: {
  practiceId: string;
  patientPhone: string;
  lang?: WaLang;
}): Promise<string> {
  const booking = await findOpenBookingForWhatsApp(
    opts.practiceId,
    opts.patientPhone,
  );
  if (!booking) return BotPrompts.visitDocNoBooking(opts.lang);
  const docs = readDocuments(booking.documents);
  if (!docs.length) return BotPrompts.visitDocEmpty(opts.lang);
  return BotPrompts.visitDocList({
    docs: docs.map((d) => d.name),
    whenLabel: booking.slotStart
      ? booking.slotStart.toLocaleString()
      : booking.sessionDate
        ? booking.sessionDate.toISOString().slice(0, 10)
        : "your visit",
    lang: opts.lang,
  });
}

export function registerFlowStep(step?: string | null): boolean {
  return (
    !step ||
    step === "idle" ||
    step === "awaiting_register_name" ||
    step === "awaiting_register_gender" ||
    step === "awaiting_register_confirm"
  );
}

export function inActiveRegisterStep(step?: string | null): boolean {
  return (
    step === "awaiting_register_name" ||
    step === "awaiting_register_gender" ||
    step === "awaiting_register_confirm"
  );
}
