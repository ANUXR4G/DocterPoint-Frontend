import { test, describe } from "node:test"
import assert from "node:assert/strict"
import * as XLSX from "xlsx"
import {
  generateMedicineTemplateWorkbook,
  parseMedicineExcelData,
  SAMPLE_TEMPLATE_ROWS,
} from "./medicineExcel"

describe("Medicine Excel Template & Bulk Parsing", () => {
  test("generates template workbook with valid sheets and sample rows", () => {
    const wb = generateMedicineTemplateWorkbook("xlsx")
    assert.ok(wb.SheetNames.includes("Medicines Master"))
    const sheet = wb.Sheets["Medicines Master"]
    assert.ok(sheet)

    const rows = XLSX.utils.sheet_to_json(sheet)
    assert.equal(rows.length, SAMPLE_TEMPLATE_ROWS.length)
  })

  test("parses valid Excel binary data correctly", () => {
    const wb = generateMedicineTemplateWorkbook("xlsx")
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })

    const result = parseMedicineExcelData(buffer)
    assert.equal(result.validRows.length, SAMPLE_TEMPLATE_ROWS.length)
    assert.equal(result.invalidRows.length, 0)

    const first = result.validRows[0]
    assert.equal(first.medicineCode, "MED-MET-500")
    assert.equal(first.brandName, "Metformin 500mg")
    assert.equal(first.genericName, "Metformin Hydrochloride")
    assert.equal(first.strength, "500 mg")
    assert.equal(first.route, "Oral")
    assert.equal(first.dosageForm, "Tablet")
    assert.equal(first.favourite, true)
  })

  test("handles missing medicine code by auto-generating unique code", () => {
    const testData = [
      {
        "Brand Name": "Azithromycin 500mg",
        "Generic Name": "Azithromycin",
        "Strength": "500 mg",
        Route: "Oral",
        "Dosage Form": "Tablet",
        Favourite: "No",
      },
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(testData)
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })

    const result = parseMedicineExcelData(buffer)
    assert.equal(result.validRows.length, 1)
    const row = result.validRows[0]
    assert.ok(row.medicineCode.startsWith("MED-AZITHR-"))
    assert.equal(row.isAutoCode, true)
    assert.equal(row.favourite, false)
  })

  test("flags rows missing both brand and generic name as invalid", () => {
    const testData = [
      {
        "Medicine Code": "EMPTY-001",
        Strength: "100 mg",
      },
    ]
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(testData)
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" })

    const result = parseMedicineExcelData(buffer)
    assert.equal(result.validRows.length, 0)
    assert.equal(result.invalidRows.length, 1)
    assert.match(result.invalidRows[0].reason, /missing both Brand Name/i)
  })
})
