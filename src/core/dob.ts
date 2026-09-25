/**
 * Parse common DOB strings and compute age in whole years.
 * Accepts YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY, and Date-parseable ISO.
 */
export function parseDateOfBirth(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();

  const ymd = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (ymd) {
    const d = new Date(
      Number(ymd[1]),
      Number(ymd[2]) - 1,
      Number(ymd[3]),
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const dmy = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const y = Number(dmy[3]);
    // Prefer DD/MM/YYYY when day > 12; else treat first as month (US MM/DD).
    const dayFirst = a > 12;
    const dd = dayFirst ? a : b > 12 ? b : a;
    const mm = dayFirst ? b : a;
    const d = new Date(y, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Normalize DOB to YYYY-MM-DD for storage, or null if invalid. */
export function normalizeDateOfBirth(
  raw: string | null | undefined,
): string | null {
  const d = parseDateOfBirth(raw);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (y < 1900 || y > new Date().getFullYear()) return null;
  return `${y}-${m}-${day}`;
}

/** Whole-year age from DOB, or null if unknown/invalid. */
export function ageFromDob(raw: string | null | undefined): number | null {
  const d = parseDateOfBirth(raw);
  if (!d) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  if (age < 0 || age > 130) return null;
  return age;
}
