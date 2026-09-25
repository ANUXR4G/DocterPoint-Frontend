/**
 * Patient WhatsApp image/PDF → PracticeBooking.documents (doctor visit).
 * Uses the same Cloudinary unsigned preset as web/provider uploads.
 */
import { BookingStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { uuidToBase64 } from "../../core/security.js";
import { socketManager } from "../../core/socket.js";
import { PatientService } from "../patient.js";
import { broadcastProctoEvent, serializeBooking } from "./proctoSocket.js";
import type { WaLang } from "./whatsapp.i18n.js";
import { BotPrompts } from "./whatsapp.templates.js";
import { formatPracticeDateTime } from "./slotEngine.js";

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

/** Visit datetime for WhatsApp confirmations — 12-hour clock in clinic TZ. */
function formatVisitWhenLabel(d: Date): string {
  return formatPracticeDateTime(d);
}

export function isVisitDocumentMime(
  mimeType: string,
  opts?: { filename?: string; buffer?: Buffer },
): boolean {
  const m = (mimeType || "").toLowerCase();
  if (
    m.startsWith("image/") ||
    m.includes("pdf") ||
    m === "application/pdf" ||
    m === "application/x-pdf"
  ) {
    return true;
  }
  const filename = opts?.filename || "";
  if (/\.(pdf|jpe?g|png|webp|heic|heif)$/i.test(filename)) return true;
  const bytes = opts?.buffer;
  if (bytes && bytes.length >= 5) {
    const head = bytes.subarray(0, 1024).toString("latin1");
    if (/%PDF-/i.test(head)) return true;
    // JPEG / PNG magic
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return true;
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return true;
    }
  }
  // Meta often labels PDFs as octet-stream — treat as visit doc when named .pdf
  if (m.includes("octet-stream") && /\.pdf$/i.test(filename)) return true;
  return false;
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

  // Prefer auto/upload for PDF / HEIC / octet-stream; image/upload for jpeg/png/webp
  const mime = (opts.mimeType || "").toLowerCase();
  const useImageEndpoint =
    mime.includes("jpeg") ||
    mime.includes("jpg") ||
    mime.includes("png") ||
    mime.includes("webp");
  const endpoint = useImageEndpoint ? "image/upload" : "auto/upload";

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

export async function listOpenBookingsForWhatsApp(
  practiceId: string,
  patientPhone: string,
  opts?: { patientIds?: string[]; take?: number },
) {
  const digits = last10(patientPhone);
  const or: Array<Record<string, unknown>> = [];
  if (digits.length >= 10) {
    or.push({ patientPhone: { endsWith: digits } });
    or.push({ patientPhone });
  }
  if (opts?.patientIds?.length) {
    or.push({ patientId: { in: opts.patientIds } });
  }
  if (!or.length) return [];

  return prisma.practiceBooking.findMany({
    where: {
      practiceId,
      status: { in: OPEN_STATUSES },
      OR: or,
    },
    orderBy: [{ slotStart: "desc" }, { updatedAt: "desc" }],
    take: opts?.take ?? 5,
  });
}

export async function findOpenBookingForWhatsApp(
  practiceId: string,
  patientPhone: string,
  opts?: { preferredBookingId?: string; patientIds?: string[] },
) {
  const digits = last10(patientPhone);
  if (digits.length < 10 && !(opts?.patientIds?.length)) return null;

  const open = await listOpenBookingsForWhatsApp(practiceId, patientPhone, {
    patientIds: opts?.patientIds,
    take: 5,
  });
  if (!open.length) return null;

  // Prefer lastBookingId only when there is exactly one open visit.
  // With 2+ bookings, fall through to most-recent (callers that need a
  // picker should use receiveWhatsAppBranchFDocument instead).
  if (open.length === 1) return open[0]!;

  return open[0]!;
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

const MAX_PATIENT_DOCUMENTS = 20;

async function attachDocItemToBooking(
  booking: {
    id: string;
    practiceId: string;
    providerId: string;
    patientId: string | null;
    notes: string | null;
    documents: unknown;
    slotStart: Date | null;
    sessionDate: Date | null;
  },
  doc: VisitDocItem,
  patientPhone: string,
  lang?: WaLang,
): Promise<{ reply: string; attached: boolean; bookingId: string }> {
  const existing = readDocuments(booking.documents);
  if (existing.length >= MAX_BOOKING_DOCUMENTS) {
    return {
      attached: false,
      bookingId: booking.id,
      reply: BotPrompts.visitDocLimitReached(MAX_BOOKING_DOCUMENTS, lang),
    };
  }
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

  void import("../opsSocket.js")
    .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
    .catch(() => undefined);

  void notifyDoctorCareChat({
    practiceId: booking.practiceId,
    patientPhone,
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

  void import("./notification.service.js")
    .then(({ NotificationService }) =>
      NotificationService.enqueueClinicDocumentAttached(booking.id, doc.name, {
        kind: "visit",
      }),
    )
    .catch((err) => {
      console.warn(
        "[WhatsApp visit-doc] clinic notification failed:",
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
        ? formatVisitWhenLabel(booking.slotStart)
        : booking.sessionDate
          ? booking.sessionDate.toISOString().slice(0, 10)
          : "your visit",
      lang,
    }),
  };
}

/** Branch F — save uploaded doc onto the patient record (general). */
export async function attachWhatsAppPatientDocument(opts: {
  patientPhone: string;
  doc: VisitDocItem;
  lang?: WaLang;
  /** When set, also enqueue a clinic inbox notification (needs a booking anchor). */
  practiceId?: string;
}): Promise<{ reply: string; attached: boolean }> {
  const linked = await PatientService.listLinkedToWhatsApp(opts.patientPhone).catch(
    () => [] as Array<{ id: string; isSelf?: boolean }>,
  );
  const self = linked.find((p) => p.isSelf) ?? linked[0];
  let patientId: string | null = self?.id ?? null;
  if (!patientId) {
    const user = await PatientService.findByPhone(opts.patientPhone);
    patientId = user?.patient?.id ?? null;
  }
  if (!patientId) {
    return {
      attached: false,
      reply: BotPrompts.visitDocNoBooking(opts.lang),
    };
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { documents: true },
  });
  if (!patient) {
    return {
      attached: false,
      reply: BotPrompts.visitDocUploadFailed(opts.lang),
    };
  }

  const existing = readDocuments(patient.documents).slice(0, MAX_PATIENT_DOCUMENTS);
  if (existing.length >= MAX_PATIENT_DOCUMENTS) {
    return {
      attached: false,
      reply: BotPrompts.visitDocLimitReached(MAX_PATIENT_DOCUMENTS, opts.lang),
    };
  }
  const nextDocs = [...existing, opts.doc].slice(0, MAX_PATIENT_DOCUMENTS);
  await prisma.patient.update({
    where: { id: patientId },
    data: { documents: nextDocs as unknown as Prisma.InputJsonValue },
  });

  if (opts.practiceId) {
    const digits = last10(opts.patientPhone);
    const anchor = await prisma.practiceBooking.findFirst({
      where: {
        practiceId: opts.practiceId,
        patientPhone: { endsWith: digits },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });
    if (anchor) {
      void import("./notification.service.js")
        .then(({ NotificationService }) =>
          NotificationService.enqueueClinicDocumentAttached(
            anchor.id,
            opts.doc.name,
            { kind: "general" },
          ),
        )
        .catch((err) => {
          console.warn(
            "[WhatsApp general-doc] clinic notification failed:",
            err instanceof Error ? err.message : err,
          );
        });
    }
  }

  return {
    attached: true,
    reply: BotPrompts.documentSavedGeneral({
      name: opts.doc.name,
      lang: opts.lang,
    }),
  };
}

/** Persist a pending (already uploaded) doc onto a booking by id. */
export async function attachPendingDocToBooking(opts: {
  practiceId: string;
  patientPhone: string;
  bookingId: string;
  doc: VisitDocItem;
  lang?: WaLang;
}): Promise<{ reply: string; attached: boolean; bookingId?: string }> {
  const booking = await prisma.practiceBooking.findFirst({
    where: {
      id: opts.bookingId,
      practiceId: opts.practiceId,
      status: { in: OPEN_STATUSES },
    },
  });
  if (!booking) {
    return {
      attached: false,
      reply: BotPrompts.visitDocBookingClosed(opts.lang),
    };
  }
  return attachDocItemToBooking(booking, opts.doc, opts.patientPhone, opts.lang);
}

export type BranchFUploadResult = {
  reply: string;
  /** True when the file is fully saved (booking or patient record). */
  attached: boolean;
  bookingId?: string;
  /**
   * When set, conversation should move to this step and keep pendingDoc.
   * `awaiting_document_link` = ask Select Appointment | General Document
   */
  nextStep?: "awaiting_document_link" | "awaiting_report_booking";
  pendingDoc?: VisitDocItem;
  openBookingCount?: number;
};

/**
 * Branch F — upload file, then either save immediately or ask to link.
 */
export async function receiveWhatsAppBranchFDocument(opts: {
  practiceId: string;
  patientPhone: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  caption?: string;
  lang?: WaLang;
  /** Post-booking path already chose a visit. */
  preferredBookingId?: string | null;
}): Promise<BranchFUploadResult> {
  const lang = opts.lang;

  let mimeType = opts.mimeType;
  const looksPdf =
    /\.pdf$/i.test(opts.filename || "") ||
    (opts.buffer.length >= 5 &&
      /%PDF-/i.test(opts.buffer.subarray(0, 1024).toString("latin1")));
  if (looksPdf && !mimeType.toLowerCase().includes("pdf")) {
    mimeType = "application/pdf";
  }

  if (
    !isVisitDocumentMime(mimeType, {
      filename: opts.filename,
      buffer: opts.buffer,
    })
  ) {
    return { attached: false, reply: BotPrompts.visitDocBadType(lang) };
  }

  let uploaded: { url: string; name: string };
  try {
    uploaded = await uploadBufferToCloudinary({
      buffer: opts.buffer,
      mimeType,
      filename:
        opts.caption?.trim() ||
        opts.filename ||
        `WhatsApp document ${Date.now()}`,
    });
  } catch (err) {
    console.warn(
      "[WhatsApp visit-doc] upload failed:",
      err instanceof Error ? err.message : err,
    );
    return { attached: false, reply: BotPrompts.visitDocUploadFailed(lang) };
  }

  const doc: VisitDocItem = {
    name: uploaded.name,
    url: uploaded.url,
    uploadedAt: new Date().toISOString(),
  };

  const linked = await PatientService.listLinkedToWhatsApp(opts.patientPhone).catch(
    () => [] as Array<{ id: string }>,
  );
  const patientIds = linked.map((p) => p.id);

  const open = await listOpenBookingsForWhatsApp(
    opts.practiceId,
    opts.patientPhone,
    { patientIds, take: 5 },
  );

  // Single open visit (or preferred with none listed): attach immediately.
  // With 2+ open bookings, never skip the picker — lastBookingId is often stale.
  if (open.length === 1) {
    const result = await attachPendingDocToBooking({
      practiceId: opts.practiceId,
      patientPhone: opts.patientPhone,
      bookingId: open[0]!.id,
      doc,
      lang,
    });
    return {
      reply: result.reply,
      attached: result.attached,
      bookingId: result.bookingId,
    };
  }

  if (opts.preferredBookingId && open.length === 0) {
    const result = await attachPendingDocToBooking({
      practiceId: opts.practiceId,
      patientPhone: opts.patientPhone,
      bookingId: opts.preferredBookingId,
      doc,
      lang,
    });
    return {
      reply: result.reply,
      attached: result.attached,
      bookingId: result.bookingId,
    };
  }

  if (!open.length) {
    const general = await attachWhatsAppPatientDocument({
      patientPhone: opts.patientPhone,
      doc,
      lang,
      practiceId: opts.practiceId,
    });
    // If patient profile missing, still confirm after Cloudinary upload via Admin help.
    if (!general.attached) {
      try {
        const user = await PatientService.findByPhone(opts.patientPhone);
        if (user?.id) {
          const { ChatService } = await import("../chat.js");
          await ChatService.sendHelpMessage(
            user.id,
            `[WhatsApp · General document] ${doc.name}\n${doc.url}`,
          );
          return {
            attached: true,
            reply: BotPrompts.documentSavedGeneral({ name: doc.name, lang }),
          };
        }
      } catch {
        /* fall through */
      }
      return { attached: false, reply: general.reply };
    }
    return { attached: true, reply: general.reply };
  }

  // Branch F: ask whether to link to an appointment.
  return {
    attached: false,
    reply: BotPrompts.askLinkDocumentToAppointment(lang),
    nextStep: "awaiting_document_link",
    pendingDoc: doc,
    openBookingCount: open.length,
  };
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
  preferredBookingId?: string;
}): Promise<{ reply: string; attached: boolean; bookingId?: string }> {
  const lang = opts.lang;

  const linked = await PatientService.listLinkedToWhatsApp(opts.patientPhone).catch(
    () => [] as Array<{ id: string }>,
  );
  const patientIds = linked.map((p) => p.id);

  const booking = await findOpenBookingForWhatsApp(
    opts.practiceId,
    opts.patientPhone,
    {
      preferredBookingId: opts.preferredBookingId,
      patientIds,
    },
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

  // Normalize octet-stream PDFs so Cloudinary / storage treat them correctly
  let mimeType = opts.mimeType;
  const looksPdf =
    /\.pdf$/i.test(opts.filename || "") ||
    (opts.buffer.length >= 5 &&
      /%PDF-/i.test(opts.buffer.subarray(0, 1024).toString("latin1")));
  if (looksPdf && !mimeType.toLowerCase().includes("pdf")) {
    mimeType = "application/pdf";
  }

  if (
    !isVisitDocumentMime(mimeType, {
      filename: opts.filename,
      buffer: opts.buffer,
    })
  ) {
    return {
      attached: false,
      reply: BotPrompts.visitDocBadType(lang),
    };
  }

  let uploaded: { url: string; name: string };
  try {
    uploaded = await uploadBufferToCloudinary({
      buffer: opts.buffer,
      mimeType,
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

  void import("../opsSocket.js")
    .then(({ broadcastOpsInvalidate }) => broadcastOpsInvalidate("bookings"))
    .catch(() => undefined);

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

  void import("./notification.service.js")
    .then(({ NotificationService }) =>
      NotificationService.enqueueClinicDocumentAttached(booking.id, doc.name, {
        kind: "visit",
      }),
    )
    .catch((err) => {
      console.warn(
        "[WhatsApp visit-doc] clinic notification failed:",
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
        ? formatVisitWhenLabel(booking.slotStart)
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
  preferredBookingId?: string;
}): Promise<string> {
  const linked = await PatientService.listLinkedToWhatsApp(opts.patientPhone).catch(
    () => [] as Array<{ id: string }>,
  );
  const booking = await findOpenBookingForWhatsApp(
    opts.practiceId,
    opts.patientPhone,
    {
      preferredBookingId: opts.preferredBookingId,
      patientIds: linked.map((p) => p.id),
    },
  );
  if (!booking) return BotPrompts.visitDocNoBooking(opts.lang);
  const docs = readDocuments(booking.documents);
  if (!docs.length) return BotPrompts.visitDocEmpty(opts.lang);
  return BotPrompts.visitDocList({
    docs: docs.map((d) => d.name),
    whenLabel: booking.slotStart
      ? formatVisitWhenLabel(booking.slotStart)
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
    step === "awaiting_register_email_opt" ||
    step === "awaiting_register_email" ||
    step === "awaiting_register_family_opt" ||
    step === "awaiting_register_family_phone" ||
    step === "awaiting_register_relationship" ||
    step === "awaiting_register_family_details" ||
    step === "awaiting_register_confirm"
  );
}

export function inActiveRegisterStep(step?: string | null): boolean {
  return (
    step === "awaiting_register_name" ||
    step === "awaiting_register_gender" ||
    step === "awaiting_register_email_opt" ||
    step === "awaiting_register_email" ||
    step === "awaiting_register_family_opt" ||
    step === "awaiting_register_family_phone" ||
    step === "awaiting_register_relationship" ||
    step === "awaiting_register_family_details" ||
    step === "awaiting_register_confirm"
  );
}
