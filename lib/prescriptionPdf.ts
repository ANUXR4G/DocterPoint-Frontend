import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

export type RxMedicine = {
  name?: string
  amount?: string
  times?: string[]
  strength?: string
  route?: string
  dose?: string
  doseUnit?: string
  frequency?: string
  duration?: string
  durationUnit?: string
  instruction?: string
}

export type RxBooking = {
  id: string
  tokenNumber?: number | null
  disease?: string | null
  doctorRemarks?: string | null
  slotStart?: string | null
  slot_start?: string | null
  sessionDate?: string | null
  session_date?: string | null
  patientName?: string | null
  patient_name?: string | null
  patientPhone?: string | null
  patient_phone?: string | null
  medicines?: RxMedicine[] | null
  clinicalAssessment?: unknown
  practice?: { name?: string | null } | null
  location?: { name?: string; address?: string; city?: string } | null
  patient?: {
    name?: string | null
    email?: string | null
    phone?: string | null
    gender?: string | null
    address?: string | null
    age?: number | null
    dateOfBirth?: string | null
    mrn?: string | null
    contactNumber?: string | null
  } | null
}

const TZ = "Asia/Kolkata"

function part(date: Date, type: Intl.DateTimeFormatPartTypes, options: Intl.DateTimeFormatOptions) {
  return (
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options })
      .formatToParts(date)
      .find((p) => p.type === type)?.value || ""
  )
}

function rxDate(iso?: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const day = part(date, "day", { day: "2-digit" })
  const month = part(date, "month", { month: "short" })
  const year = part(date, "year", { year: "numeric" })
  return `${day}-${month}-${year}`
}

function printedStamp(date = new Date()): string {
  const day = part(date, "day", { day: "2-digit" })
  const month = part(date, "month", { month: "2-digit" })
  const year = part(date, "year", { year: "numeric" })
  const hour = part(date, "hour", { hour: "2-digit", hourCycle: "h23" })
  const minute = part(date, "minute", { minute: "2-digit" })
  return `${day}/${month}/${year} : ${hour}:${minute}`
}

function ageYears(age?: number | null, dob?: string | null): string {
  if (age != null && Number.isFinite(Number(age))) return String(age)
  if (!dob) return ""
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return ""
  const now = new Date()
  let years = now.getFullYear() - born.getFullYear()
  const month = now.getMonth() - born.getMonth()
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) years -= 1
  return years >= 0 ? String(years) : ""
}

function genderMark(gender?: string | null): string {
  const value = (gender || "").trim().toLowerCase()
  if (value.startsWith("m")) return "M"
  if (value.startsWith("f")) return "F"
  return value ? value.slice(0, 1).toUpperCase() : ""
}

function bullets(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[\s*#-]+/, "").trim())
    .filter(Boolean)
    .map((line) => `* ${line}`)
}

function chartOf(raw: unknown): {
  values: Record<string, number | null>
  noKnownAllergies: boolean
  allergies: Array<{ category: string; name: string }>
} | null {
  if (!raw || typeof raw !== "object") return null
  const source = raw as {
    noKnownAllergies?: boolean
    vitals?: { values?: Record<string, unknown> }
    allergies?: Array<{ category?: string; name?: string }>
  }
  const values: Record<string, number | null> = {}
  for (const [key, value] of Object.entries(source.vitals?.values ?? {})) {
    const n = typeof value === "number" ? value : Number(value)
    values[key] = value == null || value === "" || !Number.isFinite(n) ? null : n
  }
  const allergies = Array.isArray(source.allergies)
    ? source.allergies.map((row) => ({
        category: String(row?.category ?? "").trim(),
        name: String(row?.name ?? "").trim(),
      }))
    : []
  return {
    values,
    noKnownAllergies: Boolean(source.noKnownAllergies),
    allergies,
  }
}

function allergyLines(raw: unknown): string[] {
  const assessment = chartOf(raw)
  const rows = (assessment?.allergies ?? []).filter((row) => row.name || row.category)
  if (assessment?.noKnownAllergies && rows.length === 0) return ["* No known allergy"]
  const lines: string[] = []
  const seen = new Map<string, string[]>()
  for (const row of rows) {
    const category = row.category || "Other"
    const list = seen.get(category) ?? []
    if (row.name) list.push(row.name)
    seen.set(category, list)
  }
  for (const [category, names] of seen) {
    const label = /allergy/i.test(category) ? category : `${category} Allergy`
    lines.push(`* ${label}`)
    if (names.length) lines.push(`# ${names.join(", ")}`)
  }
  return lines
}

function vitalLine(raw: unknown): string {
  const values = chartOf(raw)?.values ?? {}
  const num = (key: string) => {
    const value = values[key]
    return value == null || !Number.isFinite(value) ? "" : String(value)
  }
  const bmi = num("bmi")
  const sys = num("bp_sys")
  const dia = num("bp_dia")
  const bp = sys || dia ? `${sys || "—"}/${dia || "—"} mmHg` : ""
  return [
    `Weight (Kg): ${num("wt")}`,
    `Height (Cm): ${num("ht")}${bmi ? ` (B.M.I. = ${Number(bmi).toFixed(2)})` : ""}`,
    `BP: ${bp}`,
  ].join(", ")
}

function medicineRows(medicines: RxMedicine[] | null | undefined) {
  return (medicines ?? [])
    .filter((med) => med?.name?.trim())
    .map((med) => {
      const dosage = [
        med.dose?.trim() || med.amount?.trim() || "",
        med.doseUnit?.trim() || "",
        med.frequency?.trim() || (med.times?.length ? med.times.join(", ") : ""),
      ]
        .filter(Boolean)
        .join(" ")
      const note = med.instruction?.trim()
      const duration = [med.duration?.trim(), med.durationUnit?.trim()].filter(Boolean).join(" ")
      return {
        name: med.name!.trim(),
        strength: med.strength?.trim() || "",
        dosage: note ? `${dosage}${dosage ? " " : ""}(${note})` : dosage,
        duration,
      }
    })
}

export function prescriptionModel(booking: RxBooking) {
  const patient = booking.patient
  const name = (patient?.name || booking.patientName || booking.patient_name || "Patient").toUpperCase()
  const gender = genderMark(patient?.gender)
  const age = ageYears(patient?.age, patient?.dateOfBirth)
  const who = [gender ? `(${gender})` : "", age ? `/ ${age} Y` : ""].filter(Boolean).join(" ")
  const mrn = patient?.mrn?.trim() || ""
  const token = booking.tokenNumber != null ? String(booking.tokenNumber) : ""
  const id = [token, mrn].filter(Boolean).join(" - ") || booking.id.slice(0, 8).toUpperCase()
  const when = booking.slotStart || booking.slot_start || booking.sessionDate || booking.session_date
  const address = [booking.location?.address, booking.location?.city].filter(Boolean).join(", ")
  const clinic = booking.practice?.name?.trim() || "Clinic"
  const chief = (booking.disease || "").trim()
  const chiefLines =
    chief && !/^general\s+consultation$/i.test(chief) ? bullets(chief) : []
  return {
    clinic,
    address: address || booking.location?.name || "",
    id,
    date: rxDate(when),
    nameLine: who ? `${name} ${who}` : name,
    phone: patient?.contactNumber || patient?.phone || booking.patientPhone || booking.patient_phone || "",
    email: patient?.email || "",
    patientAddress: patient?.address || "",
    vitals: vitalLine(booking.clinicalAssessment),
    complaints: chiefLines,
    allergies: allergyLines(booking.clinicalAssessment),
    advice: bullets(booking.doctorRemarks || ""),
    medicines: medicineRows(booking.medicines),
    printed: printedStamp(),
  }
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return [""]
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(next, size) > width && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines
}

export async function buildPrescriptionPdf(booking: RxBooking): Promise<Uint8Array> {
  const model = prescriptionModel(booking)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0, 0, 0)
  let page = doc.addPage([595.28, 841.89])
  let y = 800
  const left = 36
  const right = 559
  const width = right - left

  const ensure = (need: number) => {
    if (y - need > 48) return
    page = doc.addPage([595.28, 841.89])
    y = 800
  }

  const draw = (
    text: string,
    x: number,
    size: number,
    face: PDFFont = font,
    target: PDFPage = page,
  ) => {
    target.drawText(text, { x, y, size, font: face, color: ink })
  }

  draw("Logo", left, 11, bold)
  const title = model.clinic
  const titleSize = 13
  draw(title, left + (width - bold.widthOfTextAtSize(title, titleSize)) / 2, titleSize, bold)
  y -= 16
  if (model.address) {
    const addr = model.address
    draw(addr, left + (width - font.widthOfTextAtSize(addr, 10)) / 2, 10)
    y -= 14
  }
  y -= 6
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: ink })
  y -= 18
  draw(`ID: ${model.id}`, left, 10, bold)
  const dateLabel = `Date: ${model.date}`
  draw(dateLabel, right - bold.widthOfTextAtSize(dateLabel, 10), 10, bold)
  y -= 16
  draw(`Name : ${model.nameLine}`, left, 10, bold)
  const mob = `Mob. No.: ${model.phone}`
  draw(mob, 330, 10, bold)
  y -= 14
  draw(`Address: ${model.patientAddress}`, left, 10, bold)
  const email = `Email : ${model.email}`
  draw(email, 330, 10, bold)
  y -= 16
  for (const line of wrap(model.vitals, font, 10, width)) {
    ensure(14)
    draw(line, left, 10)
    y -= 13
  }
  y -= 6
  ensure(80)
  const mid = left + width / 2
  const boxTop = y
  draw("Chief Complaints", left + 6, 10, bold)
  draw("Allergy", mid + 6, 10, bold)
  y -= 4
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: ink })
  y -= 14
  const complaintDrawn = model.complaints.length ? model.complaints : [""]
  const allergyDrawn = model.allergies.length ? model.allergies : [""]
  const rows = Math.max(complaintDrawn.length, allergyDrawn.length)
  for (let i = 0; i < rows; i += 1) {
    ensure(14)
    if (complaintDrawn[i]) draw(complaintDrawn[i], left + 6, 9)
    if (allergyDrawn[i]) draw(allergyDrawn[i], mid + 6, 9)
    y -= 12
  }
  const boxBottom = y - 4
  page.drawRectangle({
    x: left,
    y: boxBottom,
    width,
    height: boxTop + 12 - boxBottom,
    borderWidth: 0.6,
    borderColor: ink,
  })
  page.drawLine({
    start: { x: mid, y: boxTop + 12 },
    end: { x: mid, y: boxBottom },
    thickness: 0.6,
    color: ink,
  })
  y = boxBottom - 18
  ensure(20)
  draw("Diagnosis:", left, 11, bold)
  y -= 16
  ensure(20)
  draw("Rx", left, 12, bold)
  y -= 6
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: ink })
  y -= 14
  draw("Medicine Name", left, 10, bold)
  draw("Dosage", 310, 10, bold)
  draw("Duration", 450, 10, bold)
  y -= 4
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: ink })
  y -= 14
  const meds = model.medicines.length
    ? model.medicines
    : [{ name: "", strength: "", dosage: "", duration: "" }]
  meds.forEach((med, index) => {
    const nameLines = med.name ? wrap(`${index + 1}) ${med.name}`, font, 9, 250) : [""]
    ensure(16 + nameLines.length * 12)
    nameLines.forEach((line, lineIndex) => {
      draw(line, left, 9)
      if (lineIndex === 0) {
        draw(med.dosage, 310, 9)
        draw(med.duration, 450, 9)
      }
      y -= 12
    })
    if (med.strength) {
      ensure(12)
      draw(med.strength, left + 16, 8)
      y -= 11
    }
  })
  y -= 8
  ensure(20)
  draw("Advice:", left, 11, bold)
  y -= 14
  const advice = model.advice.length ? model.advice : [""]
  for (const line of advice) {
    for (const wrapped of wrap(line, font, 9, width)) {
      ensure(12)
      draw(wrapped, left, 9)
      y -= 12
    }
  }
  y -= 10
  ensure(24)
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: ink })
  y -= 14
  draw(`Printed on : ${model.printed}`, left, 9)

  return doc.save()
}

export function prescriptionFileName(booking: { id: string }): string {
  return `prescription-${booking.id.slice(0, 8)}.pdf`
}

export function prescriptionBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new Blob([copy], { type: "application/pdf" })
}
