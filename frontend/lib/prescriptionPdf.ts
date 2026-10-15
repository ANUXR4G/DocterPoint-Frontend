import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"
import { consultationModel, type ConsultBooking } from "./consultationPdf"

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

export type RxBooking = ConsultBooking & {
  medicines?: RxMedicine[] | null
}

const INK = rgb(0.08, 0.1, 0.12)
const TEAL = rgb(0.05, 0.45, 0.52)
const BLUE = rgb(0.2, 0.45, 0.78)
const MUTED = rgb(0.25, 0.3, 0.34)

function safe(text: string): string {
  return text
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "")
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/).filter(Boolean)
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

function doseUnits(text: string): number {
  const matches = text.matchAll(
    /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?)\s*(morning|night|afternoon|aft|eve|noon|bedtime|bed)/gi,
  )
  let total = 0
  for (const match of matches) {
    const raw = match[1].replace(/\s/g, "")
    const [top, bottom] = raw.split("/")
    const value = bottom ? Number(top) / Number(bottom) : Number(top)
    if (Number.isFinite(value)) total += value
  }
  if (total > 0) return total
  if (/\bqid\b/i.test(text)) return 4
  if (/\btid\b/i.test(text)) return 3
  if (/\bbd\b/i.test(text)) return 2
  if (/\bod\b/i.test(text)) return 1
  return 0
}

function durationDays(duration?: string, unit?: string): number {
  const count = Number(duration)
  if (!Number.isFinite(count) || count <= 0) return 0
  const label = (unit || "day").toLowerCase()
  if (label.startsWith("week")) return count * 7
  if (label.startsWith("month")) return count * 30
  if (label.startsWith("hour")) return 0
  return count
}

function formLabel(name: string): string {
  if (/^cap/i.test(name)) return "Cap"
  if (/syrup|syp\b/i.test(name)) return "Dose"
  return "Tab"
}

function allergyGroups(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return ["Allergy : No known allergy"]
  const source = raw as {
    noKnownAllergies?: boolean
    allergies?: Array<{ category?: string; name?: string }>
  }
  const grouped = new Map<string, string[]>()
  for (const row of source.allergies ?? []) {
    const name = String(row?.name ?? "").trim()
    const category = String(row?.category ?? "").trim() || "Other"
    if (!name && !category) continue
    if (/no known/i.test(name)) continue
    const list = grouped.get(category) ?? []
    if (name) list.push(name)
    grouped.set(category, list)
  }
  if (source.noKnownAllergies || grouped.size === 0) return ["Allergy : No known allergy"]
  const lines: string[] = []
  let first = true
  for (const [category, names] of grouped) {
    const body = names.length ? `${category} : ${names.join(", ")}` : category
    lines.push(first ? `Allergy : ${body}` : body)
    first = false
  }
  return lines
}

function pharmacyRows(medicines: RxMedicine[] | null | undefined) {
  return (medicines ?? [])
    .filter((med) => med?.name?.trim())
    .map((med) => {
      const how = [
        med.dose?.trim() || med.amount?.trim() || "",
        med.doseUnit?.trim() || "",
        med.frequency?.trim() || (med.times?.length ? med.times.join(", ") : ""),
      ]
        .filter(Boolean)
        .join(" ")
      const days = durationDays(med.duration, med.durationUnit)
      const perDay = doseUnits(`${how} ${(med.times ?? []).join(" ")}`)
      const total =
        perDay > 0 && days > 0
          ? `(Tot:${Math.round(perDay * days)} ${formLabel(med.name!.trim())})`
          : ""
      return {
        name: med.name!.trim(),
        strength: med.strength?.trim() || "",
        dosage: how,
        instruction: med.instruction?.trim() || "",
        duration: [med.duration?.trim(), med.durationUnit?.trim()].filter(Boolean).join(" "),
        total,
      }
    })
}

function adviceLines(text?: string | null): string[] {
  const lines = (text || "")
    .split(/\n+/)
    .map((line) => line.replace(/^[\s*#-]+/, "").trim())
    .filter(Boolean)
  return lines.map((line) => `* ${line}`)
}

function shown(value: string): string {
  return !value || value === "N/A" ? "" : value
}

export function prescriptionModel(booking: RxBooking) {
  const visit = consultationModel(booking)
  const temp = shown(visit.vitals[3])
  const bp = shown(visit.vitals[4])
  const weight = shown(visit.vitals[1])
  const vitals = [
    temp ? `Temp (deg): ${temp}` : "",
    bp ? `BP: ${bp} mmHg` : "",
    weight ? `Wt: ${weight}kg` : "",
  ]
    .filter(Boolean)
    .join(", ")
  return {
    ...visit,
    chiefLine: `Primary Reason: ${visit.chief}; Secondary Complaints: ${visit.secondary}`,
    allergyLines: allergyGroups(booking.clinicalAssessment),
    vitalLine: vitals,
    pharmacy: pharmacyRows(booking.medicines),
    advice: adviceLines(booking.doctorRemarks),
  }
}

async function embedStamp(doc: PDFDocument, url: string) {
  if (!/^https?:/i.test(url)) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const bytes = new Uint8Array(await res.arrayBuffer())
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return doc.embedPng(bytes)
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return doc.embedJpg(bytes)
  } catch {
    return null
  }
  return null
}

function drawMark(page: PDFPage, x: number, top: number) {
  const size = 36
  page.drawRectangle({
    x,
    y: top - size,
    width: size,
    height: size,
    borderWidth: 1,
    borderColor: BLUE,
    color: rgb(0.93, 0.97, 1),
  })
  const midX = x + size / 2
  const midY = top - size / 2
  page.drawLine({
    start: { x: midX, y: top - 7 },
    end: { x: midX, y: top - size + 7 },
    thickness: 5,
    color: BLUE,
  })
  page.drawLine({
    start: { x: x + 7, y: midY },
    end: { x: x + size - 7, y: midY },
    thickness: 5,
    color: BLUE,
  })
}

export async function buildPrescriptionPdf(booking: RxBooking): Promise<Uint8Array> {
  const model = prescriptionModel(booking)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage([595.28, 841.89])
  let y = 800
  const left = 36
  const right = 559
  const width = right - left

  const ensure = (need: number) => {
    if (y - need > 46) return
    page = doc.addPage([595.28, 841.89])
    y = 800
  }
  const draw = (
    text: string,
    x: number,
    size: number,
    face: PDFFont = font,
    color = INK,
  ) => {
    const value = safe(text)
    if (!value) return
    page.drawText(value, { x, y, size, font: face, color })
  }

  drawMark(page, right - 36, y + 4)
  draw(model.clinic, left, 12, bold)
  y -= 14
  if (model.address) {
    for (const line of wrap(model.address, font, 9, 420)) {
      draw(line, left, 9)
      y -= 12
    }
  }
  if (model.tel) {
    draw(`Tel : ${model.tel}`, left, 9)
    y -= 12
  }
  if (model.email) {
    draw(`Email : ${model.email}`, left, 9)
    y -= 12
  }
  y -= 10
  const title = "PHARMACY PRESCRIPTION"
  draw(title, left + (width - bold.widthOfTextAtSize(title, 13)) / 2, 13, bold)
  y -= 4
  page.drawLine({
    start: { x: left + 145, y },
    end: { x: right - 145, y },
    thickness: 0.7,
    color: INK,
  })
  y -= 10

  const facts: Array<[string, string, string, string]> = [
    ["Patient's Name:", model.patientName, "Mobile No:", model.mobile],
    ["Patient MRN:", model.mrn, "ID:", model.shortId],
    ["Date of Birth:", model.dob, "Age / Gender:", model.ageGender],
    ["Visit ID:", model.visitId, "Appointment:", model.appointment],
    ["Doctor", model.doctor, "", ""],
  ]
  const boxTop = y
  y -= 16
  for (const [a, av, b, bv] of facts) {
    ensure(16)
    draw(a, left + 8, 9, bold, TEAL)
    draw(av || "—", left + 108, 9)
    if (b) {
      draw(b, left + 280, 9, bold, TEAL)
      draw(bv || "—", left + 380, 9)
    }
    y -= 14
  }
  const boxBottom = y
  page.drawRectangle({
    x: left,
    y: boxBottom,
    width,
    height: boxTop - boxBottom,
    borderWidth: 1.2,
    borderColor: TEAL,
  })
  y = boxBottom - 16

  const split = left + 300
  const chiefTop = y
  draw("CHIEF COMPLAINT", left, 9, bold)
  let yLeft = y - 12
  for (const line of wrap(model.chiefLine, font, 8, 280)) {
    page.drawText(safe(line), { x: left, y: yLeft, size: 8, font, color: INK })
    yLeft -= 10
  }
  let yRight = chiefTop
  for (const line of model.allergyLines) {
    const wrapped = wrap(line, bold, 9, width - 300)
    wrapped.forEach((part, index) => {
      page.drawText(safe(part), {
        x: index === 0 ? split : split + 52,
        y: yRight,
        size: 9,
        font: bold,
        color: INK,
      })
      yRight -= 12
    })
  }
  y = Math.min(yLeft, yRight) - 8
  ensure(20)
  draw("Diagnosis", left, 10, bold)
  y -= 14
  draw(model.diagnosis || "—", left, 11, bold, TEAL)
  y -= 16
  if (model.vitalLine) {
    ensure(14)
    draw(model.vitalLine, left, 10, bold)
    y -= 16
  }
  ensure(20)
  draw("Rx", left, 12, bold)
  y -= 4
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: INK })
  y -= 14
  draw("Medicine Name", left, 10, bold)
  draw("Dosage", 280, 10, bold)
  draw("Duration", 450, 10, bold)
  y -= 4
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.4, color: INK })
  y -= 14

  if (!model.pharmacy.length) {
    draw("No medicines prescribed.", left, 9)
    y -= 14
  }
  model.pharmacy.forEach((med, index) => {
    const nameLines = wrap(`${index + 1}) ${med.name}`, font, 9, 220)
    const dosageLines = [
      ...wrap(med.dosage, font, 9, 155),
      ...(med.instruction ? wrap(`(${med.instruction})`, font, 8, 155) : []),
    ]
    const rows = Math.max(nameLines.length, dosageLines.length, med.total ? 2 : 1)
    ensure(12 + rows * 11)
    for (let i = 0; i < rows; i += 1) {
      if (nameLines[i]) draw(nameLines[i], left, 9)
      if (dosageLines[i]) draw(dosageLines[i], 280, i === 0 || !dosageLines[i].startsWith("(") ? 9 : 8)
      if (i === 0 && med.duration) draw(med.duration, 450, 9)
      if (i === 1 && med.total) draw(med.total, 450, 8)
      y -= 11
    }
    if (med.strength) {
      ensure(11)
      draw(med.strength, left + 16, 8, font, MUTED)
      y -= 11
    }
  })
  y -= 4
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.8, color: INK })
  y -= 16
  ensure(20)
  draw("Advice Given:", left, 11, bold)
  y -= 14
  const advice = model.advice.length ? model.advice : [""]
  for (const line of advice) {
    for (const wrapped of wrap(line, font, 9, width)) {
      ensure(12)
      draw(wrapped, left, 9)
      y -= 12
    }
  }

  y -= 24
  ensure(120)
  const stamp = await embedStamp(doc, model.stampSrc)
  if (stamp) {
    const box = 72
    page.drawImage(stamp, { x: left + width / 2 - box / 2, y: y - box, width: box, height: box })
    y -= box + 28
  } else {
    const cx = left + width / 2
    const cy = y - 28
    page.drawEllipse({
      x: cx,
      y: cy,
      xScale: 42,
      yScale: 42,
      borderWidth: 1.2,
      borderColor: TEAL,
    })
    const stampLines = [model.doctor || "Doctor", model.qualification, model.license].filter(Boolean)
    let stampY = cy + (stampLines.length - 1) * 6
    for (const line of stampLines) {
      const size = line === model.doctor ? 8 : 7
      const face = line === model.doctor ? bold : font
      const text = safe(line).slice(0, 28)
      page.drawText(text, {
        x: cx - face.widthOfTextAtSize(text, size) / 2,
        y: stampY,
        size,
        font: face,
        color: TEAL,
      })
      stampY -= 11
    }
    y = cy - 56
  }
  ensure(20)
  page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: 0.6, color: INK })
  y -= 14
  draw(`Printed On : ${model.printed}`, left, 9)

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
