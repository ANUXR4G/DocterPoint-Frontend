/** Patient-safe WhatsApp error copy (mirrors backend whatsapp.metaErrors). */

const OTP_DISPLAY_NAME =
  "We can't send your WhatsApp login code yet — the GlucoGuide WhatsApp display name is still waiting for Meta approval. Please try again in 1–3 business days, or contact support."

export function friendlyWhatsAppError(raw?: string | null): string {
  const msg = String(raw || "").trim()
  if (!msg) return "Could not send OTP on WhatsApp. Try again in a moment."
  if (/#?\s*131037\b|display name/i.test(msg)) return OTP_DISPLAY_NAME
  return msg
}
