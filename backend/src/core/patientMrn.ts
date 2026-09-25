import { prisma } from "../db/prisma.js";

type Tx = {
  $queryRaw: typeof prisma.$queryRaw;
};

/** Format: MR + 8 zero-padded digits, e.g. MR00000042 */
export function formatPatientMrn(seq: number | bigint): string {
  const n = typeof seq === "bigint" ? Number(seq) : seq;
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("Invalid MRN sequence value");
  }
  return `MR${String(Math.trunc(n)).padStart(8, "0")}`;
}

/**
 * Allocate the next globally unique Medical Record Number.
 * Uses Postgres sequence `patient_mrn_seq` (see migration).
 */
export async function allocatePatientMrn(
  db: Tx = prisma,
): Promise<string> {
  const rows = await db.$queryRaw<Array<{ nextval: bigint | number }>>`
    SELECT nextval('patient_mrn_seq') AS nextval
  `;
  const next = rows[0]?.nextval;
  if (next == null) {
    throw new Error("Failed to allocate patient MRN");
  }
  return formatPatientMrn(next);
}
