import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  DURATION_UNITS,
  normalizeDurationUnit,
  medicineFromDraft,
  editedVisitMedicine,
  type VisitMedicine,
} from "../components/ui/procto/MedicineEntryTable"
import { searchMedicineMaster } from "./medicineMaster"

describe("Medicine Duration Units - Day to Days standard", () => {
  it("DURATION_UNITS includes 'Days' and does not contain singular 'Day'", () => {
    assert.ok(DURATION_UNITS.includes("Days"), "DURATION_UNITS should include 'Days'")
    assert.ok(!DURATION_UNITS.includes("Day"), "DURATION_UNITS should not include singular 'Day'")
    assert.deepEqual(DURATION_UNITS, ["Days", "Weeks", "Months"])
  })

  it("normalizeDurationUnit normalizes 'Day' and variations to 'Days'", () => {
    assert.equal(normalizeDurationUnit("Day"), "Days")
    assert.equal(normalizeDurationUnit("day"), "Days")
    assert.equal(normalizeDurationUnit("Days"), "Days")
    assert.equal(normalizeDurationUnit("days"), "Days")
    assert.equal(normalizeDurationUnit("Week"), "Weeks")
    assert.equal(normalizeDurationUnit("Month"), "Months")
    assert.equal(normalizeDurationUnit(""), "")
    assert.equal(normalizeDurationUnit(undefined), "")
  })

  it("medicineFromDraft defaults durationUnit to 'Days' when unset or 'Day'", () => {
    const medUnset = medicineFromDraft({
      name: "Paracetamol 650mg",
      dose: "1",
      duration: "5",
    } as VisitMedicine)
    assert.ok(medUnset)
    assert.equal(medUnset.durationUnit, "Days")

    const medLegacy = medicineFromDraft({
      name: "Paracetamol 650mg",
      dose: "1",
      duration: "5",
      durationUnit: "Day",
    } as VisitMedicine)
    assert.ok(medLegacy)
    assert.equal(medLegacy.durationUnit, "Days")
  })

  it("editedVisitMedicine normalizes durationUnit to 'Days' on update or commit", () => {
    const initial: VisitMedicine = {
      name: "Amoxicillin 500mg",
      dose: "1",
      duration: "5",
      durationUnit: "Day",
      startDate: "2026-10-23",
    }
    const updated = editedVisitMedicine(initial, { durationUnit: "Day" }, true)
    assert.equal(updated.durationUnit, "Days")
  })

  it("central medicine master returns 'Days' for acute oral medications", () => {
    const dolo = searchMedicineMaster("Dolo", 5)[0]
    assert.ok(dolo, "Dolo should be found in catalog")
    assert.equal(dolo.durationUnit, "Days", "Catalog items should have durationUnit 'Days'")
  })
})
