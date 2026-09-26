/**
 * Global keyword hijacks — trigger words that abort any mid-flow step
 * and redirect (Branch A/C/F) or end the session / log a callback.
 *
 * Voice STT often adds punctuation ("Book.") or short politeness
 * ("book please") — those must still interrupt doc-upload and other steps.
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

/** Normalize typed / STT text for standalone command matching. */
export function normalizeHijackText(text: string): string {
  return String(text || "")
    .trim()
    .replace(/^[*`~_]+|[*`~_]+$/g, "")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ")
    // Whisper / phone STT trailing (and leading) punctuation
    .replace(/^[.,!?;:…'"“”‘’]+|[.,!?;:…'"“”‘’]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True when the utterance looks like a short command, not free-form booking
 * speech with a date/time ("book tomorrow morning").
 */
function isShortCommandUtterance(t: string): boolean {
  if (!t || t.length > 48) return false;
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;
  // Date/time cues → leave for NLU (do not blind-hijack)
  if (
    /\b(tomorrow|today|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|कल|आज|सुबह|शाम|\d{1,2}([:.]\d{2})?\s*(am|pm)?|\d{1,2}\/\d{1,2})\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return true;
}

/**
 * Returns a hijack when the user typed/spoke a standalone trigger keyword.
 * Interactive ids (menu:, cancel:yes, …) never match.
 */
export function parseGlobalKeywordHijack(text: string): GlobalHijack | null {
  const raw = String(text || "")
    .trim()
    .replace(/^[*`~_]+|[*`~_]+$/g, "")
    .replace(/[\u00a0\u202f\u2007\u2009]/g, " ");
  if (!raw || raw.length > 60) return null;

  // Structured interactive payloads — never treat as keyword hijacks.
  if (
    /^(?:menu|post|booking|slot|date|mode|patient|provider|lang|rel|doc|cancel|confirm|reg_email_|idle|continue|nlu|whom|specialty|manage):/i.test(
      raw,
    )
  ) {
    return null;
  }

  const t = normalizeHijackText(raw);
  if (!t) return null;

  // Exit / Cancel → end session (exact only; "cancel booking" stays Branch B).
  if (
    /^(exit|quit|end|end session|stop chat|bye)$/i.test(t) ||
    /^cancel$/i.test(t)
  ) {
    return "exit";
  }

  // Navigation — Main / Menu → main interactive menu
  if (
    /^(main|menu|main\s*menu|show\s*menu|open\s*menu|back\s*to\s*menu|मेनू|मुख्य\s*मेनू)$/i.test(
      t,
    )
  ) {
    return "main_menu";
  }

  // Navigation — Agent / Help → human support
  if (/^(agent|help|human|support|हेल्प|मदद)$/i.test(t)) {
    return "agent";
  }

  if (
    /^(register|registration|sign\s*up|signup|please\s+register)$/i.test(t)
  ) {
    return "register";
  }

  // Book — exact + short voice/STT variants (must abort mid-flow, e.g. docs)
  if (
    /^(book|booking|bok|please\s+book|book\s+please|book\s+now|new\s+book(ing)?|start\s+book(ing)?|book\s+(an?\s+)?(appointment|slot|visit)|appointment)$/i.test(
      t,
    )
  ) {
    return "book";
  }
  // Short spoken command containing "book" without a date/time payload
  if (
    isShortCommandUtterance(t) &&
    /\b(book|booking)\b/i.test(t) &&
    !/\b(cancel|reschedule|attach|document|report)\b/i.test(t)
  ) {
    return "book";
  }

  if (
    /^(attach|attach\s*(a\s+)?(document|doc|file|report)?|document|please\s+attach)$/i.test(
      t,
    )
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
