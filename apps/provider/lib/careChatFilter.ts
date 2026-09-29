/**
 * Care-chat display filter — hide only WhatsApp bot menu payloads that older
 * rows stored as messages (button ids, numbered list titles, exact menu labels).
 * Greetings, yes / no, numbers and any real sentence always show.
 * Same rules as frontend/lib/careChatFilter.ts.
 */
export function shouldHideFromCareChat(text: string): boolean {
  const raw = String(text || "").trim();
  if (!raw) return true;

  const t = raw.toLowerCase();

  if (
    /^(?:menu|post|booking|slot|date|mode|patient|provider|lang|rel|doc|whom|confirm|idle|continue|nlu|specialty|manage|reg_email)[:_]\S*$/i.test(
      t,
    )
  ) {
    return true;
  }

  if (/^[1-9]\u{FE0F}?\u{20E3}$/u.test(t)) return true;
  if (/^[1-9]\s*[·•]\s*\S+/u.test(t)) return true;

  if (
    /^(main\s*menu|book\s*appt|book\s*new\s*appointment|my\s*bookings|view\s*\/?\s*manage\s*bookings|my\s*family(\s*members?)?|add\s*family(\s*member)?|register\s*family|talk\s*to\s*(support|agent)|msg\s*doctor|message\s*(to\s*)?doctor|attach\s*(report|doc|document)|new\s*booking|resume\s*bot|call\s*back|select\s+appointment|general\s+document|exit|quit)$/i.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}
