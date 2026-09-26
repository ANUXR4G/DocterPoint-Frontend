/**
 * Care-chat display filter — hide WhatsApp bot menu noise already stored in
 * Message rows. Keep cancel / attachment system notices visible.
 * Mirror of backend `shouldHideFromCareChat` in chat.whatsappInbound.ts.
 */
export function shouldHideFromCareChat(text: string): boolean {
  const raw = String(text || "").trim()
  if (!raw) return true

  if (
    raw.startsWith("❌") ||
    raw.startsWith("📎") ||
    /^cancelled via whatsapp/i.test(raw) ||
    /^attached a visit document/i.test(raw)
  ) {
    return false
  }

  const t = raw.toLowerCase()

  if (
    /^(?:menu|post|booking|slot|date|mode|patient|provider|lang|reg_email_)/i.test(
      t,
    )
  ) {
    return true
  }
  if (/^(?:yes|no)$/i.test(t)) return true
  if (/^[1-9]$/.test(t)) return true
  if (/^[1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣9️⃣]$/u.test(t)) return true
  if (/^[1-9]\s*[·.•\-–—)]\s*\S+/u.test(t)) return true

  // Bare "main" = Main Menu truncation; Male/Female/Others = gender buttons.
  if (
    /^(main(\s*menu)?|booking|book(\s*appt)?|book\s*new\s*appointment|my\s*bookings|view\s*\/?\s*manage\s*bookings|add\s*family|family(\s*member)?|register(\s*family)?|support|talk\s*to\s*(support|agent)|msg\s*doctor|message(\s*to)?\s*doctor|attach(\s*(report|doc|document))?|cancel|reschedule|status|doctors?|faq|help|language|new\s*booking|resume(\s*bot)?|bot|exit|quit|callback|call\s*back|select(\s+appointment)?|general(\s+document)?|male|female|others?|self|spouse|parent|child|sibling|friend)$/i.test(
      t,
    )
  ) {
    return true
  }

  if (
    /^(ok|okay|k|kk|ya|yep|yup|nah|nope|thanks|thank\s*you|thx|hi+|hello|hey|hola|yo|boat|you|test|hmm+|hii+|he+y+)$/i.test(
      t,
    )
  ) {
    return true
  }

  if (
    /^(book|cancel|reschedule|status|help|menu|bot|resume|hi|hello|hey|start|register|stop|report|reports|my\s*docs?|document|documents|doctors?|faq|info|message|msg|new\s+book)\b/.test(
      t,
    )
  ) {
    return true
  }

  return false
}
