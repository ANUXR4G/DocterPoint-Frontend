import * as XLSX from "xlsx"

export type ParsedMedicineRow = {
  medicineCode: string
  countryCode: string
  brandName: string
  genericName: string
  strength: string
  route: string
  dosageForm: string
  favourite: boolean
  isAutoCode?: boolean
}

export type ParseMedicineResult = {
  validRows: ParsedMedicineRow[]
  invalidRows: Array<{
    rowNumber: number
    reason: string
    raw: Record<string, unknown>
  }>
  totalRows: number
}

export const SAMPLE_TEMPLATE_ROWS = [
  {
    "Medicine Code": "MED-MET-500",
    "Govt Code (Country Code)": "IN-M500",
    "Brand Name": "Metformin 500mg",
    "Generic Name": "Metformin Hydrochloride",
    "Strength": "500 mg",
    "Route": "Oral",
    "Dosage Form": "Tablet",
    "Favourite (Yes/No)": "Yes",
  },
  {
    "Medicine Code": "MED-PAR-650",
    "Govt Code (Country Code)": "IN-P650",
    "Brand Name": "Paracetamol 650mg (Dolo)",
    "Generic Name": "Paracetamol",
    "Strength": "650 mg",
    "Route": "Oral",
    "Dosage Form": "Tablet",
    "Favourite (Yes/No)": "Yes",
  },
  {
    "Medicine Code": "MED-PAN-40",
    "Govt Code (Country Code)": "IN-PAN40",
    "Brand Name": "Pantoprazole 40mg",
    "Generic Name": "Pantoprazole Sodium",
    "Strength": "40 mg",
    "Route": "Oral",
    "Dosage Form": "Tablet",
    "Favourite (Yes/No)": "No",
  },
  {
    "Medicine Code": "MED-AMOX-500",
    "Govt Code (Country Code)": "IN-A500",
    "Brand Name": "Amoxicillin 500mg",
    "Generic Name": "Amoxicillin Trihydrate",
    "Strength": "500 mg",
    "Route": "Oral",
    "Dosage Form": "Capsule",
    "Favourite (Yes/No)": "No",
  },
  {
    "Medicine Code": "MED-SALB-100",
    "Govt Code (Country Code)": "IN-S100",
    "Brand Name": "Salbutamol Inhaler 100mcg",
    "Generic Name": "Salbutamol",
    "Strength": "100 mcg",
    "Route": "Inhalation",
    "Dosage Form": "Inhaler",
    "Favourite (Yes/No)": "No",
  },
  {
    "Medicine Code": "MED-INS-GLAR",
    "Govt Code (Country Code)": "IN-IG100",
    "Brand Name": "Insulin Glargine 100IU",
    "Generic Name": "Insulin Glargine",
    "Strength": "100 IU/ml",
    "Route": "Subcutaneous",
    "Dosage Form": "Injection",
    "Favourite (Yes/No)": "No",
  },
]

/**
 * Creates and triggers download of a standardized Excel (.xlsx) or CSV template.
 */
export function generateMedicineTemplateWorkbook(format: "xlsx" | "csv" = "xlsx") {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(SAMPLE_TEMPLATE_ROWS)

  // Configure column widths for neat rendering in spreadsheet software
  ws["!cols"] = [
    { wch: 18 }, // Medicine Code
    { wch: 26 }, // Govt Code
    { wch: 30 }, // Brand Name
    { wch: 30 }, // Generic Name
    { wch: 14 }, // Strength
    { wch: 16 }, // Route
    { wch: 16 }, // Dosage Form
    { wch: 20 }, // Favourite (Yes/No)
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Medicines Master")
  return wb
}

/**
 * Trigger client-side file download for template.
 */
export function downloadMedicineTemplate(format: "xlsx" | "csv" = "xlsx") {
  const wb = generateMedicineTemplateWorkbook(format)
  const filename =
    format === "csv"
      ? "medicine_bulk_upload_template.csv"
      : "medicine_bulk_upload_template.xlsx"
  XLSX.writeFile(wb, filename, { bookType: format })
}

/**
 * Find value in object matching any candidate header name (case/spacing insensitive).
 */
function getField(row: Record<string, unknown>, aliases: string[]): string {
  const normalizedEntries = Object.entries(row).map(([k, v]) => [
    k.toLowerCase().replace(/[^a-z0-9]/g, ""),
    v != null ? String(v).trim() : "",
  ])

  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "")
    const found = normalizedEntries.find(([k]) => k === cleanAlias)
    if (found && found[1]) return found[1]
  }

  // Partial substring match as secondary fallback
  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "")
    const found = normalizedEntries.find(
      ([k]) => k.includes(cleanAlias) || cleanAlias.includes(k),
    )
    if (found && found[1]) return found[1]
  }

  return ""
}

/**
 * Parse uploaded ArrayBuffer (Excel .xlsx, .xls, or .csv) into validated Medicine records.
 */
export function parseMedicineExcelData(data: ArrayBuffer | Uint8Array): ParseMedicineResult {
  const wb = XLSX.read(data, { type: "array" })
  if (!wb.SheetNames || wb.SheetNames.length === 0) {
    return { validRows: [], invalidRows: [], totalRows: 0 }
  }

  // Choose the first sheet or one containing "medicine"
  const sheetName =
    wb.SheetNames.find((name) => name.toLowerCase().includes("medicine")) ||
    wb.SheetNames[0]!
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    return { validRows: [], invalidRows: [], totalRows: 0 }
  }

  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
  })

  const validRows: ParsedMedicineRow[] = []
  const invalidRows: ParseMedicineResult["invalidRows"] = []

  rawRows.forEach((raw, idx) => {
    const rowNumber = idx + 2 // accounting for header row (1-indexed)

    // Check if the whole row is empty
    const values = Object.values(raw).map((v) => String(v ?? "").trim())
    if (values.every((v) => !v)) {
      return // skip empty row
    }

    const brandName = getField(raw, [
      "brandname",
      "brand name",
      "brand",
      "medicinename",
      "medicine name",
      "name",
      "drug name",
      "item name",
    ])

    const genericName = getField(raw, [
      "genericname",
      "generic name",
      "generic",
      "salt",
      "saltname",
      "salt name",
      "composition",
      "active ingredient",
    ])

    let medicineCode = getField(raw, [
      "medicinecode",
      "medicine code",
      "code",
      "drug code",
      "item code",
      "id",
      "sku",
    ])

    const countryCode = getField(raw, [
      "countrycode",
      "country code",
      "govt code",
      "govtcode",
      "government code",
      "national code",
    ])

    const strength = getField(raw, [
      "strength",
      "power",
      "dosage",
      "dose",
      "potency",
    ])

    const route =
      getField(raw, [
        "route",
        "route of administration",
        "admin route",
      ]) || "Oral"

    const dosageForm =
      getField(raw, [
        "dosageform",
        "dosage form",
        "form",
        "type",
        "medicine type",
      ]) || "Tablet"

    const favRaw = getField(raw, [
      "favourite",
      "favorite",
      "starred",
      "popular",
      "is favourite",
      "is favorite",
    ]).toLowerCase()

    const favourite =
      favRaw === "yes" ||
      favRaw === "true" ||
      favRaw === "1" ||
      favRaw === "y" ||
      favRaw === "starred"

    // Validation
    if (!brandName && !genericName) {
      invalidRows.push({
        rowNumber,
        reason: "Row is missing both Brand Name and Generic Name.",
        raw,
      })
      return
    }

    const resolvedBrand = brandName || genericName
    const resolvedGeneric = genericName || brandName

    let isAutoCode = false
    if (!medicineCode) {
      // Auto-generate a clean, identifiable code
      const cleanBrand = resolvedBrand
        .replace(/[^a-zA-Z0-9]/g, "")
        .toUpperCase()
        .slice(0, 6) || "MED"
      medicineCode = `MED-${cleanBrand}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
      isAutoCode = true
    }

    validRows.push({
      medicineCode,
      countryCode,
      brandName: resolvedBrand,
      genericName: resolvedGeneric,
      strength,
      route,
      dosageForm,
      favourite,
      isAutoCode,
    })
  })

  return {
    validRows,
    invalidRows,
    totalRows: rawRows.length,
  }
}
