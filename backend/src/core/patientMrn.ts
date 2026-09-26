import { prisma } from "../db/prisma.js";

type Tx = {
  $queryRaw: typeof prisma.$queryRaw;
  practice?: typeof prisma.practice;
};

const PREFIX_STOP_WORDS = new Set([
  "the",
  "and",
  "of",
  "at",
  "for",
  "a",
  "an",
  "dr",
  "drs",
]);

/**
 * Initials from a clinic / doctor practice name.
 * "Priya Clinic" → "PC", "Dr Anurag Nanda" → "AN" (Dr skipped).
 */
export function deriveMrnPrefixFromName(name: string): string {
  const words = String(name || "")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);

  const significant = words.filter(
    (w) => !PREFIX_STOP_WORDS.has(w.toLowerCase()),
  );
  const source = significant.length > 0 ? significant : words;

  let prefix = source
    .map((w) => w.charAt(0))
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (prefix.length < 2 && source[0]) {
    prefix = source[0]
      .slice(0, 2)
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  return (prefix.slice(0, 6) || "XX").toUpperCase();
}

export function sanitizeMrnPrefix(prefix: string | null | undefined): string {
  return String(prefix || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

/**
 * Format: optional clinic/doctor prefix + MR + 8 zero-padded digits.
 * e.g. MR00000042 or PCMR00000001 (Priya Clinic).
 */
export function formatPatientMrn(
  seq: number | bigint,
  prefix: string | null | undefined = "",
): string {
  const n = typeof seq === "bigint" ? Number(seq) : seq;
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("Invalid MRN sequence value");
  }
  const p = sanitizeMrnPrefix(prefix);
  return `${p}MR${String(Math.trunc(n)).padStart(8, "0")}`;
}

/**
 * Pick a unique practice MRN prefix, appending 2/3/… if the base is taken.
 */
export async function allocateUniquePracticeMrnPrefix(
  name: string,
  opts?: { excludePracticeId?: string; db?: typeof prisma },
): Promise<string> {
  const db = opts?.db ?? prisma;
  const base = deriveMrnPrefixFromName(name) || "XX";

  for (let i = 0; i < 50; i++) {
    const candidate =
      i === 0 ? base : `${base.slice(0, 5)}${i}`.slice(0, 6).toUpperCase();
    const existing = await db.practice.findFirst({
      where: {
        mrnPrefix: candidate,
        ...(opts?.excludePracticeId
          ? { id: { not: opts.excludePracticeId } }
          : {}),
      },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  // Extremely unlikely fallback — timestamp fragment.
  return `X${Date.now().toString(36).slice(-5)}`.toUpperCase().slice(0, 6);
}

/**
 * Ensure a practice has a stable mrnPrefix (create if missing). Never renames
 * an existing prefix — issued patient MRNs must keep matching the practice label.
 */
export async function ensurePracticeMrnPrefix(
  practiceId: string,
  practiceName?: string | null,
  db: typeof prisma = prisma,
): Promise<string> {
  const row = await db.practice.findUnique({
    where: { id: practiceId },
    select: { id: true, name: true, mrnPrefix: true },
  });
  if (!row) {
    throw new Error("Practice not found for MRN prefix");
  }
  if (row.mrnPrefix?.trim()) {
    return sanitizeMrnPrefix(row.mrnPrefix);
  }
  const prefix = await allocateUniquePracticeMrnPrefix(
    practiceName || row.name,
    { excludePracticeId: practiceId, db },
  );
  await db.practice.update({
    where: { id: practiceId },
    data: { mrnPrefix: prefix },
  });
  return prefix;
}

/**
 * Allocate the next globally unique Medical Record Number.
 * Uses Postgres sequence `patient_mrn_seq` (see migration).
 * Pass `prefix` (e.g. practice.mrnPrefix) for clinic/doctor-scoped labels.
 */
export async function allocatePatientMrn(
  db: Tx = prisma,
  opts?: { prefix?: string | null },
): Promise<string> {
  const rows = await db.$queryRaw<Array<{ nextval: bigint | number }>>`
    SELECT nextval('patient_mrn_seq') AS nextval
  `;
  const next = rows[0]?.nextval;
  if (next == null) {
    throw new Error("Failed to allocate patient MRN");
  }
  return formatPatientMrn(next, opts?.prefix);
}
