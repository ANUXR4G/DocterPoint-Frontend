import { WhatsAppNumberStatus } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { formatPracticeDateTime, formatLocalDate } from "./slotEngine.js";
import { sendPrescriptionPdfTemplate, sendWhatsAppDocument } from "./whatsapp.client.js";
import { resolveWhatsAppMsisdn } from "../chat.whatsappFanout.js";
import {
  buildPrescriptionPdf,
  prescriptionFileName,
  type PrescriptionMedicine,
} from "./prescriptionPdf.js";
import {
  buildConsultationPdf,
  consultationFileName,
  type ConsultBooking,
  type ConsultMedicine,
} from "./consultationPdf.js";
import { settings } from "../../config/index.js";

function medicinesOf(value: unknown): PrescriptionMedicine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is PrescriptionMedicine =>
      !!row && typeof row === "object" && typeof (row as { name?: unknown }).name === "string",
  );
}

type Chart = {
  diagnosis: string;
  advice: string;
  noKnownAllergies: boolean;
  allergies: Array<{ category?: string; name?: string }>;
  values: Record<string, number | null>;
};

function chartOf(value: unknown): Chart {
  const empty: Chart = {
    diagnosis: "",
    advice: "",
    noKnownAllergies: false,
    allergies: [],
    values: {},
  };
  if (!value || typeof value !== "object") return empty;
  const source = value as {
    diagnosis?: unknown;
    advice?: unknown;
    noKnownAllergies?: unknown;
    allergies?: Array<{ category?: string; name?: string }>;
    vitals?: { values?: Record<string, unknown> };
  };
  const values: Record<string, number | null> = {};
  for (const [key, raw] of Object.entries(source.vitals?.values ?? {})) {
    const n = typeof raw === "number" ? raw : Number(raw);
    values[key] = Number.isFinite(n) ? n : null;
  }
  return {
    diagnosis: String(source.diagnosis ?? "").trim(),
    advice: String(source.advice ?? "").trim(),
    noKnownAllergies: Boolean(source.noKnownAllergies),
    allergies: Array.isArray(source.allergies) ? source.allergies : [],
    values,
  };
}

function allergyLines(chart: Chart): string[] {
  const grouped = new Map<string, string[]>();
  for (const row of chart.allergies) {
    const name = String(row?.name ?? "").trim();
    const category = String(row?.category ?? "").trim() || "Other";
    if (!name || /no known/i.test(name)) continue;
    const list = grouped.get(category) ?? [];
    list.push(name);
    grouped.set(category, list);
  }
  if (chart.noKnownAllergies || grouped.size === 0) return ["Allergy : No known allergy"];
  const lines: string[] = [];
  let first = true;
  for (const [category, names] of grouped) {
    const body = `${category} : ${names.join(", ")}`;
    lines.push(first ? `Allergy : ${body}` : body);
    first = false;
  }
  return lines;
}

function shownVital(values: Record<string, number | null>, key: string): string {
  const value = values[key];
  return value == null || !Number.isFinite(value) ? "" : String(value);
}

function vitalLine(chart: Chart): string {
  const temp = shownVital(chart.values, "temp");
  const sys = shownVital(chart.values, "bp_sys");
  const dia = shownVital(chart.values, "bp_dia");
  const weight = shownVital(chart.values, "wt");
  const bp = sys && dia ? `${sys}/${dia}` : sys || dia;
  return [
    temp ? `Temp (deg): ${temp}` : "",
    bp ? `BP: ${bp} mmHg` : "",
    weight ? `Wt: ${weight}kg` : "",
  ]
    .filter(Boolean)
    .join(", ");
}

function slashDate(value?: string | null): string {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : text;
}

function ageYears(value?: string | null): string {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const month = now.getMonth() - date.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < date.getDate())) age -= 1;
  return age >= 0 && age <= 130 ? String(age) : "";
}

function genderWord(value?: string | null): string {
  const text = String(value || "").trim().toLowerCase();
  if (text.startsWith("m")) return "Male";
  if (text.startsWith("f")) return "Female";
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function appointmentLabel(booking: {
  mode: string;
  slotStart: Date | null;
  tokenNumber: number | null;
  sessionDate: Date | null;
}): string {
  if (booking.mode === "TOKEN_BASED") {
    const day = booking.sessionDate ? formatLocalDate(booking.sessionDate) : "";
    return [`Token #${booking.tokenNumber ?? "?"}`, day].filter(Boolean).join(" · ");
  }
  return booking.slotStart ? formatPracticeDateTime(booking.slotStart) : "";
}

async function customerWindowOpen(practiceId: string, patientPhone: string): Promise<boolean> {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: {
      practiceId,
      patientPhone: { endsWith: patientPhone.slice(-10) },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  if (!conv) return false;
  return Date.now() - conv.updatedAt.getTime() < 23 * 60 * 60 * 1000;
}

async function optedOut(practiceId: string, patientPhone: string): Promise<boolean> {
  const conv = await prisma.whatsAppConversation.findFirst({
    where: {
      practiceId,
      patientPhone: { endsWith: patientPhone.slice(-10) },
    },
    orderBy: { updatedAt: "desc" },
    select: { state: true },
  });
  const state = (conv?.state ?? {}) as { waOptOut?: boolean };
  return state.waOptOut === true;
}

async function practicePhoneNumberId(practiceId: string): Promise<string | undefined> {
  const wa = await prisma.whatsAppNumber.findFirst({
    where: {
      practiceId,
      status: {
        in: [
          WhatsAppNumberStatus.LIVE,
          WhatsAppNumberStatus.TEMPLATES_PENDING,
          WhatsAppNumberStatus.DISPLAY_NAME_PENDING,
        ],
      },
      AND: [
        { wabaPhoneNumberId: { not: null } },
        { NOT: { wabaPhoneNumberId: "" } },
      ],
    },
    orderBy: [{ status: "asc" }, { activatedAt: "desc" }],
    select: { wabaPhoneNumberId: true, phoneNumber: true },
  });
  const stored = wa?.wabaPhoneNumberId?.trim() || "";
  const approved =
    settings.glucoguideOtpPhoneNumberId?.trim() ||
    settings.whatsappPhoneNumberId?.trim() ||
    "";
  const line = String(wa?.phoneNumber || "").replace(/\D/g, "").slice(-10);
  const platform = settings.glucoguideOtpPhone.replace(/\D/g, "").slice(-10);
  // The platform line must send from the approved id. A stale test id on the
  // row (left by an old env pin) would drop the document.
  if (line && platform && line === platform && approved) return approved;
  return stored || approved || undefined;
}

export type SendClinicLogKind = "prescription" | "consultation" | "both";

/**
 * Send to customer: prescription and/or consultation PDF on WhatsApp.
 * Does not send the plain-text prescription or visit-summary templates.
 */
export async function sendClinicLogPdf(
  bookingId: string,
  kind: SendClinicLogKind = "prescription",
): Promise<{
  filename: string;
  filenames?: string[];
  messageId?: string;
  simulated?: boolean;
}> {
  const booking = await prisma.practiceBooking.findUnique({
    where: { id: bookingId },
    include: {
      practice: {
        select: { id: true, name: true, phone: true, email: true },
      },
      location: { select: { name: true, address: true, city: true } },
    },
  });
  if (!booking) throw new AppError(404, "booking not found.");

  const [provider, patientUser] = await Promise.all([
    prisma.user.findUnique({
      where: { id: booking.providerId },
      select: {
        name: true,
        doctor: { select: { licenseNo: true, description: true } },
      },
    }),
    booking.patientId
      ? prisma.user.findUnique({
          where: { id: booking.patientId },
          select: {
            id: true,
            email: true,
            phone: true,
            gender: true,
            patient: { select: { mrn: true, contactNumber: true, dateOfBirth: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  const medicines = medicinesOf(booking.medicines).filter((med) => med.name?.trim());
  const chartPreview = chartOf(booking.clinicalAssessment);
  const advice = chartPreview.advice;
  const diagnosis = chartPreview.diagnosis;
  const complaint = String(booking.disease || "").trim();
  if (!medicines.length && !advice && !diagnosis && complaint.length < 3) {
    throw new AppError(
      400,
      "Add a diagnosis, medicines, or advice before sending to the customer.",
    );
  }

  const phones = [
    booking.patientPhone,
    patientUser?.patient?.contactNumber,
    patientUser?.phone,
  ];
  const to = await resolveWhatsAppMsisdn(booking.practiceId, ...phones);
  if (to.length < 10) {
    throw new AppError(400, "This visit has no patient phone number.");
  }
  if (await optedOut(booking.practiceId, to)) {
    throw new AppError(400, "This patient has opted out of WhatsApp alerts.");
  }

  const patientName = booking.patientName?.trim() || "Patient";
  const rawDoctor = provider?.name?.trim() || "";
  const doctorName = rawDoctor
    ? /^dr\.?\s+/i.test(rawDoctor)
      ? rawDoctor.replace(/^dr\.?\s+/i, "Dr. ")
      : `Dr. ${rawDoctor}`
    : "Doctor";
  const address = [booking.location?.address, booking.location?.city]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  const rxFilename = prescriptionFileName(patientName);
  const consultFilename = consultationFileName(patientName, booking.id);
  const chart = chartPreview;
  const dob = slashDate(patientUser?.patient?.dateOfBirth);
  const age = ageYears(patientUser?.patient?.dateOfBirth);
  const gender = genderWord(patientUser?.gender);

  const phoneNumberId = await practicePhoneNumberId(booking.practiceId);
  const windowOpen = await customerWindowOpen(booking.practiceId, to);

  const deliverPdf = async (fileBuffer: Buffer, fname: string) => {
    let result = windowOpen
      ? { ok: false as const }
      : await sendPrescriptionPdfTemplate(
          to,
          {
            filename: fname,
            buffer: fileBuffer,
            practiceName: booking.practice.name,
            doctorName,
          },
          phoneNumberId,
        );
    if (!result.ok) {
      result = await sendWhatsAppDocument(
        to,
        { filename: fname, mimeType: "application/pdf", buffer: fileBuffer },
        phoneNumberId,
      );
    }
    return result;
  };

  const generateRxPdf = async (): Promise<Buffer> => {
    const bytes = await buildPrescriptionPdf({
      clinicName: booking.practice.name,
      address: address || booking.location?.name || "",
      phone: booking.practice.phone || "",
      email: booking.practice.email || "",
      patientName,
      patientPhone: booking.patientPhone || "",
      mrn: patientUser?.patient?.mrn || "",
      dob,
      ageGender: [age, gender].filter(Boolean).join(" / "),
      visitId: booking.id,
      shortId:
        booking.tokenNumber != null
          ? String(booking.tokenNumber)
          : booking.id.replace(/-/g, "").slice(0, 8).toUpperCase(),
      doctorName,
      license: provider?.doctor?.licenseNo || "",
      qualification: (provider?.doctor?.description || "").trim().split("\n")[0] || "",
      appointment: appointmentLabel(booking),
      chiefComplaint: booking.disease || "",
      diagnosis: chart.diagnosis,
      allergies: allergyLines(chart),
      vitalLine: vitalLine(chart),
      remarks: advice,
      printed: formatPracticeDateTime(new Date()),
      medicines,
    });
    return Buffer.from(bytes);
  };

  const generateConsultPdf = async (): Promise<Buffer> => {
    const consultBooking: ConsultBooking = {
      id: booking.id,
      tokenNumber: booking.tokenNumber,
      disease: booking.disease,
      notes: booking.notes,
      doctorRemarks: booking.doctorRemarks,
      consultationType: booking.consultationType,
      slotStart: booking.slotStart,
      slotEnd: booking.slotEnd,
      sessionDate: booking.sessionDate,
      patientName,
      patientPhone: booking.patientPhone,
      medicines: medicines as ConsultMedicine[],
      clinicalAssessment: booking.clinicalAssessment,
      practice: {
        name: booking.practice.name,
        phone: booking.practice.phone,
        email: booking.practice.email,
      },
      location: booking.location,
      provider: {
        name: doctorName,
        licenseNo: provider?.doctor?.licenseNo,
        description: provider?.doctor?.description,
      },
      patient: {
        id: patientUser ? booking.patientId : null,
        name: patientName,
        email: patientUser?.email ?? null,
        phone: patientUser?.phone ?? booking.patientPhone,
        gender: patientUser?.gender ?? null,
        dateOfBirth: patientUser?.patient?.dateOfBirth ?? null,
        mrn: patientUser?.patient?.mrn ?? null,
        contactNumber: patientUser?.patient?.contactNumber ?? null,
      },
    };
    const bytes = await buildConsultationPdf(consultBooking);
    return Buffer.from(bytes);
  };

  if (kind === "consultation") {
    const consultPdf = await generateConsultPdf();
    const result = await deliverPdf(consultPdf, consultFilename);
    if (!result.ok && !result.simulated) {
      throw new AppError(
        502,
        result.error || "Could not send the consultation PDF on WhatsApp.",
      );
    }
    return {
      filename: consultFilename,
      filenames: [consultFilename],
      messageId: result.messageId,
      simulated: result.simulated,
    };
  }

  if (kind === "both") {
    const rxPdf = await generateRxPdf();
    const consultPdf = await generateConsultPdf();

    const rxResult = await deliverPdf(rxPdf, rxFilename);
    if (!rxResult.ok && !rxResult.simulated) {
      throw new AppError(
        502,
        rxResult.error || "Could not send the prescription PDF on WhatsApp.",
      );
    }

    const consultResult = await deliverPdf(consultPdf, consultFilename);
    if (!consultResult.ok && !consultResult.simulated) {
      throw new AppError(
        502,
        consultResult.error || "Could not send the consultation PDF on WhatsApp.",
      );
    }

    return {
      filename: `${rxFilename}, ${consultFilename}`,
      filenames: [rxFilename, consultFilename],
      messageId: consultResult.messageId || rxResult.messageId,
      simulated: rxResult.simulated || consultResult.simulated,
    };
  }

  // Default: prescription
  const rxPdf = await generateRxPdf();
  const result = await deliverPdf(rxPdf, rxFilename);
  if (!result.ok && !result.simulated) {
    throw new AppError(
      502,
      result.error || "Could not send the prescription PDF on WhatsApp.",
    );
  }
  return {
    filename: rxFilename,
    filenames: [rxFilename],
    messageId: result.messageId,
    simulated: result.simulated,
  };
}
