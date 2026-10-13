/**
 * Identity for a patient mobile.
 * India stays on the legacy 10-digit key (with or without 91).
 * Every other country keeps the full number, so +971… and +1… never count as one person.
 */
export function phoneKey(input: string | null | undefined): string {
  let digits = String(input || "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length === 10) return digits;
  return digits;
}

export function samePatientMobile(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  return ka.length >= 8 && ka === kb;
}

/** Child of the account holder. Spouse and other adults stay on their own record. */
export function isChildRelationship(value: string | null | undefined): boolean {
  const rel = String(value || "").trim().toLowerCase();
  return rel === "child" || rel === "son" || rel === "daughter";
}
