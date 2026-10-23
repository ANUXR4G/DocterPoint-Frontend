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
    type: item.type || item.categoryCode,
    categoryCode: item.categoryCode,
    subcategoryCode: item.subcategoryCode,
    qty: item.defaultQty ?? 1,
    instruction: item.instruction || "",
    favourite: Boolean(item.favourite),
  }
}
