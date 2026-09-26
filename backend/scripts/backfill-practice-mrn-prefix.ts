/**
 * Backfill practice.mrnPrefix for clinics/doctors that don't have one yet.
 * Run: cd backend && npx tsx scripts/backfill-practice-mrn-prefix.ts
 */
import { PrismaClient } from "@prisma/client";
import { allocateUniquePracticeMrnPrefix } from "../src/core/patientMrn.js";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.practice.findMany({
    where: { OR: [{ mrnPrefix: null }, { mrnPrefix: "" }] },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Practices missing mrnPrefix: ${rows.length}`);
  for (const row of rows) {
    const prefix = await allocateUniquePracticeMrnPrefix(row.name, {
      excludePracticeId: row.id,
    });
    await prisma.practice.update({
      where: { id: row.id },
      data: { mrnPrefix: prefix },
    });
    console.log(`  ${row.name} → ${prefix} (…${prefix}MR########)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
