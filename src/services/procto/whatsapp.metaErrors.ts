/**
 * Map Meta Cloud API WhatsApp errors to ops-safe + patient-safe copy.
 * Prefer `error.code` when present; fall back to message text (#131037 often
 * appears only as "(#131037) …" in `error.message`).
 */

export type MetaGraphErrorBody = {
  message?: string;
  code?: number;
  error_subcode?: number;
  error_user_title?: string;
  error_user_msg?: string;
  fbtrace_id?: string;
  type?: string;
};

export type ParsedMetaWhatsAppError = {
  code?: number;
  /** Raw Meta message (logs / SKIPPED payload). */
  message: string;
  /** Safe to show in patient / clinic UI. */
  userMessage: string;
};

/** Patient login OTP — display name not approved on the platform line. */
export const OTP_DISPLAY_NAME_PENDING_MESSAGE =
  "We can't send your WhatsApp login code yet — the GlucoGuide WhatsApp display name is still waiting for Meta approval. Please try again in 1–3 business days, or contact support.";

/** Generic outbound (care chat, notifications, payments). */
export const DISPLAY_NAME_PENDING_MESSAGE =
  "WhatsApp can't send from this clinic line yet — the business display name is still waiting for Meta approval. Messages will work after Meta approves the name (usually 1–3 business days).";

export function parseMetaGraphError(
  raw: unknown,
  fallback = "WhatsApp send failed",
): ParsedMetaWhatsAppError {
  const err =
    raw && typeof raw === "object" ? (raw as MetaGraphErrorBody) : null;
  const message = String(
    err?.error_user_msg || err?.message || fallback,
  ).trim() || fallback;
  const code = typeof err?.code === "number" ? err.code : undefined;
  const blob = `${code ?? ""} ${message} ${err?.error_user_title ?? ""}`;

  if (
    code === 131037 ||
    /#?\s*131037\b/.test(blob) ||
    /display name/i.test(message)
  ) {
    return {
      code: 131037,
      message,
      userMessage: DISPLAY_NAME_PENDING_MESSAGE,
    };
  }

  if (
    code === 131047 ||
    /#?\s*131047\b/.test(blob) ||
    /outside.*allowed.*window/i.test(message) ||
    /re-engagement/i.test(message)
  ) {
    return {
      code: 131047,
      message,
      userMessage:
        "WhatsApp can only reach this patient within 24 hours of their last reply. Ask them to message the clinic first, or send an approved template.",
    };
  }

  return { code, message, userMessage: message };
}

export function isMetaDisplayNameBlocked(
  err?: string | null | { code?: number; message?: string },
): boolean {
  if (!err) return false;
  if (typeof err === "object") {
    return (
      err.code === 131037 ||
      /#?\s*131037\b|display name/i.test(err.message || "")
    );
  }
  return /#?\s*131037\b|display name/i.test(err);
}

export function isMetaOutsideWindowError(
  err?: string | null | { code?: number; message?: string },
): boolean {
  if (!err) return false;
  if (typeof err === "object") {
    return (
      err.code === 131047 ||
      /#?\s*131047\b|outside.*allowed.*window|re-engagement|24.?hour/i.test(
        err.message || "",
      )
    );
  }
  return /#?\s*131047\b|outside.*allowed.*window|re-engagement|24.?hour/i.test(
    err,
  );
}
