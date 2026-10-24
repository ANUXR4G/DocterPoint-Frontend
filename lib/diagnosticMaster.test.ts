import { describe, test } from "node:test"
import assert from "node:assert/strict"
import {
  CENTRAL_DIAGNOSTIC_MASTER,
  diagnosticMatchesQuery,
  diagnosticTypeLabel,
  mergeDiagnosticCatalog,
  searchDiagnosticMaster,
} from "./diagnosticMaster"

describe("Diagnostic master search", () => {
  test("seed catalog has common labs and radiology", () => {
    assert.ok(CENTRAL_DIAGNOSTIC_MASTER.length >= 40)
    assert.ok(CENTRAL_DIAGNOSTIC_MASTER.some((d) => d.code === "FBS"))
    assert.ok(CENTRAL_DIAGNOSTIC_MASTER.some((d) => d.code === "USABD"))
  })

  test("empty query returns browseable list", () => {
    const all = searchDiagnosticMaster("", 200)
    assert.ok(all.length >= 40)
  })

  test("tokenized query finds FBS and HbA1C", () => {
    const fbs = searchDiagnosticMaster("fasting sugar", 20)
    assert.ok(fbs.some((d) => d.code === "FBS"))
    const hba = searchDiagnosticMaster("hba1c", 10)
    assert.ok(hba.some((d) => d.code === "HBA1C"))
  })

  test("PROC maps to Minor Procedure for visit type dropdown", () => {
    assert.equal(diagnosticTypeLabel("PROC"), "Minor Procedure")
    assert.equal(diagnosticTypeLabel("LAB"), "Laboratory")
    assert.equal(
      diagnosticTypeLabel("PROC", "Clinical Procedure"),
      "Minor Procedure",
    )
  })

  test("merge collapses duplicate codes from API + seed", () => {
    const merged = mergeDiagnosticCatalog([
      ...CENTRAL_DIAGNOSTIC_MASTER.slice(0, 3),
      {
        id: "custom-fbs",
        code: "FBS",
        name: "Fasting Blood Sugar - FBS",
        categoryCode: "LAB",
        subcategoryCode: "BIO",
        favourite: true,
      },
    ])
    assert.equal(merged.filter((d) => d.code === "FBS").length, 1)
  })

  test("diagnosticMatchesQuery requires every token", () => {
    const fbs = CENTRAL_DIAGNOSTIC_MASTER.find((d) => d.code === "FBS")!
    assert.equal(diagnosticMatchesQuery(fbs, "fasting fbs"), true)
    assert.equal(diagnosticMatchesQuery(fbs, "fasting xyz"), false)
  })
})
