/**
 * One-shot: copy GlucoGuide appointments into GlucoGuide PracticeBooking + Appointment.
 * Source: postgresql://docline:docline@localhost:5432/docline
 * Target: DATABASE_URL from backend/.env (gluco_guide)
 */
import { PrismaClient, ScheduleMode } from "@prisma/client";
import pg from "pg";

const target = new PrismaClient();

const SLUG_MAP: Record<string, string> = {
  "dr-anjali-mehta-dermatologist-delhi": "mehta-skin-clinic",
  "dr-rohan-kapoor-general-physician-bangalore": "city-care-polyclinic",
  "dr-priya-nair-pediatrician-bangalore": "city-care-polyclinic",
  "dr-vikram-shah-orthopedist-mumbai": "dr-vikram-shah-orthopedist-mumbai",
  "dr-sneha-reddy-gynecologist-hyderabad":
    "dr-sneha-reddy-gynecologist-hyderabad",
};

const STATUS_MAP: Record<string, string> = {
  COMPLETED: "completed",
  CONFIRMED: "accepted",
  PENDING: "requested",
  CANCELLED: "cancelled",
  NO_SHOW: "cancelled",
};

const BOOKING_STATUS: Record<
  string,
  "SCHEDULED" | "COMPLETED" | "CANCELLED" | "IN_PROGRESS"
> = {
  COMPLETED: "COMPLETED",
  CONFIRMED: "SCHEDULED",
  PENDING: "SCHEDULED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "CANCELLED",
};

async function main() {
  const source = new pg.Client({
    connectionString:
      process.env.DOCLINE_DATABASE_URL ??
      "postgresql://docline:docline@localhost:5432/docline",
  });
  await source.connect();

  const { rows } = await source.query<{
    slot_start: Date;
    slot_end: Date;
    status: string;
    reason_tag: string | null;
    slug: string;
    doctor_email: string;
    patient_email: string;
    patient_name: string;
    patient_phone: string;
  }>(`
    SELECT
      a."slotStart" AS slot_start,
      a."slotEnd" AS slot_end,
      a.status,
      a."reasonTag" AS reason_tag,
      d.slug,
      u.email AS doctor_email,
      p.email AS patient_email,
      p.name AS patient_name,
      p.phone AS patient_phone
    FROM "Appointment" a
    JOIN "Doctor" d ON d.id = a."doctorId"
    JOIN "User" u ON u.id = d."userId"
    JOIN "Patient" p ON p.id = a."patientId"
    ORDER BY a."slotStart"
  `);

  let bookings = 0;
  let appointments = 0;
  let skipped = 0;

  for (const row of rows) {
    const practiceSlug = SLUG_MAP[row.slug] ?? row.slug;
    const practice = await target.practice.findUnique({
      where: { slug: practiceSlug },
      include: { locations: true },
    });
    const doctor = await target.user.findUnique({
      where: { email: row.doctor_email },
    });
    const patient = await target.user.findUnique({
      where: { email: row.patient_email },
      include: { patient: true },
    });

    if (!practice || !doctor || !patient?.patient || !practice.locations[0]) {
      skipped += 1;
      continue;
    }

    const locationId = practice.locations[0].id;
    const slotStart = new Date(row.slot_start);
    const slotEnd = new Date(row.slot_end);

    const existingBooking = await target.practiceBooking.findFirst({
      where: {
        practiceId: practice.id,
        providerId: doctor.id,
        patientPhone: row.patient_phone,
        slotStart,
      },
    });

    if (!existingBooking) {
      await target.practiceBooking.create({
        data: {
          practiceId: practice.id,
          locationId,
          providerId: doctor.id,
          patientId: patient.id,
          patientPhone: row.patient_phone,
          patientName: row.patient_name,
          mode: ScheduleMode.TIME_BASED,
          status: BOOKING_STATUS[row.status] ?? "SCHEDULED",
          channel: "WEB_PORTAL",
          slotStart,
          slotEnd,
        },
      });
      bookings += 1;
    }

    const apptDate = new Date(slotStart);
    apptDate.setHours(0, 0, 0, 0);
    const time = slotStart.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const existingAppt = await target.appointment.findFirst({
      where: {
        doctorId: doctor.id,
        patientId: patient.id,
        appointmentDate: apptDate,
        appointmentTime: time,
      },
    });

    if (!existingAppt) {
      await target.appointment.create({
        data: {
          doctorId: doctor.id,
          patientId: patient.id,
          appointmentDate: apptDate,
          appointmentTime: time,
          mode: "in-person",
          type: "consultation",
          status: STATUS_MAP[row.status] ?? "requested",
          serialNumber: appointments + 1,
          purposeOfVisit: row.reason_tag ? [row.reason_tag] : ["GlucoGuide import"],
          patientNote: "Migrated from legacy import",
        },
      });
      appointments += 1;
    }
  }

  await source.end();
  console.log(
    `Migrated ${bookings} practice bookings, ${appointments} appointments (${skipped} skipped).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => target.$disconnect());
