import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type ConsultMedicine = {
  name?: string;
  amount?: string;
  times?: string[];
  strength?: string;
  route?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  duration?: string;
  durationUnit?: string;
  instruction?: string;
};

export type ConsultBooking = {
  id: string;
  tokenNumber?: number | null;
  disease?: string | null;
  notes?: string | null;
  doctorRemarks?: string | null;
  consultationType?: string | null;
  consultation_type?: string | null;
  slotStart?: string | Date | null;
  slot_start?: string | Date | null;
  slotEnd?: string | Date | null;
  slot_end?: string | Date | null;
  sessionDate?: string | Date | null;
  session_date?: string | Date | null;
  patientName?: string | null;
  patient_name?: string | null;
  patientPhone?: string | null;
  patient_phone?: string | null;
  medicines?: ConsultMedicine[] | null;
  clinicalAssessment?: unknown;
  practice?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
  location?: { name?: string; address?: string; city?: string } | null;
  provider?: {
    name?: string | null;
    licenseNo?: string | null;
    stampSrc?: string | null;
    description?: string | null;
  } | null;
  patient?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    gender?: string | null;
    address?: string | null;
    age?: number | null;
    dateOfBirth?: string | Date | null;
    mrn?: string | null;
    contactNumber?: string | null;
  } | null;
};

const TZ = "Asia/Kolkata";
const TEAL = rgb(0.05, 0.45, 0.52);
const INK = rgb(0.08, 0.1, 0.12);
const GREEN = rgb(0.05, 0.4, 0.22);
const MUTED = rgb(0.25, 0.3, 0.34);

type Chart = {
  values: Record<string, number | null>;
  recordedAt: string;
  noKnownAllergies: boolean;
  allergies: Array<{ category: string; name: string; severity: string }>;
  pain: Array<{
    scale: string;
    score: string;
    location: string;
    type: string;
    duration: string;
    frequency: string;
    radiation: string;
  }>;
};

function safe(text: string): string {
  return text
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function part(date: Date, type: Intl.DateTimeFormatPartTypes, options: Intl.DateTimeFormatOptions) {
  return (
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options })
      .formatToParts(date)
      .find((p) => p.type === type)?.value || ""
  );
}

function parseDate(iso?: string | Date | null): Date | null {
  if (!iso) return null;
  if (iso instanceof Date) return Number.isNaN(iso.getTime()) ? null : iso;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function slashDate(iso?: string | Date | null): string {
  if (!iso) return "";
  if (typeof iso === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(iso.trim())) {
    return iso.trim();
  }
  const date = parseDate(iso);
  if (!date) return typeof iso === "string" ? iso : "";
  return `${part(date, "day", { day: "2-digit" })}/${part(date, "month", { month: "2-digit" })}/${part(date, "year", { year: "numeric" })}`;
}

function longWhen(iso?: string | Date | null): string {
  const date = parseDate(iso);
  if (!date) return "";
  const day = part(date, "day", { day: "2-digit" });
  const month = part(date, "month", { month: "short" });
  const year = part(date, "year", { year: "numeric" });
  const hour = part(date, "hour", { hour: "numeric", hour12: true });
  const minute = part(date, "minute", { minute: "2-digit" });
  const dayPeriod = part(date, "dayPeriod", { hour: "numeric", hour12: true }).toUpperCase();
  return `${day} ${month} ${year} ${hour}:${minute} ${dayPeriod}`;
}

function clock(iso?: string | Date | null): string {
  const date = parseDate(iso);
  if (!date) return "";
  const hour = part(date, "hour", { hour: "numeric", hour12: true });
  const minute = part(date, "minute", { minute: "2-digit" });
  const dayPeriod = part(date, "dayPeriod", { hour: "numeric", hour12: true }).toUpperCase();
  return `${hour}:${minute} ${dayPeriod}`;
}

function printedStamp(date = new Date()): string {
  const day = part(date, "day", { day: "2-digit" });
  const month = part(date, "month", { month: "2-digit" });
  const year = part(date, "year", { year: "numeric" });
  const hour = part(date, "hour", { hour: "2-digit", hourCycle: "h23" });
  const minute = part(date, "minute", { minute: "2-digit" });
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

function ageYears(age?: number | null, dob?: string | Date | null): string {
  if (age != null && Number.isFinite(Number(age))) return String(age);
  const born = parseDate(dob);
  if (!born) return "";
  const now = new Date();
  let years = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) years -= 1;
  return years >= 0 ? String(years) : "";
}

function genderWord(gender?: string | null): string {
  const value = (gender || "").trim().toLowerCase();
  if (value.startsWith("m")) return "Male";
  if (value.startsWith("f")) return "Female";
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function withDoctor(name?: string | null): string {
  const value = (name || "").trim();
  if (!value) return "";
  return /^dr\.?\s/i.test(value) ? value : `Dr. ${value}`;
}

function chartOf(raw: unknown): Chart {
  const empty: Chart = {
    values: {},
    recordedAt: "",
    noKnownAllergies: false,
    allergies: [],
    pain: [],
  };
  if (!raw || typeof raw !== "object") return empty;
  const source = raw as {
    savedAt?: string;
    noKnownAllergies?: boolean;
    vitals?: { values?: Record<string, unknown>; recordedAt?: string };
    allergies?: Array<{ category?: string; name?: string; severity?: string }>;
    pain?: Array<Record<string, string>>;
  };
  const values: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(source.vitals?.values ?? {})) {
    const n = typeof value === "number" ? value : Number(value);
    values[key] = value == null || value === "" || !Number.isFinite(n) ? null : n;
  }
  return {
    values,
    recordedAt: source.savedAt || source.vitals?.recordedAt || "",
    noKnownAllergies: Boolean(source.noKnownAllergies),
    allergies: Array.isArray(source.allergies)
      ? source.allergies.map((row) => ({
          category: String(row?.category ?? "").trim(),
          name: String(row?.name ?? "").trim(),
          severity: String(row?.severity ?? "").trim(),
        }))
      : [],
    pain: Array.isArray(source.pain)
      ? source.pain.map((row) => ({
          scale: String(row?.scale ?? "").trim(),
          score: String(row?.score ?? "").trim(),
          location: String(row?.location ?? "").trim(),
          type: String(row?.type ?? "").trim(),
          duration: String(row?.duration ?? "").trim(),
          frequency: String(row?.frequency ?? "").trim(),
          radiation: String(row?.radiation ?? "").trim(),
        }))
      : [],
  };
}

function cell(values: Record<string, number | null>, key: string): string {
  const value = values[key];
  return value == null || !Number.isFinite(value) ? "N/A" : String(value);
}

function bpCell(values: Record<string, number | null>): string {
  const sys = values.bp_sys;
  const dia = values.bp_dia;
  if (sys == null && dia == null) return "N/A";
  return `${sys ?? "N/A"}/${dia ?? "N/A"}`;
}

function interpretation(values: Record<string, number | null>): string {
  const any = Object.values(values).some((n) => n != null && Number.isFinite(n));
  if (!any) return "—";
  const spo2 = values.spo2;
  const temp = values.temp;
  const sys = values.bp_sys;
  const pr = values.pr;
  const rr = values.rr;
  const critical =
    (spo2 != null && spo2 < 90) ||
    (temp != null && (temp >= 39 || temp < 35)) ||
    (sys != null && (sys >= 180 || sys < 80)) ||
    (pr != null && (pr >= 130 || pr < 40)) ||
    (rr != null && (rr >= 30 || rr < 8));
  if (critical) return "Critical";
  const abnormal =
    (spo2 != null && spo2 < 95) ||
    (temp != null && (temp >= 37.5 || temp < 36)) ||
    (sys != null && (sys >= 140 || sys < 90)) ||
    (pr != null && (pr > 100 || pr < 50)) ||
    (rr != null && (rr > 20 || rr < 12));
  return abnormal ? "Abnormal" : "Normal";
}

const MAIN_VITALS = new Set([
  "ht",
  "wt",
  "bmi",
  "temp",
  "bp_sys",
  "bp_dia",
  "rr",
  "spo2",
  "hc",
  "pr",
]);

function extraVitals(values: Record<string, number | null>): string {
  const bits = Object.entries(values)
    .filter(([key, value]) => !MAIN_VITALS.has(key) && value != null)
    .map(([key, value]) => `${key} ${value}`);
  return bits.join(", ");
}

function allergyText(chart: Chart): string {
  const rows = chart.allergies.filter((row) => row.name || row.category);
  if (chart.noKnownAllergies || rows.length === 0) {
    return "No known allergy: No known allergy (Severity: Not Available)";
  }
  return rows
    .map((row) => {
      const who = [row.category, row.name].filter(Boolean).join(": ");
      const severity = row.severity || "Not Available";
      return `${who || "Allergy"} (Severity: ${severity})`;
    })
    .join("; ");
}

function painText(chart: Chart): string {
  const rows = chart.pain.filter(
    (row) => row.scale || row.score || row.location || row.type || row.duration || row.frequency || row.radiation,
  );
  if (!rows.length) return "No Pain Complaints Recorded";
  return rows
    .map((row) =>
      [
        row.scale,
        row.score ? `Score ${row.score}` : "",
        row.location ? `Location: ${row.location}` : "",
        row.type ? `Type: ${row.type}` : "",
        row.duration ? `Duration: ${row.duration}` : "",
        row.frequency ? `Frequency: ${row.frequency}` : "",
        row.radiation ? `Radiation: ${row.radiation}` : "",
      ]
        .filter(Boolean)
        .join(", "),
    )
    .join("; ");
}

function medicineRows(medicines: ConsultMedicine[] | null | undefined) {
  return (medicines ?? [])
    .filter((med) => med?.name?.trim())
    .map((med) => {
      const dosage = [
        med.dose?.trim() || med.amount?.trim() || "",
        med.doseUnit?.trim() || "",
        med.frequency?.trim() || (med.times?.length ? med.times.join(", ") : ""),
        med.instruction?.trim() ? `(${med.instruction.trim()})` : "",
      ]
        .filter(Boolean)
        .join(" ");
      return {
        name: med.name!.trim(),
        strength: med.strength?.trim() || "",
        dosage,
        duration: [med.duration?.trim(), med.durationUnit?.trim()].filter(Boolean).join(" "),
      };
    });
}

function realLabel(value?: string | null): string {
  const text = (value || "").trim();
  if (!text || /^general\s+consultation$/i.test(text)) return "";
  return text;
}

export function consultationModel(booking: ConsultBooking) {
  const patient = booking.patient;
  const chart = chartOf(booking.clinicalAssessment);
  const start = booking.slotStart || booking.slot_start || booking.sessionDate || booking.session_date;
  const end = booking.slotEnd || booking.slot_end;
  const startLabel = longWhen(start);
  const endClock = clock(end);
  const appointment = startLabel
    ? endClock
      ? `${startLabel} - ${endClock}`
      : startLabel
    : "";
  const chief = realLabel(booking.disease);
  const enteredDiagnosis =
    booking.clinicalAssessment && typeof booking.clinicalAssessment === "object"
      ? String((booking.clinicalAssessment as { diagnosis?: string }).diagnosis || "")
      : "";
  const diagnosis =
    realLabel(enteredDiagnosis) ||
    realLabel(booking.consultationType || booking.consultation_type);
  const remarks = [booking.doctorRemarks, booking.notes]
    .map((line) => (line || "").trim())
    .filter((line, index, all) => line && all.indexOf(line) === index)
    .join("\n\n");
  const address = [booking.location?.address, booking.location?.city].filter(Boolean).join(", ");
  const doctor = withDoctor(booking.provider?.name);
  const qualification = (booking.provider?.description || "").trim().split("\n")[0] || "";
  return {
    clinic: booking.practice?.name?.trim() || "Clinic",
    address: address || booking.location?.name || "",
    tel: booking.practice?.phone?.trim() || "",
    email: booking.practice?.email?.trim() || "",
    patientName: patient?.name || booking.patientName || booking.patient_name || "Patient",
    mobile: patient?.contactNumber || patient?.phone || booking.patientPhone || booking.patient_phone || "",
    mrn: patient?.mrn?.trim() || "",
    shortId:
      booking.tokenNumber != null
        ? String(booking.tokenNumber)
        : (patient?.id || booking.id).replace(/-/g, "").slice(0, 8).toUpperCase(),
    dob: slashDate(patient?.dateOfBirth),
    ageGender: [ageYears(patient?.age, patient?.dateOfBirth), genderWord(patient?.gender)]
      .filter(Boolean)
      .join(" / "),
    visitId: booking.id,
    appointment,
    doctor,
    license: booking.provider?.licenseNo?.trim() || "",
    qualification,
    stampSrc: booking.provider?.stampSrc?.trim() || "",
    chief: chief || "No chief complaint recorded.",
    secondary: "No secondary complaints provided",
    interpretation: interpretation(chart.values),
    recordedAt: longWhen(chart.recordedAt || start || ""),
    vitals: [
      cell(chart.values, "ht"),
      cell(chart.values, "wt"),
      cell(chart.values, "bmi"),
      cell(chart.values, "temp"),
      bpCell(chart.values),
      cell(chart.values, "rr"),
      cell(chart.values, "spo2"),
      cell(chart.values, "hc"),
      cell(chart.values, "pr"),
    ],
    extraVitals: extraVitals(chart.values),
    allergies: allergyText(chart),
    pain: painText(chart),
    diagnosis,
    remarks,
    medicines: medicineRows(booking.medicines),
    printed: printedStamp(),
  };
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
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

async function embedStamp(doc: PDFDocument, url: string) {
  if (!/^https?:/i.test(url)) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes);
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes);
  } catch {
    return null;
  }
  return null;
}

export async function buildConsultationPdf(booking: ConsultBooking): Promise<Uint8Array> {
  const model = consultationModel(booking);
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
    target: PDFPage = page,
  ) => {
    const value = safe(text);
    if (!value) return;
    target.drawText(value, { x, y, size, font: face, color });
  };

  draw(model.clinic, left, 12, bold);
  y -= 14;
  if (model.address) {
    for (const line of wrap(model.address, font, 9, 360)) {
      draw(line, left, 9);
      y -= 12;
    }
  }
  if (model.tel) {
    draw(`Tel : ${model.tel}`, left, 9);
    y -= 12;
  }
  if (model.email) {
    draw(`Email : ${model.email}`, left, 9);
    y -= 12;
  }
  y -= 8;
  const title = "CLINIC VISIT REPORT";
  draw(title, left + (width - bold.widthOfTextAtSize(title, 13)) / 2, 13, bold);
  y -= 4;
  page.drawLine({
    start: { x: left + 150, y },
    end: { x: right - 150, y },
    thickness: 0.6,
    color: INK,
  });
  y -= 10;

  const facts: Array<[string, string, string, string]> = [
    ["Patient's Name:", model.patientName, "Mobile No:", model.mobile],
    ["Patient MRN:", model.mrn, "ID:", model.shortId],
    ["Date of Birth:", model.dob, "Age / Gender:", model.ageGender],
    ["Visit ID:", model.visitId, "Appointment:", model.appointment],
    ["Doctor", model.doctor, "", ""],
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
  y = boxBottom - 18;

  const heading = (label: string) => {
    ensure(28);
    draw(label, left, 10, bold);
    y -= 14;
  };
  const paragraph = (text: string, color = INK) => {
    for (const block of text.split("\n")) {
      for (const line of wrap(block || " ", font, 9, width)) {
        ensure(12);
        draw(line, left, 9, font, color);
        y -= 12;
      }
    }
  };

  heading("CHIEF COMPLAINT");
  paragraph(`Primary Reason: ${model.chief}`);
  paragraph(`Secondary Complaints: ${model.secondary}`);
  y -= 8;

  heading("VITAL SIGNS");
  paragraph(`Result Interpretation: ${model.interpretation}`);
  y -= 4;
  ensure(36);
  const cols = [78, 40, 40, 36, 46, 52, 48, 46, 40, 42];
  const heads = ["Date/Time", "Ht (cm)", "Wt (kg)", "BMI", "Temp", "BP", "Resp", "SpO2", "HC", "PR"];
  const values = [model.recordedAt || "—", ...model.vitals];
  let x = left;
  heads.forEach((label, index) => {
    draw(label, x, 7, bold);
    x += cols[index];
  });
  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: MUTED });
  y -= 12;
  x = left;
  values.forEach((value, index) => {
    const lines = wrap(value, font, 7, cols[index] - 4);
    draw(lines[0] || "N/A", x, 7);
    x += cols[index];
  });
  y -= 8;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: MUTED });
  y -= 14;
  paragraph(`Additional Vitals: ${model.extraVitals || "—"}`);
  y -= 8;

  heading("ALLERGIES");
  paragraph(model.allergies);
  y -= 8;
  heading("PAIN COMPLAINTS");
  paragraph(model.pain);
  y -= 8;
  heading("DIAGNOSIS");
  paragraph(model.diagnosis || "—", GREEN);
  y -= 8;

  heading("Doctor Notes:");
  const remarkLines = model.remarks
    ? model.remarks.split("\n").flatMap((block) => wrap(block || " ", font, 9, width - 16))
    : ["No doctor notes recorded."];
  const boxHeight = Math.max(48, remarkLines.length * 12 + 12);
  ensure(boxHeight + 8);
  const remarksTop = y;
  page.drawRectangle({
    x: left,
    y: remarksTop - boxHeight,
    width,
    height: boxHeight,
    borderWidth: 0.8,
    borderColor: MUTED,
  });
  y -= 14;
  for (const line of remarkLines) {
    draw(line, left + 8, 9);
    y -= 12;
  }
  y = remarksTop - boxHeight - 16;

  heading("PRESCRIPTION");
  draw("Rx", left, 11, bold);
  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: INK });
  y -= 13;
  draw("Medicine Name", left, 9, bold);
  draw("Dosage", 300, 9, bold);
  draw("Duration", 450, 9, bold);
  y -= 4;
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: INK });
  y -= 13;
  const meds = model.medicines.length ? model.medicines : [];
  if (!meds.length) {
    paragraph("No medicines prescribed.");
  }
  meds.forEach((med, index) => {
    const nameLines = wrap(`${index + 1}) ${med.name}`, font, 9, 240);
    ensure(14 + nameLines.length * 11);
    nameLines.forEach((line, lineIndex) => {
      draw(line, left, 9);
      if (lineIndex === 0) {
        draw(med.dosage, 300, 8);
        draw(med.duration, 450, 8);
      }
      y -= 11;
    });
    if (med.strength) {
      ensure(11);
      draw(med.strength, left + 14, 8, font, MUTED);
      y -= 11;
    }
  });

  y -= 18;
  ensure(110);
  const stamp = await embedStamp(doc, model.stampSrc);
  if (stamp) {
    const box = 84;
    page.drawImage(stamp, { x: left, y: y - box, width: box, height: box });
    y -= box + 16;
  } else {
    const cx = left + 70;
    const cy = y - 36;
    page.drawEllipse({
      x: cx,
      y: cy,
      xScale: 46,
      yScale: 46,
      borderWidth: 1.2,
      borderColor: TEAL,
    });
    const stampLines = [model.doctor || "Doctor", model.qualification, model.license].filter(Boolean);
    let stampY = cy + (stampLines.length - 1) * 6;
    for (const line of stampLines) {
      const size = line === model.doctor ? 8 : 7;
      const face = line === model.doctor ? bold : font;
      const text = safe(line).slice(0, 28);
      const tw = face.widthOfTextAtSize(text, size);
      page.drawText(text, {
        x: cx - tw / 2,
        y: stampY,
        size,
        font: face,
        color: TEAL,
      });
      stampY -= 11;
    }
    y = cy - 58;
  }
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: INK });
  y -= 14;
  draw(`Printed On : ${model.printed}`, left, 9);

  return doc.save();
}

export function consultationFileName(patientName?: string, bookingId?: string): string {
  const slug = safe(patientName || "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const idPart = bookingId ? `-${bookingId.slice(0, 8)}` : "";
  return `Consultation-${slug || "patient"}${idPart}.pdf`;
}

