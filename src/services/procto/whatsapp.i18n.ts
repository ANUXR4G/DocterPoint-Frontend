/** WhatsApp bot preferred-language helpers (India clinic booking). */

export type WaLang = "en" | "hi";

export const WA_LANGS: Array<{ code: WaLang; label: string }> = [
  { code: "en", label: "English" },
  { code: "hi", label: "हिंदी (Hindi)" },
];

export function resolveLang(value: unknown): WaLang {
  if (value === "hi") return "hi";
  return "en";
}

/** Bilingual first-step prompt — shown before any other bot copy. */
export function askPreferredLanguage(): string {
  return (
    "Please choose your preferred language / कृपया अपनी भाषा चुनें:\n\n" +
    "1. English\n" +
    "2. हिंदी (Hindi)\n\n" +
    "Reply with *1* or *2* (or English / Hindi)."
  );
}

export function languageSetAck(lang: WaLang): string {
  if (lang === "hi") {
    return "✅ भाषा *हिंदी* सेट हो गई। अब मैं हिंदी में जवाब दूँगा/दूँगी।";
  }
  return "✅ Language set to *English*. I'll continue in English.";
}

/**
 * Parse a language choice from the patient reply.
 * Accepts 1/2, EN/HIN, English/Hindi, हिंदी, etc.
 * Do NOT treat bare "hi" as Hindi — that is a common English greeting.
 */
export function parseLanguageChoice(text: string): WaLang | null {
  const raw = text.trim();
  if (!raw) return null;
  const t = raw.toLowerCase();

  if (/^(1|one|en|eng|english)$/i.test(t)) return "en";
  if (
    /^(2|two|hin|hindi|हिंदी|हिन्दी|हिं)$/i.test(t) ||
    /^हिंद[ीि]$/.test(raw)
  ) {
    return "hi";
  }
  if (/\benglish\b/i.test(t)) return "en";
  if (/\bhindi\b/i.test(t) || /हिंद[ीि]/.test(raw)) return "hi";
  return null;
}

export function wantsLanguageChange(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /^(language|lang|change language|set language)$/i.test(t) ||
    /^(भाषा|भाषा बदलो|भाषा बदलें)$/i.test(text.trim())
  );
}

/** Pick English or Hindi string. */
export function L(lang: WaLang | undefined, en: string, hi: string): string {
  return resolveLang(lang) === "hi" ? hi : en;
}
