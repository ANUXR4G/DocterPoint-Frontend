/** Client-side diagnostic catalog helpers (mirrors backend diagnosticMaster). */

export type VisitDiagnostic = {
  name: string
  diagnosticId?: string
  code?: string
  type?: string
  categoryCode?: string
  subcategoryCode?: string
  qty?: number
  instruction?: string
  favourite?: boolean
  status?: string
  isOrdered?: boolean
  isHistorical?: boolean
  orderedAt?: string
}

export type DiagnosticCatalogItem = {
  id: string
  code: string
  name: string
  categoryCode: string
  subcategoryCode: string
  type?: string
  defaultQty?: number
  instruction?: string
  favourite?: boolean
  isActive?: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  LAB: "Laboratory",
  RAD: "Radiology",
  PROC: "Minor Procedure",
  SURG: "Surgery",
}

/** Map master category / API type onto visit Type dropdown values. */
export function diagnosticTypeLabel(
  categoryCode?: string,
  type?: string,
): string {
  const t = String(type || "").trim()
  if (t === "Clinical Procedure") return "Minor Procedure"
  if (
    t === "Laboratory" ||
    t === "Radiology" ||
    t === "Minor Procedure" ||
    t === "Surgery"
  ) {
    return t
  }
  const code = String(categoryCode || "").trim().toUpperCase()
  return CATEGORY_LABELS[code] || t || "Laboratory"
}

function item(
  code: string,
  name: string,
  categoryCode: string,
  subcategoryCode: string,
  instruction = "",
  favourite = false,
): DiagnosticCatalogItem {
  return {
    id: `dx_${code.toLowerCase()}`,
    code,
    name,
    categoryCode,
    subcategoryCode,
    type: diagnosticTypeLabel(categoryCode),
    defaultQty: 1,
    instruction: instruction || undefined,
    favourite,
    isActive: true,
  }
}

/** Seed catalog (kept in sync with backend CENTRAL_DIAGNOSTIC_MASTER). */
export const CENTRAL_DIAGNOSTIC_MASTER: DiagnosticCatalogItem[] = [
  item("FBS", "Fasting Blood Sugar - FBS", "LAB", "BIO", "12 hours fasting required", true),
  item("RBS", "Random Blood Sugar - RBS", "LAB", "BIO"),
  item("HBA1C", "HbA1C", "LAB", "BIO", "", true),
  item("GTT", "Glucose Tolerance Test - GTT", "LAB", "BIO", "12 hours fasting required"),
  item("LP", "Lipid Profile – LP", "LAB", "BIO", "12 hours fasting required", true),
  item("KFT", "Kidney Function Test - KFT", "LAB", "BIO", "", true),
  item("LFT", "Liver Function Test - LFT", "LAB", "BIO"),
  item("ELECTRO", "Electrolyte Panel", "LAB", "BIO"),
  item("CBC", "Complete Blood Count - CBC", "LAB", "HEM", "", true),
  item("COAG", "Coagulation Profile", "LAB", "HEM"),
  item("ESR", "Erythrocyte Sedimentation Rate (ESR)", "LAB", "HEM"),
  item("FIB", "Fibrinogen", "LAB", "HEM"),
  item("TFT", "Thyroid Function Tests (TFT)", "LAB", "END", "", true),
  item("TSH", "Thyroid Stimulating Hormone (TSH)", "LAB", "END"),
  item("FT4", "Free T4", "LAB", "END"),
  item("FT3", "Free T3", "LAB", "END"),
  item("EST", "Estrogen", "LAB", "END"),
  item("PROG", "Progesterone", "LAB", "END"),
  item("TESTO", "Testosterone", "LAB", "END"),
  item("LH", "Luteinizing Hormone (LH)", "LAB", "END"),
  item("FSH", "Follicle-Stimulating Hormone (FSH)", "LAB", "END"),
  item("XRCHEST", "X-Ray Chest", "RAD", "XRAY", "", true),
  item("XRKNEE", "Knee X-Ray", "RAD", "XRAY"),
  item("XRLUMB", "Lumbar Spine X-Ray", "RAD", "XRAY"),
  item("USABD", "US Abdomen", "RAD", "US", "Drink enough Water before the procedure", true),
  item("USKID", "US Kidney", "RAD", "US", "Drink enough Water before the procedure"),
  item("USPEL", "US Pelvic", "RAD", "US", "Drink enough Water before the procedure"),
  item("MRIBRAIN", "MRI Brain", "RAD", "MRI"),
  item("MRILUMB", "MRI Lumbar Spine", "RAD", "MRI"),
  item("CTBRAIN", "CT Scan Brain", "RAD", "CT"),
  item("CTPNS", "CT Scan PNS", "RAD", "CT"),
  item("CTABD", "CT Scan Abdomen", "RAD", "CT"),
  item("CTPEL", "CT Scan Pelvic", "RAD", "CT"),
  item("MAM2", "Mammography 2 views", "RAD", "MAMMO"),
  item("MAM4", "Mammography 4 views", "RAD", "MAMMO"),
  item("BMDSCAN", "BMD Scan", "RAD", "BMD"),
  item("US1TRI", "US 1st Trimester", "RAD", "USPREG"),
  item("US2TRI", "US 2nd Trimester", "RAD", "USPREG"),
  item("USANOM", "US Anomaly Scan", "RAD", "USPREG"),
  item("DRS_S", "Dressing Small", "PROC", "DRESS"),
  item("DRS_M", "Dressing Medium", "PROC", "DRESS"),
  item("DRS_L", "Dressing Large", "PROC", "DRESS"),
  item("SCALE", "Scaling & Polishing", "PROC", "DENT"),
  item("RCT", "Root Canal Treatment", "PROC", "DENT"),
  item("CROWN", "Crown", "PROC", "DENT"),
  item("BRIDGE", "Bridging", "PROC", "DENT"),
  item("SAC", "Short Arm Cast (SAC)", "PROC", "ORTHO"),
  item("LAC", "Long Arm Cast (LAC)", "PROC", "ORTHO"),
  item("SLC", "Short Leg Cast (SLC)", "PROC", "ORTHO"),
  item("LLC", "Long Leg Cast (LLC)", "PROC", "ORTHO"),
  item("SKINBX", "Skin Biopsy", "PROC", "DERM"),
  item("CRYO", "Cryotherapy", "PROC", "DERM"),
  item("EDC", "Electrodessication and Curettage (ED&C)", "PROC", "DERM"),
  item("CYSTLA", "Cyst Removal under local Anesthesia", "PROC", "DERM", "", true),
  item("TMT", "Treadmill Test", "SURG", "CARD"),
  item("ECHO", "Echocardiogram", "SURG", "CARD", "", true),
  item("HOLTER", "Holter Monitor", "SURG", "CARD"),
]

export function emptyDiagnosticDraft(): VisitDiagnostic {
  return {
    name: "",
    type: "Laboratory",
    qty: 1,
    instruction: "",
  }
}

export function catalogToVisitLine(item: DiagnosticCatalogItem): VisitDiagnostic {
  return {
    name: item.name,
    diagnosticId: item.id,
    code: item.code,
    type: diagnosticTypeLabel(item.categoryCode, item.type),
    categoryCode: item.categoryCode,
    subcategoryCode: item.subcategoryCode,
    qty: item.defaultQty ?? 1,
    instruction: item.instruction || "",
    favourite: Boolean(item.favourite),
  }
}

export function normalizeDiagnosticCatalogItem(
  raw: Partial<DiagnosticCatalogItem> & Record<string, unknown>,
): DiagnosticCatalogItem {
  const code = String(raw.code || "").trim()
  const name = String(raw.name || "").trim()
  const categoryCode = String(raw.categoryCode || "").trim() || "LAB"
  return {
    id: String(raw.id || (code ? `dx_${code.toLowerCase()}` : name)),
    code: code || name.slice(0, 12).toUpperCase().replace(/\s+/g, ""),
    name: name || code,
    categoryCode,
    subcategoryCode: String(raw.subcategoryCode || "").trim(),
    type: diagnosticTypeLabel(categoryCode, raw.type ? String(raw.type) : undefined),
    defaultQty: Math.max(1, Number(raw.defaultQty) || 1),
    instruction: raw.instruction ? String(raw.instruction) : "",
    favourite: Boolean(raw.favourite),
    isActive: raw.isActive !== false,
  }
}

/** Tokenized search across name, code, type, and category. */
export function diagnosticMatchesQuery(
  item: DiagnosticCatalogItem,
  query: string,
): boolean {
  const raw = query.trim().toLowerCase()
  if (!raw) return true
  const hay = [
    item.name,
    item.code,
    item.type,
    item.categoryCode,
    item.subcategoryCode,
    item.instruction,
    diagnosticTypeLabel(item.categoryCode, item.type),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  if (hay.includes(raw)) return true
  const tokens = raw.split(/\s+/).filter(Boolean)
  return tokens.length > 0 && tokens.every((t) => hay.includes(t))
}

export function searchDiagnosticMaster(
  query: string,
  limit = 80,
): DiagnosticCatalogItem[] {
  return CENTRAL_DIAGNOSTIC_MASTER.filter((d) =>
    diagnosticMatchesQuery(d, query),
  ).slice(0, limit)
}

export function mergeDiagnosticCatalog(
  rows: Array<Partial<DiagnosticCatalogItem> | DiagnosticCatalogItem>,
): DiagnosticCatalogItem[] {
  const map = new Map<string, DiagnosticCatalogItem>()
  for (const raw of rows) {
    const m = normalizeDiagnosticCatalogItem(raw as DiagnosticCatalogItem)
    if (!m.name.trim()) continue
    const key = (m.code || m.id || m.name).toLowerCase()
    const prev = map.get(key)
    map.set(key, prev ? { ...prev, ...m, favourite: Boolean(prev.favourite || m.favourite) } : m)
  }
  return Array.from(map.values()).sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
  )
}
