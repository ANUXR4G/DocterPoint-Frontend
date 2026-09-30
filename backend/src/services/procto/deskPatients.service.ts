import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { ageFromDob, normalizeDateOfBirth } from "../../core/dob.js";
import { normalizeGender } from "../../core/gender.js";
import { PatientService, pickPrimaryPatientUser } from "../patient.js";
import { recordAudit } from "./practiceAudit.js";
import { todayIso } from "./scheduleVersions.js";

export type PatientQuery =
  | { kind: "phone"; digits: string }
  | { kind: "mrn"; text: string }
  | { kind: "name"; text: string }
  | { kind: "short" };

/** Mobile (4+ digits), MRN (e.g. PCMR00000012 / MR12) or name (2+ letters). */
export function classifyPatientQuery(raw: unknown): PatientQuery {
  const q = String(raw ?? "").trim().slice(0, 60);
  const compact = q.replace(/\s+/g, "");
  const digits = q.replace(/\D/g, "");
  if (/^[+\d\s()-]+$/.test(q) && digits.length >= 4) return { kind: "phone", digits: digits.slice(-15) };
  if (/^[a-z]{0,6}mr\d{1,8}$/i.test(compact)) return { kind: "mrn", text: compact.toUpperCase() };
  if (q.replace(/[^\p{L}]/gu, "").length >= 2) return { kind: "name", text: q };
  return { kind: "short" };
}

export type DeskPatient = {
  patientId: string;
  name: string;
  mrn: string | null;
  phone: string;
  gender: string | null;
  dateOfBirth: string | null;
  age: number | null;
  relationship: string | null;
  /** Visited / registered here before (otherwise found by exact mobile or MRN only). */
  knownHere: boolean;
  lastVisitAt: string | null;
  /** Register call matched a patient already on GlucoGuide and added them to this clinic (no new MRN). */
  existingPatient?: boolean;
};

const last10 = (raw: string | null | undefined) => String(raw || "").replace(/\D/g, "").slice(-10);

const PATIENT_SELECT = {
  id: true,
  name: true,
  phone: true,
  gender: true,
  createdBy: true,
  patient: { select: { mrn: true, dateOfBirth: true, contactNumber: true, relationship: true } },
} satisfies Prisma.UserSelect;
type PatientRow = Prisma.UserGetPayload<{ select: typeof PATIENT_SELECT }>;

async function assertDeskMember(practiceId: string, actorUserId: string) {
  const member = await prisma.practiceMember.findUnique({
    where: { practiceId_userId: { practiceId, userId: actorUserId } },
    select: { role: true, isActive: true },
  });
  if (!member?.isActive) throw new AppError(403, "You are not an active member of this clinic.");
  return member;
}

/** Add a patient to this clinic's list (idempotent). */
export async function linkPatientToPractice(
  practiceId: string,
  patientUserId: string,
  source: "desk_register" | "desk_link",
  addedBy: string | null,
) {
  await prisma.practicePatient.upsert({
    where: { practiceId_patientUserId: { practiceId, patientUserId } },
    create: { practiceId, patientUserId, source, addedBy },
    update: {},
  });
}

/**
 * Patients this clinic already knows: added to its list, booked here, registered with its MRN
 * prefix, or on its WhatsApp line.
 */
async function knownScope(practiceId: string) {
  const [practice, booked, linked, chats] = await Promise.all([
    prisma.practice.findUnique({ where: { id: practiceId }, select: { mrnPrefix: true } }),
    prisma.practiceBooking.findMany({
      where: { practiceId, patientId: { not: null } },
      distinct: ["patientId"],
      select: { patientId: true },
      take: 5000,
    }),
    prisma.practicePatient.findMany({
      where: { practiceId },
      select: { patientUserId: true },
      take: 5000,
    }),
    prisma.whatsAppConversation.findMany({
      where: { practiceId },
      orderBy: { updatedAt: "desc" },
      select: { patientPhone: true },
      take: 500,
    }),
  ]);
  const ids = [...new Set([...booked.map((b) => b.patientId!), ...linked.map((l) => l.patientUserId)].filter(Boolean))];
  const prefix = practice?.mrnPrefix?.trim() || null;
  const phones = [...new Set(chats.map((c) => last10(c.patientPhone)).filter((d) => d.length === 10))];
  const where: Prisma.UserWhereInput[] = [
    ...(ids.length ? [{ id: { in: ids } }] : []),
    ...(prefix ? [{ patient: { mrn: { startsWith: `${prefix}MR` } } }] : []),
    ...phones.flatMap((d) => [{ phone: { endsWith: d } }, { patient: { contactNumber: { endsWith: d } } }]),
  ];
  return { ids: new Set(ids), prefix, phones: new Set(phones), where };
}

function toDeskPatient(
  u: PatientRow,
  scope: Awaited<ReturnType<typeof knownScope>>,
  lastVisit: Map<string, Date>,
): DeskPatient {
  const phone = u.patient?.contactNumber || u.phone || "";
  const mrn = u.patient?.mrn ?? null;
  const knownHere =
    scope.ids.has(u.id) ||
    (!!scope.prefix && !!mrn?.startsWith(`${scope.prefix}MR`)) ||
    scope.phones.has(last10(phone));
  return {
    patientId: u.id,
    name: u.name?.trim() || "Patient",
    mrn,
    phone,
    gender: u.gender ?? null,
    dateOfBirth: u.patient?.dateOfBirth ?? null,
    age: ageFromDob(u.patient?.dateOfBirth),
    relationship: u.patient?.relationship?.trim() || null,
    knownHere,
    lastVisitAt: lastVisit.get(u.id)?.toISOString() ?? null,
  };
}

async function lastVisits(practiceId: string, ids: string[]) {
  if (!ids.length) return new Map<string, Date>();
  const rows = await prisma.practiceBooking.groupBy({
    by: ["patientId"],
    where: { practiceId, patientId: { in: ids } },
    _max: { createdAt: true },
  });
  return new Map(rows.filter((r) => r.patientId && r._max.createdAt).map((r) => [r.patientId!, r._max.createdAt!]));
}

/**
 * Front-desk patient lookup. Names and partial numbers only match patients this clinic already
 * knows; a full mobile number or exact MRN (the patient is at the desk and gives it) also finds
 * patients registered elsewhere on GlucoGuide, so nobody is registered twice.
 */
export async function searchDeskPatients(practiceId: string, actorUserId: string, rawQ: unknown) {
  await assertDeskMember(practiceId, actorUserId);
  const q = classifyPatientQuery(rawQ);
  if (q.kind === "short") return { patients: [] as DeskPatient[] };

  const scope = await knownScope(practiceId);
  const inClinic = (cond: Prisma.UserWhereInput): Prisma.UserWhereInput | null =>
    scope.where.length ? { AND: [cond, { OR: scope.where }] } : null;

  let match: Prisma.UserWhereInput | null;
  if (q.kind === "phone" && q.digits.length >= 10) {
    const d = q.digits.slice(-10);
    match = { OR: [{ phone: { endsWith: d } }, { patient: { contactNumber: { endsWith: d } } }] };
  } else if (q.kind === "phone") {
    match = inClinic({ OR: [{ phone: { contains: q.digits } }, { patient: { contactNumber: { contains: q.digits } } }] });
  } else if (q.kind === "mrn") {
    const partial = inClinic({ patient: { mrn: { contains: q.text, mode: "insensitive" } } });
    match = { OR: [{ patient: { mrn: { equals: q.text, mode: "insensitive" } } }, ...(partial ? [partial] : [])] };
  } else {
    match = inClinic({ name: { contains: q.text, mode: "insensitive" } });
  }
  if (!match) return { patients: [] as DeskPatient[] };

  const users = await prisma.user.findMany({
    where: { role: "user", patient: { isNot: null }, AND: [match] },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: PATIENT_SELECT,
  });
  const visits = await lastVisits(practiceId, users.map((u) => u.id));
  const patients = users
    .map((u) => toDeskPatient(u, scope, visits))
    .sort((a, b) => Number(b.knownHere) - Number(a.knownHere) || a.name.localeCompare(b.name))
    .slice(0, 10);
  return { patients };
}

/**
 * Register a patient at the front desk (mandatory: name, mobile, gender, date of birth) and give
 * them a Medical Record Number with the clinic prefix. When the mobile already belongs to another
 * patient, the new person is added as a family member on that number (relationship required).
 */
export async function registerDeskPatient(
  practiceId: string,
  actorUserId: string,
  body: {
    name?: unknown;
    phone?: unknown;
    gender?: unknown;
    dateOfBirth?: unknown;
    email?: unknown;
    address?: unknown;
    relationship?: unknown;
  },
): Promise<DeskPatient> {
  await assertDeskMember(practiceId, actorUserId);
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.replace(/[^\p{L}]/gu, "").length < 2) throw new AppError(400, "Enter the patient's full name.");
  const phone = String(body.phone ?? "").replace(/\D/g, "");
  if (phone.length < 10 || phone.length > 15) throw new AppError(400, "Enter a valid mobile number (10 digits).");
  const gender = normalizeGender(body.gender);
  if (!gender) throw new AppError(400, "Pick the patient's gender.");
  const dateOfBirth = normalizeDateOfBirth(String(body.dateOfBirth ?? ""));
  if (!dateOfBirth || dateOfBirth > todayIso()) throw new AppError(400, "Enter a valid date of birth.");
  const email = String(body.email ?? "").trim().toLowerCase() || null;
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith("@patients.glucoguide.local"))) {
    throw new AppError(400, "Enter a valid email address, or leave it empty.");
  }
  const relationship = String(body.relationship ?? "").trim().slice(0, 64) || null;
  const address = String(body.address ?? "").trim().slice(0, 300) || null;
  const d10 = phone.slice(-10);

  const [staff, onNumber, emailTaken] = await Promise.all([
    prisma.practiceMember.findFirst({
      where: { isActive: true, user: { phone: { endsWith: d10 } } },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        role: "user",
        patient: { isNot: null },
        OR: [{ phone: { endsWith: d10 } }, { patient: { contactNumber: { endsWith: d10 } } }],
      },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: { ...PATIENT_SELECT, email: true },
    }),
    email ? prisma.user.findUnique({ where: { email }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (staff) throw new AppError(409, "That mobile belongs to a clinic staff account. Use the patient's own number.");
  if (emailTaken) throw new AppError(409, "That email is already registered. Search for the patient instead.");
  const key = (n: string | null | undefined) => (n ?? "").toLowerCase().replace(/\s*·.*$/, "").replace(/\s+/g, " ").trim();
  const first = (n: string | null | undefined) => key(n).split(" ")[0] ?? "";
  const same =
    onNumber.find((u) => key(u.name) === key(name)) ??
    onNumber.find(
      (u) =>
        first(u.name) === first(name) &&
        normalizeDateOfBirth(u.patient?.dateOfBirth ?? "") === dateOfBirth,
    );
  if (same) return addExistingPatient(practiceId, actorUserId, same, dateOfBirth);
  const owner = pickPrimaryPatientUser(onNumber.filter((u) => last10(u.phone) === d10));
  if (owner && !relationship) {
    throw new AppError(
      409,
      `This mobile is already registered to ${owner.name?.trim() || "another patient"}. Pick them from the search, or choose how this patient is related to add them as family on the same number.`,
    );
  }

  let loginPhone = phone;
  if (owner) {
    const { allocateDependentPhone } = await import("./whatsapp.orchestrator.js");
    loginPhone = await allocateDependentPhone(phone);
  }
  const created = await PatientService.registerViaWhatsApp({
    phone: loginPhone,
    whatsappFrom: phone,
    name,
    gender,
    dateOfBirth,
    email,
    address,
    relationship: owner ? relationship : null,
    practiceId,
    source: "clinic_desk",
  });
  void import("./whatsapp.orchestrator.js")
    .then(({ invalidatePatientPhoneCache }) => {
      invalidatePatientPhoneCache(phone);
      invalidatePatientPhoneCache(loginPhone);
    })
    .catch(() => undefined);

  await linkPatientToPractice(practiceId, created.id, "desk_register", actorUserId);
  const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id }, select: PATIENT_SELECT });
  const scope = await knownScope(practiceId);
  const patient = toDeskPatient(row, scope, new Map());
  const age = patient.age != null ? `, ${patient.age} y` : "";
  void recordAudit({
    practiceId,
    actorUserId,
    action: "PATIENT_REGISTERED",
    headline: "Patient registered at the desk",
    detail: `${patient.name} (MRN ${patient.mrn ?? "—"}${age}${owner ? `, ${relationship} of ${owner.name?.trim() || "the account holder"}` : ""})`,
    entityType: "patient",
    entityId: patient.patientId,
    meta: { mrn: patient.mrn, familyOf: owner?.id ?? null, relationship },
  });
  console.log(`[desk] patient registered id=${patient.patientId} mrn=${patient.mrn} practice=${practiceId} by=${actorUserId}`);
  return { ...patient, knownHere: true };
}

/**
 * Same person (name + mobile) is already on GlucoGuide — registered at another clinic, on WhatsApp
 * or the app. Keep their MRN and add them to this clinic's patient list instead of refusing.
 */
async function addExistingPatient(
  practiceId: string,
  actorUserId: string,
  existing: PatientRow,
  dateOfBirth: string,
): Promise<DeskPatient> {
  const onFile = normalizeDateOfBirth(existing.patient?.dateOfBirth ?? "");
  if (onFile && onFile !== dateOfBirth) {
    throw new AppError(
      409,
      `${existing.name?.trim() || "This patient"} is already registered on this number with a different date of birth. Check the details with the patient, or pick them from the search results.`,
    );
  }
  return addToClinic(practiceId, actorUserId, existing);
}

/**
 * Desk picked a patient found by full mobile or MRN who is registered elsewhere on GlucoGuide:
 * add them to this clinic's patient list so they show on the Patients tab before any booking.
 */
export async function linkDeskPatient(practiceId: string, actorUserId: string, patientUserId: string) {
  await assertDeskMember(practiceId, actorUserId);
  const existing = await prisma.user.findFirst({
    where: { id: patientUserId, role: "user", patient: { isNot: null } },
    select: PATIENT_SELECT,
  });
  if (!existing) throw new AppError(404, "Patient not found. Search again by mobile or MRN.");
  return addToClinic(practiceId, actorUserId, existing);
}

async function addToClinic(practiceId: string, actorUserId: string, existing: PatientRow): Promise<DeskPatient> {
  const scope = await knownScope(practiceId);
  const wasKnown = scope.ids.has(existing.id);
  await linkPatientToPractice(practiceId, existing.id, "desk_link", actorUserId);
  scope.ids.add(existing.id);
  const patient = toDeskPatient(existing, scope, await lastVisits(practiceId, [existing.id]));
  if (!wasKnown) {
    void recordAudit({
      practiceId,
      actorUserId,
      action: "PATIENT_REGISTERED",
      headline: "Existing patient added to the clinic",
      detail: `${patient.name} (MRN ${patient.mrn ?? "—"}) — already registered on GlucoGuide`,
      entityType: "patient",
      entityId: patient.patientId,
      meta: { mrn: patient.mrn, existing: true },
    });
    console.log(`[desk] existing patient linked id=${patient.patientId} mrn=${patient.mrn} practice=${practiceId} by=${actorUserId}`);
  }
  return { ...patient, knownHere: true, existingPatient: true };
}
