import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type PrescriptionMedicine = {
  name?: string;
  amount?: string;
  dose?: string;
  doseUnit?: string;
  times?: string[];
  frequency?: string;
  strength?: string;
  duration?: string;
  durationUnit?: string;
  instruction?: string;
};

export type PrescriptionPdfInput = {
  clinicName: string;
  address?: string;
  phone?: string;
  email?: string;
  patientName: string;
  patientPhone?: string;
  mrn?: string;
  dob?: string;
  ageGender?: string;
  visitId?: string;
  shortId?: string;
  doctorName: string;
  license?: string;
  qualification?: string;
  appointment?: string;
  chiefComplaint?: string;
  diagnosis?: string;
  allergies?: string[];
  vitalLine?: string;
  remarks?: string;
  printed?: string;
  medicines: PrescriptionMedicine[];
};

const INK = rgb(0.08, 0.1, 0.12);
const TEAL = rgb(0.05, 0.45, 0.52);
const BLUE = rgb(0.1, 0.45, 0.75);
const MUTED = rgb(0.35, 0.4, 0.45);

function safe(text: string): string {
  return text
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function doseUnits(text: string): number {
  const fraction = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (fraction) {
    const value = Number(fraction[1]) / Number(fraction[2]);
    if (Number.isFinite(value) && value > 0) return value;
  }
  const lower = text.toLowerCase();
  if (/\bqid\b|four times|6 hour/.test(lower)) return 4;
  if (/\btid\b|thrice|three times|8 hour/.test(lower)) return 3;
  if (/\bbd\b|\bbid\b|twice|two times|12 hour/.test(lower)) return 2;
  if (/\bod\b|once|daily|24 hour|night|morning/.test(lower)) return 1;
  return 0;
}

function durationDays(duration?: string, unit?: string): number {
  const count = Number(duration);
  if (!Number.isFinite(count) || count <= 0) return 0;
  const label = (unit || "day").toLowerCase();
  if (label.startsWith("week")) return count * 7;
  if (label.startsWith("month")) return count * 30;
  if (label.startsWith("hour")) return 0;
  return count;
}

function formLabel(name: string): string {
  if (/^cap/i.test(name)) return "Cap";
  if (/syrup|syp\b|drop|spray/i.test(name)) return "Dose";
  return "Tab";
}

function pharmacyRows(medicines: PrescriptionMedicine[]) {
  return medicines
    .filter((med) => med.name?.trim())
    .map((med) => {
      const how = [
        med.dose?.trim() || med.amount?.trim() || "",
        med.doseUnit?.trim() || "",
        med.frequency?.trim() || (med.times?.length ? med.times.join(", ") : ""),
      ]
        .filter(Boolean)
        .join(" ");
      const days = durationDays(med.duration, med.durationUnit);
      const perDay = doseUnits(`${how} ${(med.times ?? []).join(" ")}`);
      const total =
        perDay > 0 && days > 0
          ? `(Tot:${Math.round(perDay * days)} ${formLabel(med.name!.trim())})`
          : "";
      return {
        name: med.name!.trim(),
        strength: med.strength?.trim() || "",
        dosage: how,
        instruction: med.instruction?.trim() || "",
        duration: [med.duration?.trim(), med.durationUnit?.trim()].filter(Boolean).join(" "),
        total,
      };
    });
}

function adviceLines(text?: string): string[] {
  return (text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s*#-]+/, "").trim())
    .filter(Boolean)
    .map((line) => `* ${line}`);
}

export function prescriptionFileName(patientName: string): string {
  const slug = safe(patientName)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `Prescription-${slug || "patient"}.pdf`;
}

function drawMark(page: PDFPage, x: number, top: number) {
  const size = 36;
  page.drawRectangle({
    x,
    y: top - size,
    width: size,
    height: size,
    borderWidth: 1,
    borderColor: BLUE,
    color: rgb(0.93, 0.97, 1),
  });
  const midX = x + size / 2;
  const midY = top - size / 2;
  page.drawLine({
    start: { x: midX, y: top - 7 },
    end: { x: midX, y: top - size + 7 },
    thickness: 5,
    color: BLUE,
  });
  page.drawLine({
    start: { x: x + 7, y: midY },
    end: { x: x + size - 7, y: midY },
    thickness: 5,
    color: BLUE,
  });
}

/** A4 pharmacy prescription, matching the printed prescription sheet. */
export async function buildPrescriptionPdf(
  input: PrescriptionPdfInput,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595.28, 841.89]);
  let y = 800;
  const left = 36;
  const right = 559;
  const width = right - left;

  const ensure = (need: number) => {
    if (y - need > 46) return;
    page = doc.addPage([595.28, 841.89]);
    y = 800;
  };
  const draw = (
    text: string,
    x: number,
    size: number,
    face: PDFFont = font,
    color = INK,
  ) => {
    const value = safe(text);
    if (!value) return;
    page.drawText(value, { x, y, size, font: face, color });
  };

  drawMark(page, right - 36, y + 4);
  draw(input.clinicName || "Clinic", left, 12, bold);
  y -= 14;
  if (input.address?.trim()) {
    for (const line of wrap(input.address.trim(), font, 9, 420)) {
      draw(line, left, 9);
      y -= 12;
    }
  }
  if (input.phone?.trim()) {
    draw(`Tel : ${input.phone.trim()}`, left, 9);
    y -= 12;
  }
  if (input.email?.trim()) {
    draw(`Email : ${input.email.trim()}`, left, 9);
    y -= 12;
  }
  y -= 10;
  const title = "PHARMACY PRESCRIPTION";
  draw(title, left + (width - bold.widthOfTextAtSize(title, 13)) / 2, 13, bold);
  y -= 4;
  page.drawLine({
    start: { x: left + 145, y },
    end: { x: right - 145, y },
    thickness: 0.7,
    color: INK,
  });
  y -= 10;

  const facts: Array<[string, string, string, string]> = [
    ["Patient's Name:", input.patientName || "Patient", "Mobile No:", input.patientPhone || ""],
    ["Patient MRN:", input.mrn || "", "ID:", input.shortId || ""],
    ["Date of Birth:", input.dob || "", "Age / Gender:", input.ageGender || ""],
    ["Visit ID:", input.visitId || "", "Appointment:", input.appointment || ""],
    ["Doctor", input.doctorName || "", "", ""],
  ];
  const boxTop = y;
  y -= 16;
  for (const [a, av, b, bv] of facts) {
    ensure(16);
    draw(a, left + 8, 9, bold, TEAL);
    draw(av || "—", left + 108, 9);
    if (b) {
      draw(b, left + 280, 9, bold, TEAL);
      draw(bv || "—", left + 380, 9);
    }
    y -= 14;
  }
  const boxBottom = y;
  page.drawRectangle({
    x: left,
    y: boxBottom,
    width,
    height: boxTop - boxBottom,
    borderWidth: 1.2,
    borderColor: TEAL,
  });
  y = boxBottom - 16;

  const split = left + 300;
  const chiefTop = y;
  draw("CHIEF COMPLAINT", left, 9, bold);
  let yLeft = y - 12;
  const chief = `Primary Reason: ${input.chiefComplaint?.trim() || "No chief complaint recorded."}; Secondary Complaints: No secondary complaints provided`;
  for (const line of wrap(chief, font, 8, 280)) {
    page.drawText(safe(line), { x: left, y: yLeft, size: 8, font, color: INK });
    yLeft -= 10;
  }
  let yRight = chiefTop;
  const allergies = input.allergies?.length ? input.allergies : ["Allergy : No known allergy"];
  for (const line of allergies) {
    const wrapped = wrap(line, bold, 9, width - 300);
    wrapped.forEach((part, index) => {
      page.drawText(safe(part), {
        x: index === 0 ? split : split + 52,
        y: yRight,
        size: 9,
        font: bold,
        color: INK,
      });
      yRight -= 12;
    });
  }
  y = Math.min(yLeft, yRight) - 8;
  ensure(20);
  draw("Diagnosis", left, 10, bold);
  y -= 14;
  draw(input.diagnosis?.trim() || "—", left, 11, bold, TEAL);
  y -= 16;
  if (input.vitalLine?.trim()) {
    ensure(14);
    draw(input.vitalLine.trim(), left, 10, bold);
    y -= 16;
  }
  ensure(20);
  draw("Rx", left, 12, bold);
  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: INK });
  y -= 14;
  draw("Medicine Name", left, 10, bold);
  draw("Dosage", 280, 10, bold);
  draw("Duration", 450, 10, bold);
  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: INK });
  y -= 14;

  const pharmacy = pharmacyRows(input.medicines);
  if (!pharmacy.length) {
    draw("No medicines prescribed.", left, 9);
    y -= 14;
  }
  pharmacy.forEach((med, index) => {
    const nameLines = wrap(`${index + 1}) ${med.name}`, font, 9, 220);
    const dosageLines = [
      ...wrap(med.dosage, font, 9, 155),
      ...(med.instruction ? wrap(`(${med.instruction})`, font, 8, 155) : []),
    ];
    const rows = Math.max(nameLines.length, dosageLines.length, med.total ? 2 : 1);
    ensure(12 + rows * 11);
    for (let i = 0; i < rows; i += 1) {
      if (nameLines[i]) draw(nameLines[i], left, 9);
      if (dosageLines[i]) {
        draw(dosageLines[i], 280, dosageLines[i].startsWith("(") ? 8 : 9);
      }
      if (i === 0 && med.duration) draw(med.duration, 450, 9);
      if (i === 1 && med.total) draw(med.total, 450, 8);
      y -= 11;
    }
    if (med.strength) {
      ensure(11);
      draw(med.strength, left + 16, 8, font, MUTED);
      y -= 11;
    }
  });
  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: INK });
  y -= 16;
  ensure(20);
  draw("Advice:", left, 11, bold);
  y -= 14;
  const advice = adviceLines(input.remarks);
  const adviceRows = advice.length ? advice : [""];
  for (const line of adviceRows) {
    for (const wrapped of wrap(line, font, 9, width)) {
      ensure(12);
      draw(wrapped, left, 9);
      y -= 12;
    }
  }

  y -= 24;
  ensure(120);
  const cx = left + width / 2;
  const cy = y - 28;
  page.drawEllipse({
    x: cx,
    y: cy,
    xScale: 42,
    yScale: 42,
    borderWidth: 1.2,
    borderColor: TEAL,
  });
  const stampLines = [input.doctorName || "Doctor", input.qualification || "", input.license || ""].filter(
    Boolean,
  );
  let stampY = cy + (stampLines.length - 1) * 6;
  for (const line of stampLines) {
    const size = line === input.doctorName ? 8 : 7;
    const face = line === input.doctorName ? bold : font;
    const text = safe(line).slice(0, 28);
    page.drawText(text, {
      x: cx - face.widthOfTextAtSize(text, size) / 2,
      y: stampY,
      size,
      font: face,
      color: TEAL,
    });
    stampY -= 11;
  }
  y = cy - 56;
  ensure(20);
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: INK });
  y -= 14;
  draw(`Printed On : ${input.printed || ""}`, left, 9);

  return doc.save();
}
