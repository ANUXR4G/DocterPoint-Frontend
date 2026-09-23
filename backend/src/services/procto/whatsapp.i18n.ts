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
    "Please choose your preferred language / कृपया अपनी भाषा चुनें.\n\n" +
    "Use the buttons below."
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

  if (/^lang:en$/i.test(t)) return "en";
  if (/^lang:hi$/i.test(t)) return "hi";
  // Meta sometimes echoes the button title with extra punctuation / emoji
  if (/^english\b/i.test(t) || /\benglish\b/i.test(t)) return "en";
  if (
    /^(1|one|en|eng)$/i.test(t)
  ) {
    return "en";
  }
  if (
    /^(2|two|hin|hindi|हिंदी|हिन्दी|हिं)$/i.test(t) ||
    /^हिंद[ीि]$/.test(raw) ||
    /\bhindi\b/i.test(t) ||
    /हिंद[ीि]/.test(raw)
  ) {
    return "hi";
  }
  return null;
}

export function wantsLanguageChange(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /^(language|lang|change language|set language|change lang)$/i.test(t) ||
    /^menu:lang(uage)?$/i.test(t) ||
    /^(भाषा|भाषा बदलो|भाषा बदलें)$/i.test(text.trim())
  );
}

/** True when inbound is a language chip / lang:en|hi (not free-form chat). */
export function isLanguageButtonReply(text: string): boolean {
  const t = text.trim();
  return /^lang:(en|hi)$/i.test(t) || Boolean(parseLanguageChoice(t) && /^(english|hindi|हिंदी|हिन्दी|1|2|en|eng|hin)$/i.test(t));
}

/** Pick English or Hindi string. */
export function L(lang: WaLang | undefined, en: string, hi: string): string {
  return resolveLang(lang) === "hi" ? hi : en;
}
