import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib"
import { embedPdfImage } from "@/lib/pdfImage"
import {
  consultationModel,
  type ConsultBooking,
} from "@/lib/consultationPdf"

const INK = rgb(0.08, 0.1, 0.12)
const TEAL = rgb(0.05, 0.45, 0.52)
const MUTED = rgb(0.35, 0.4, 0.44)

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

/** Dedicated Diagnostic Order print (separate from full consultation report). */
export async function buildDiagnosticOrderPdf(
  booking: ConsultBooking,
): Promise<Uint8Array> {
  const model = consultationModel(booking)
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
    options?: { bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number },
  ) => {
    const use = options?.bold ? bold : font
    const color = options?.color || INK
    const maxW = options?.maxWidth ?? width
    const lines = wrap(text, use, size, maxW)
    for (const line of lines) {
      ensure(size + 4)
      page.drawText(line, { x, y, size, font: use, color })
      y -= size + 3
    }
  }

  const logo = await embedPdfImage(doc, model.clinicLogoSrc)
  if (logo) {
    page.drawImage(logo, { x: right - 52, y: y - 40, width: 48, height: 48 })
  }

  draw(model.clinic, left, 14, { bold: true, color: TEAL, maxWidth: width - 60 })
  if (model.address) draw(model.address, left, 9, { color: MUTED, maxWidth: width - 60 })
  if (model.tel || model.email) {
    draw(
      [model.tel ? `Tel: ${model.tel}` : "", model.email ? `Email: ${model.email}` : ""]
        .filter(Boolean)
        .join("  ·  "),
      left,
      9,
      { color: MUTED, maxWidth: width - 60 },
    )
  }

  y -= 8
  ensure(28)
  page.drawText("DIAGNOSTIC ORDER", {
    x: left + (width - bold.widthOfTextAtSize("DIAGNOSTIC ORDER", 16)) / 2,
    y,
    size: 16,
    font: bold,
    color: TEAL,
  })
  y -= 22

  ensure(70)
  page.drawRectangle({
    x: left,
    y: y - 58,
    width,
    height: 64,
    borderColor: TEAL,
    borderWidth: 1.5,
  })
  const boxY = y - 14
  page.drawText(`Patient: ${safe(model.patientName)}`, {
    x: left + 8,
    y: boxY,
    size: 10,
    font: bold,
    color: INK,
  })
  page.drawText(`MRN: ${safe(model.mrn || "—")}`, {
    x: left + 280,
    y: boxY,
    size: 10,
    font,
    color: INK,
  })
  page.drawText(`Age / Gender: ${safe(model.ageGender || "—")}`, {
    x: left + 8,
    y: boxY - 14,
    size: 9,
    font,
    color: INK,
  })
  page.drawText(`Mobile: ${safe(model.mobile || "—")}`, {
    x: left + 280,
    y: boxY - 14,
    size: 9,
    font,
    color: INK,
  })
  page.drawText(`Doctor: ${safe(model.doctor || "—")}`, {
    x: left + 8,
    y: boxY - 28,
    size: 9,
    font,
    color: INK,
  })
  page.drawText(`Appointment: ${safe(model.appointment || "—")}`, {
    x: left + 280,
    y: boxY - 28,
    size: 9,
    font,
    color: INK,
  })
  page.drawText(`Visit: ${safe(model.visitId)}`, {
    x: left + 8,
    y: boxY - 42,
    size: 8,
    font,
    color: MUTED,
  })
  y -= 76

  draw(`Chief complaint: ${model.chief}`, left, 9, { color: MUTED })
  if (model.diagnosis) draw(`Diagnosis: ${model.diagnosis}`, left, 9, { color: MUTED })
  y -= 6

  ensure(24)
  page.drawText("ORDERED TESTS", {
    x: left,
    y,
    size: 11,
    font: bold,
    color: TEAL,
  })
  y -= 16

  const colW = [28, 70, 220, 70, 110]
  const headers = ["#", "Code", "Test / Service", "Category", "Instruction"]
  ensure(18)
  let x = left
  headers.forEach((h, i) => {
    page.drawText(h, { x, y, size: 8, font: bold, color: MUTED })
    x += colW[i]
  })
  y -= 4
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.8,
    color: TEAL,
  })
  y -= 12

  const rows: Array<{
    code?: string
    name: string
    type?: string
    instruction?: string
  }> = model.diagnostics.length
    ? model.diagnostics
    : [{ code: "—", name: "No diagnostic orders recorded", type: "", instruction: "" }]

  rows.forEach((dx, index) => {
    ensure(22)
    const cells = [
      String(index + 1),
      dx.code || "—",
      dx.name || "—",
      dx.type || "—",
      dx.instruction || "—",
    ]
    let cx = left
    const lineHeights: number[] = []
    cells.forEach((cell, i) => {
      const lines = wrap(cell, font, 8, colW[i] - 4)
      lineHeights.push(lines.length)
      lines.forEach((line, li) => {
        page.drawText(line, {
          x: cx,
          y: y - li * 10,
          size: 8,
          font: i === 2 ? bold : font,
          color: INK,
        })
      })
      cx += colW[i]
    })
    y -= Math.max(...lineHeights) * 10 + 6
  })

  y -= 20
  ensure(60)
  page.drawText("Doctor signature / stamp", {
    x: left,
    y,
    size: 9,
    font: bold,
    color: MUTED,
  })
  y -= 8
  const stamp = await embedPdfImage(doc, model.stampSrc)
  const clinicStamp = await embedPdfImage(doc, model.clinicStampSrc)
  if (stamp) {
    page.drawImage(stamp, { x: left, y: y - 48, width: 72, height: 48 })
  }
  if (clinicStamp) {
    page.drawImage(clinicStamp, { x: left + 100, y: y - 48, width: 72, height: 48 })
  }
  y -= 56
  draw(model.doctor || "", left, 10, { bold: true })
  if (model.qualification) draw(model.qualification, left, 8, { color: MUTED })
  if (model.license) draw(`Reg. No: ${model.license}`, left, 8, { color: MUTED })

  y = 40
  page.drawText(`Printed ${model.printed}`, {
    x: left,
    y,
    size: 7,
    font,
    color: MUTED,
  })

  return doc.save()
}

export function diagnosticOrderFileName(booking: ConsultBooking): string {
  const model = consultationModel(booking)
  const who = (model.patientName || "patient").replace(/[^\w\-]+/g, "_").slice(0, 40)
  return `diagnostic_order_${who}_${model.shortId || "visit"}.pdf`
}

export function diagnosticOrderBlob(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
}
