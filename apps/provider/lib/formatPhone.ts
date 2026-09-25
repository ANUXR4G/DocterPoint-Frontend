/**
 * Display MSISDN as +CC-national, e.g. 919999973601 → +91-9999973601.
 * Mirrors frontend/lib/formatPhone.ts — UI-only.
 */
export function formatPhoneDisplay(
  phone: string | null | undefined,
  empty = "—",
): string {
  if (phone == null) return empty;
  const raw = String(phone).trim();
  if (!raw || raw === "—" || raw === "-") return empty === "—" ? empty : raw;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return raw;

  if (digits.length === 10) return `+91-${digits}`;

  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91-${digits.slice(2)}`;
  }

  if (digits.startsWith("971") && digits.length >= 11 && digits.length <= 12) {
    return `+971-${digits.slice(3)}`;
  }

  if (digits.length > 10 && digits.length <= 15) {
    const national = digits.slice(-10);
    const cc = digits.slice(0, digits.length - 10);
    if (cc) return `+${cc}-${national}`;
  }

  return `+${digits}`;
}
