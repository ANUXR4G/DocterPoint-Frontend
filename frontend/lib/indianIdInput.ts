/** Strip to up to 12 Aadhaar digits. */
export function parseAadhaarInput(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 12)
}

/** Display Aadhaar as 1234 5678 9012 while storing raw digits. */
export function formatAadhaarDisplay(digits: string): string {
  const d = parseAadhaarInput(digits)
  if (!d) return ""
  return d.replace(/(\d{4})(?=\d)/g, "$1 ").trim()
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/** Strip to up to 10 PAN characters (uppercase). */
export function parsePanInput(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10)
}

export function isValidPan(value: string): boolean {
  return PAN_RE.test(parsePanInput(value))
}

export function panValidationMessage(value: string): string | null {
  const pan = parsePanInput(value)
  if (!pan) return null
  if (pan.length < 10) return "PAN must be 10 characters (e.g. ABCDE1234F)."
  if (!isValidPan(pan)) return "Use format ABCDE1234F (5 letters, 4 digits, 1 letter)."
  return null
}
