/**
 * Display MSISDN as +CC-national, e.g. 919999973601 → +91-9999973601.
 * Storage/API values stay digits-only; this is UI-only.
 */
export function formatPhoneDisplay(
  phone: string | null | undefined,
  empty = "—",
): string {
  if (phone == null) return empty
  const raw = String(phone).trim()
  if (!raw || raw === "—" || raw === "-") return empty === "—" ? empty : raw

  const digits = raw.replace(/\D/g, "")
  if (!digits) return raw

  // India: bare 10-digit mobile
  if (digits.length === 10) return `+91-${digits}`

  // India: 91 + 10 digits
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91-${digits.slice(2)}`
  }

  // UAE: 971 + 9 digits (common)
  if (digits.startsWith("971") && digits.length >= 11 && digits.length <= 12) {
    return `+971-${digits.slice(3)}`
  }

  // Generic E.164-ish: treat last 10 as national when CC is present
  if (digits.length > 10 && digits.length <= 15) {
    const national = digits.slice(-10)
    const cc = digits.slice(0, digits.length - 10)
    if (cc) return `+${cc}-${national}`
  }

  return `+${digits}`
}
