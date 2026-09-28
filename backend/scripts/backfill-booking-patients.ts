/**
 * Link every booking to a registered patient (Patient ID / MRN).
 * - Same mobile + same name as an existing patient → link to that patient.
 * - No patient on that mobile → create one (clinic MRN prefix, gender / DOB left for the desk to fill).
 * - Other patients on that mobile but none with this name → reported, left for the desk (family member).
 * Run: cd backend && npx tsx scripts/backfill-booking-patients.ts          (dry run)
 *      cd backend && npx tsx scripts/backfill-booking-patients.ts --apply
 */
import { PrismaClient } from "@prisma/client";
import { allocatePatientMrn, ensurePracticeMrnPrefix } from "../src/core/patientMrn.js";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

const last10 = (v: string | null | undefined) => String(v || "").replace(/\D/g, "").slice(-10);
const sameName = (a: string | null | undefined, b: string | null | undefined) =>
  String(a || "").trim().toLowerCase().replace(/\s+/g, " ") ===
  String(b || "").trim().toLowerCase().replace(/\s+/g, " ");

async function main() {
  const bookings = await prisma.practiceBooking.findMany({
    where: { patientId: null },
    select: { id: true, practiceId: true, patientName: true, patientPhone: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Bookings without a patient: ${bookings.length}${apply ? "" : " (dry run — pass --apply)"}`);

  for (const b of bookings) {
    const tail = last10(b.patientPhone);
    const label = `${b.id} ${b.patientName ?? "?"} ${b.patientPhone}`;
    if (tail.length < 10) {
      console.log(`  SKIP ${label}: no valid mobile`);
      continue;
    }
    const onPhone = await prisma.user.findMany({
      where: {
        role: "user",
        patient: { isNot: null },
        OR: [{ phone: { endsWith: tail } }, { patient: { contactNumber: { endsWith: tail } } }],
      },
      select: { id: true, name: true, patient: { select: { mrn: true } } },
    });
    const match = onPhone.filter((u) => sameName(u.name, b.patientName));

    if (match.length === 1) {
      console.log(`  LINK ${label} → ${match[0].patient?.mrn}`);
      if (apply) {
        await prisma.practiceBooking.update({ where: { id: b.id }, data: { patientId: match[0].id } });
      }
      continue;
    }
    if (onPhone.length) {
      console.log(
        `  SKIP ${label}: ${onPhone.length} other patient(s) on this mobile (${onPhone
          .map((u) => `${u.name} ${u.patient?.mrn}`)
          .join(", ")}) — register at the desk as a family member`,
      );
      continue;
    }

    const phone = String(b.patientPhone).replace(/\D/g, "");
    if (!apply) {
      console.log(`  CREATE ${label}`);
      continue;
    }
    const prefix = await ensurePracticeMrnPrefix(b.practiceId);
    const mrn = await allocatePatientMrn(prisma, { prefix });
    let email = `wa${phone}@patients.glucoguide.local`;
    if (await prisma.user.findUnique({ where: { email } })) {
      email = `wa${phone}.${Date.now()}@patients.glucoguide.local`;
    }
    const user = await prisma.user.create({
      data: {
        email,
        role: "user",
        name: b.patientName?.trim().slice(0, 120) || "Patient",
        phone,
        createdBy: "booking_backfill",
        patient: { create: { mrn, contactNumber: phone } },
      },
      select: { id: true },
    });
    await prisma.practiceBooking.update({ where: { id: b.id }, data: { patientId: user.id } });
    console.log(`  CREATE ${label} → ${mrn}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
