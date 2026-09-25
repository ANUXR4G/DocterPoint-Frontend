/**
 * WhatsApp self-register stores a synthetic mailbox when the patient skips email.
 * Never surface those as a real contact address in clinic UIs or APIs.
 */
export function publicPatientEmail(
  email: string | null | undefined,
): string | null {
  if (!email?.trim()) return null;
  const e = email.trim();
  if (e.endsWith("@patients.glucoguide.local")) return null;
  return e;
}

/** Trimmed address or null — never invent a placeholder. */
export function publicPatientAddress(
  address: string | null | undefined,
): string | null {
  const a = address?.trim();
  return a ? a : null;
}
