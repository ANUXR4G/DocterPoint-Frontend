/**
 * Global keyword hijacks — exact trigger words that abort any mid-flow step
 * and redirect (Branch A/C/F) or end the session / log a callback.
 */

export type GlobalHijack =
  | "register"
  | "book"
  | "exit"
  | "attach"
  | "callback"
  /** Reset to Main Interactive Menu */
  | "main_menu"
  /** Route to human support / agent */
  | "agent";

/**
 * Returns a hijack when the user typed a standalone trigger keyword.
 * Interactive ids (menu:, cancel:yes, …) never match.
 */
export function parseGlobalKeywordHijack(text: string): GlobalHijack | null {
  const raw = String(text || "")
    .trim()
    .replace(/^[*`~_]+|[*`~_]+$/g, "")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
  if (!raw || raw.length > 40) return null;

  // Structured interactive payloads — never treat as keyword hijacks.
  if (
    /^(?:menu|post|booking|slot|date|mode|patient|provider|lang|rel|doc|cancel|confirm|reg_email_|idle|continue|nlu):/i.test(
      raw,
    )
  ) {
    return null;
  }

  const t = raw.toLowerCase().replace(/\s+/g, " ").trim();

  // Exit / Cancel → end session (exact only; "cancel booking" stays Branch B).
  if (
    /^(exit|quit|end|end session|stop chat|bye)$/i.test(t) ||
    /^cancel$/i.test(t)
  ) {
    return "exit";
  }

  // Navigation — Main / Menu → main interactive menu
  if (/^(main|menu|main\s*menu|show\s*menu|open\s*menu|back\s*to\s*menu|मेनू|मुख्य\s*मेनू)$/i.test(t)) {
    return "main_menu";
  }

  // Navigation — Agent / Help → human support
  if (/^(agent|help|human|support|हेल्प|मदद)$/i.test(t)) {
    return "agent";
  }

  if (/^(register|registration|sign\s*up|signup)$/i.test(t)) {
    return "register";
  }

  if (/^(book|booking)$/i.test(t)) {
    return "book";
  }

  if (
    /^(attach|attach\s*(a\s+)?(document|doc|file|report)?|document)$/i.test(t)
  ) {
    return "attach";
  }

  if (
    /^(callback|call\s*back|call_back|request\s*callback|call\s*me\s*back)$/i.test(
      t,
    )
  ) {
    return "callback";
  }

  return null;
}
