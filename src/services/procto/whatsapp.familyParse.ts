/** Branch C — parse relationship / DOB + national ID from WhatsApp replies. */

/** Parse DD/MM/YYYY (or DD-MM-YYYY) + Emirates/National ID from one message. */
export function parseFamilyDobAndId(text: string): {
  dob: string | null;
  nationalId: string | null;
} {
  const raw = text.trim();
  const dobMatch = raw.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/);
  let dob: string | null = null;
  if (dobMatch) {
    const dd = Number(dobMatch[1]);
    const mm = Number(dobMatch[2]);
    const yyyy = Number(dobMatch[3]);
    if (
      dd >= 1 &&
      dd <= 31 &&
      mm >= 1 &&
      mm <= 12 &&
      yyyy >= 1900 &&
      yyyy <= new Date().getFullYear()
    ) {
      dob = `${String(yyyy)}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }
  }

  let nationalId: string | null = null;
  const emirates = raw.match(/\b784[-\s]?\d{4}[-\s]?\d{7}[-\s]?\d\b/i);
  if (emirates) {
    nationalId = emirates[0]!.replace(/[-\s]/g, "").slice(0, 32);
  } else {
    const fifteen = raw.match(/\b\d{15}\b/);
    if (fifteen) {
      nationalId = fifteen[0]!.slice(0, 32);
    } else {
      const aadhaar = raw.match(/\b\d{12}\b/);
      if (aadhaar) nationalId = aadhaar[0]!.slice(0, 32);
    }
  }

  if (!nationalId) {
    const rest = raw
      .replace(dobMatch?.[0] ?? "", "")
      .replace(
        /\b(dob|date of birth|emirates|national|id|aadhaar|aadhar)\b/gi,
        "",
      )
      .trim();
    const token = rest.match(/\b[A-Za-z0-9][A-Za-z0-9\-]{5,31}\b/);
    if (token) nationalId = token[0]!.replace(/\s+/g, "").slice(0, 32);
  }

  return { dob, nationalId };
}

export function parseRelationshipChoice(text: string): string | null {
  const raw = text.trim();
  const tap = /^rel:(spouse|child|parent)$/i.exec(raw);
  if (tap) {
    const k = tap[1]!.toLowerCase();
    return k.charAt(0).toUpperCase() + k.slice(1);
  }
  if (/^(spouse|husband|wife|partner|पति|पत्नी)$/i.test(raw)) return "Spouse";
  if (/^(child|son|daughter|kid|बच्चा|बेटा|बेटी)$/i.test(raw)) return "Child";
  if (/^(parent|father|mother|माता|पिता|माता-पिता)$/i.test(raw)) {
    return "Parent";
  }
  if (/^(sibling|brother|sister|भाई|बहन)$/i.test(raw)) return "Sibling";
  if (raw.length >= 2 && raw.length <= 40 && !/^\d+$/.test(raw)) {
    return raw.replace(/\s+/g, " ").trim().slice(0, 64);
  }
  return null;
}
