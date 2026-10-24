import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib"
import { embedPdfImage } from "@/lib/pdfImage"
import {
  consultationModel,
  type ConsultBooking,
} from "@/lib/consultationPdf"

const INK = rgb(0.08, 0.1, 0.12)
const TEAL = rgb(0.05, 0.45, 0.52)
const MUTED = rgb(0.35, 0.4, 0.44)

const PAGE_W = 595.28
const PAGE_H = 841.89
const LEFT = 36
const RIGHT = 559
const WIDTH = RIGHT - LEFT
const TOP = 800
/** Reserve bottom for stamp + Printed On / Page X of Y on every page */
const CONTENT_BOTTOM = 130

const COL_W = [32, 90, 210, 36, 155] as const
const COL_HEADERS = ["SNo", "Category", "Description", "Qty", "Instruction"] as const

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

type Model = ReturnType<typeof consultationModel>

type DxRow = {
  sno: string
  category: string
  description: string
  qty: string
  instruction: string
}

type PageCtx = {
  page: PDFPage
  y: number
}

/**
 * Dedicated Diagnostic Order printout (clinic visit Dx mockup).
 * Page 1: header → patient box → chief/allergy/diagnosis/vitals → Dx table
 * Cont. pages: header → patient box → Dx table (continued)
 * Every page: doctor stamp footer + Printed On + Page X of Y
 */
export async function buildDiagnosticOrderPdf(
  booking: ConsultBooking,
): Promise<Uint8Array> {
  const model = consultationModel(booking)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const logo = await embedPdfImage(doc, model.clinicLogoSrc)
  const doctorStamp = await embedPdfImage(doc, model.stampSrc)
  const clinicStamp = await embedPdfImage(doc, model.clinicStampSrc)

  const rows: DxRow[] = model.diagnostics.length
    ? model.diagnostics.map((dx, i) => ({
        sno: String(i + 1),
        category: dx.type || "—",
        description: dx.name || "—",
        qty: String(dx.qty ?? 1),
        instruction: dx.instruction || "",
      }))
    : [
        {
          sno: "—",
          category: "—",
          description: "No diagnostic orders recorded",
          qty: "—",
          instruction: "",
        },
      ]

  const pages: PDFPage[] = []

  const startPage = (opts: { clinicalSummary: boolean }): PageCtx => {
    const page = doc.addPage([PAGE_W, PAGE_H])
    pages.push(page)
    let y = drawChromeHeader(page, model, font, bold, logo)
    y = drawPatientBox(page, model, font, bold, y)
    y -= 10
    if (opts.clinicalSummary) {
      y = drawClinicalSummary(page, model, font, bold, y)
      y -= 10
    }
    page.drawText("DIAGNOSTIC ORDERS", {
      x: LEFT,
      y,
      size: 11,
      font: bold,
      color: INK,
    })
    y -= 16
    y = drawTableHeader(page, bold, y)
    return { page, y }
  }

  let ctx = startPage({ clinicalSummary: true })

  const ensure = (need: number) => {
    if (ctx.y - need >= CONTENT_BOTTOM) return
    ctx = startPage({ clinicalSummary: false })
  }

  for (const row of rows) {
    const cells = [
      row.sno,
      row.category,
      row.description,
      row.qty,
      row.instruction || "—",
    ]
    const cellLines = cells.map((c, i) =>
      wrap(c, i === 2 ? bold : font, 9, COL_W[i]! - 4),
    )
    const rowH = Math.max(...cellLines.map((l) => l.length), 1) * 11 + 6
    ensure(rowH)
    let cx = LEFT
    cellLines.forEach((lines, i) => {
      lines.forEach((line, li) => {
        ctx.page.drawText(line, {
          x: cx,
          y: ctx.y - li * 11,
          size: 9,
          font: i === 2 ? bold : font,
          color: INK,
        })
      })
      cx += COL_W[i]!
    })
    ctx.y -= rowH
    ctx.page.drawLine({
      start: { x: LEFT, y: ctx.y + 2 },
      end: { x: RIGHT, y: ctx.y + 2 },
      thickness: 0.3,
      color: rgb(0.75, 0.78, 0.8),
    })
  }

  const total = pages.length
  pages.forEach((p, idx) => {
    drawPageStampFooter(p, model, font, bold, doctorStamp, clinicStamp)
    drawPageMeta(p, model, font, idx + 1, total)
  })

  return doc.save()
}

function drawChromeHeader(
  page: PDFPage,
  model: Model,
  font: PDFFont,
  bold: PDFFont,
  logo: PDFImage | null,
): number {
  let y = TOP
  if (logo) {
    page.drawImage(logo, {
      x: RIGHT - 44,
      y: y - 34,
      width: 44,
      height: 44,
    })
  }
  page.drawText(safe(model.clinic), {
    x: LEFT,
    y,
    size: 12,
    font: bold,
    color: INK,
  })
  y -= 14
  if (model.address) {
    for (const line of wrap(model.address, font, 9, 360)) {
      page.drawText(line, { x: LEFT, y, size: 9, font, color: MUTED })
      y -= 12
    }
  }
  if (model.tel) {
    page.drawText(safe(`Tel : ${model.tel}`), {
      x: LEFT,
      y,
      size: 9,
      font,
      color: MUTED,
    })
    y -= 12
  }
  if (model.email) {
    page.drawText(safe(`Email : ${model.email}`), {
      x: LEFT,
      y,
      size: 9,
      font,
      color: MUTED,
    })
    y -= 12
  }
  y -= 8
  const title = "DIAGNOSTIC ORDERS"
  const tw = bold.widthOfTextAtSize(title, 13)
  page.drawText(title, {
    x: LEFT + (WIDTH - tw) / 2,
    y,
    size: 13,
    font: bold,
    color: INK,
  })
  y -= 4
  page.drawLine({
    start: { x: LEFT + 150, y },
    end: { x: RIGHT - 150, y },
    thickness: 0.6,
    color: INK,
  })
  return y - 10
}

function drawPatientBox(
  page: PDFPage,
  model: Model,
  font: PDFFont,
  bold: PDFFont,
  y: number,
): number {
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
    page.drawText(a, { x: LEFT + 8, y, size: 9, font: bold, color: TEAL })
    page.drawText(safe(av || "—"), {
      x: LEFT + 108,
      y,
      size: 9,
      font,
      color: INK,
    })
    if (b) {
      page.drawText(b, { x: LEFT + 280, y, size: 9, font: bold, color: TEAL })
      page.drawText(safe(bv || "—"), {
        x: LEFT + 380,
        y,
        size: 9,
        font,
        color: INK,
      })
    }
    y -= 14
  }
  const boxBottom = y
  page.drawRectangle({
    x: LEFT,
    y: boxBottom,
    width: WIDTH,
    height: boxTop - boxBottom,
    borderWidth: 1.2,
    borderColor: TEAL,
  })
  return boxBottom - 8
}

/** Chief complaint | Allergy, then Diagnosis + compact vitals (Temp / BP / Wt). */
function drawClinicalSummary(
  page: PDFPage,
  model: Model,
  font: PDFFont,
  bold: PDFFont,
  y: number,
): number {
  const mid = LEFT + 300

  page.drawText("CHIEF COMPLAINT", {
    x: LEFT,
    y,
    size: 10,
    font: bold,
    color: INK,
  })
  page.drawText("Allergy", {
    x: mid,
    y,
    size: 10,
    font: bold,
    color: INK,
  })
  y -= 13

  const chiefLines = wrap(
    `Primary Reason: ${model.chief}; Secondary Complaints: ${model.secondary}`,
    font,
    9,
    280,
  )
  const allergyLines = [
    `Food: ${model.allergyFood || "—"}`,
    `Drug: ${model.allergyDrug || "—"}`,
  ]
  const blockLines = Math.max(chiefLines.length, allergyLines.length)
  for (let i = 0; i < blockLines; i++) {
    if (chiefLines[i]) {
      page.drawText(chiefLines[i]!, {
        x: LEFT,
        y: y - i * 11,
        size: 9,
        font,
        color: INK,
      })
    }
    if (allergyLines[i]) {
      page.drawText(safe(allergyLines[i]!), {
        x: mid,
        y: y - i * 11,
        size: 9,
        font,
        color: INK,
      })
    }
  }
  y -= blockLines * 11 + 8

  page.drawText("Diagnosis:", {
    x: LEFT,
    y,
    size: 9,
    font: bold,
    color: INK,
  })
  page.drawText(safe(model.diagnosis || "—"), {
    x: LEFT + 62,
    y,
    size: 9,
    font: bold,
    color: TEAL,
  })
  y -= 14

  // vitals: [ht, wt, bmi, temp, bp, rr, spo2, hc, pr]
  const wt = model.vitals[1] || "—"
  const temp = model.vitals[3] || "—"
  const bp = model.vitals[4] || "—"
  const vitalsLine = `Vitals: Temp (deg): ${temp}, BP: ${bp}${bp !== "—" && !/mmhg/i.test(bp) ? " mmHg" : ""}, Wt: ${wt}${wt !== "—" && !/kg/i.test(wt) ? "kg" : ""}`
  page.drawText(safe(vitalsLine), {
    x: LEFT,
    y,
    size: 9,
    font,
    color: INK,
  })
  return y - 4
}

function drawTableHeader(page: PDFPage, bold: PDFFont, y: number): number {
  let x = LEFT
  COL_HEADERS.forEach((h, i) => {
    page.drawText(h, { x, y, size: 9, font: bold, color: INK })
    x += COL_W[i]!
  })
  y -= 4
  page.drawLine({
    start: { x: LEFT, y },
    end: { x: RIGHT, y },
    thickness: 0.8,
    color: INK,
  })
  return y - 12
}

function drawPageStampFooter(
  page: PDFPage,
  model: Model,
  font: PDFFont,
  bold: PDFFont,
  doctorStamp: PDFImage | null,
  clinicStamp: PDFImage | null,
) {
  const stampTop = 110
  const box = 56
  if (doctorStamp) {
    page.drawImage(doctorStamp, {
      x: LEFT,
      y: stampTop - box,
      width: box,
      height: box,
    })
  } else {
    const cx = LEFT + 28
    const cy = stampTop - 28
    page.drawEllipse({
      x: cx,
      y: cy,
      xScale: 26,
      yScale: 26,
      borderWidth: 1,
      borderColor: TEAL,
    })
  }
  if (clinicStamp) {
    page.drawImage(clinicStamp, {
      x: LEFT + 70,
      y: stampTop - box,
      width: box,
      height: box,
    })
  }
  let ty = stampTop - box - 10
  const doctorLine = [model.doctor, model.qualification].filter(Boolean).join(" ")
  page.drawText(safe(doctorLine || "Doctor"), {
    x: LEFT,
    y: ty,
    size: 9,
    font: bold,
    color: INK,
  })
  if (model.license) {
    ty -= 11
    page.drawText(safe(`Reg. No: ${model.license}`), {
      x: LEFT,
      y: ty,
      size: 7,
      font,
      color: MUTED,
    })
  }
}

function drawPageMeta(
  page: PDFPage,
  model: Model,
  font: PDFFont,
  pageNo: number,
  total: number,
) {
  page.drawLine({
    start: { x: LEFT, y: 36 },
    end: { x: RIGHT, y: 36 },
    thickness: 0.5,
    color: MUTED,
  })
  page.drawText(`Printed On : ${safe(model.printed)}`, {
    x: LEFT,
    y: 22,
    size: 8,
    font,
    color: MUTED,
  })
  const label = `Page ${pageNo} of ${total}`
  const w = font.widthOfTextAtSize(label, 8)
  page.drawText(label, {
    x: RIGHT - w,
    y: 22,
    size: 8,
    font,
    color: MUTED,
  })
}

export function diagnosticOrderFileName(booking: ConsultBooking): string {
  const model = consultationModel(booking)
  const who = (model.patientName || "patient").replace(/[^\w\-]+/g, "_").slice(0, 40)
  return `diagnostic_order_${who}_${model.shortId || "visit"}.pdf`
}

export function diagnosticOrderBlob(bytes: Uint8Array): Blob {
  return new Blob([Uint8Array.from(bytes)], { type: "application/pdf" })
}
