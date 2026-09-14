import { AppError } from "./response.js";

/** Canonical gender values stored on User.gender for patients */
export type GenderValue = "male" | "female" | "others";

/**
 * Normalize free-text / OCR / NLU gender to male | female | others.
 * Returns null when unknown (do not invent a value).
 */
export function normalizeGender(value: unknown): GenderValue | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const g = String(value).trim().toLowerCase();
  if (!g) return null;
  if (
    g === "male" ||
    g === "m" ||
    g === "पुरुष" ||
    g === "man" ||
    g === "boy"
  ) {
    return "male";
  }
  if (
    g === "female" ||
    g === "f" ||
    g === "महिला" ||
    g === "woman" ||
    g === "girl"
  ) {
    return "female";
  }
  if (
    g === "others" ||
    g === "other" ||
    g === "o" ||
    g === "अन्य" ||
    g === "non-binary" ||
    g === "nonbinary" ||
    g === "nb"
  ) {
    return "others";
  }
  return null;
}

export function last10Digits(value: unknown): string {
  if (value == null) return "";
  return String(value).replace(/\D/g, "").slice(-10);
}

/** Require a canonical gender for patient accounts. */
export function requireGender(value: unknown): GenderValue {
  const g = normalizeGender(value);
  if (!g) {
    throw new AppError(
      400,
      "Gender is required. Choose male, female, or others.",
    );
  }
  return g;
}
