import { test, describe } from "node:test"
import assert from "node:assert"
import {
  isMedicineLocked,
  editedVisitMedicine,
  type VisitMedicine,
} from "../components/ui/procto/MedicineEntryTable"

describe("Prescription Permissions & Historical Integrity Specification", () => {
  const activeUncommittedMed: VisitMedicine = {
    name: "Metformin 500mg",
    dose: "1",
    doseUnit: "tablet",
    frequency: "Twice daily",
    duration: "1",
    durationUnit: "Months",
    status: "active",
  }

  const orderedHistoricalMed: VisitMedicine = {
    name: "Amlodipine 5mg",
    dose: "1",
    doseUnit: "tablet",
    frequency: "Once daily",
    duration: "14",
    durationUnit: "Days",
    isOrdered: true,
    status: "ordered",
    orderedAt: "2026-01-15T10:30:00.000Z",
  }

  const dispensedPastVisitMed: VisitMedicine = {
    name: "Paracetamol 650mg",
    dose: "1",
    doseUnit: "tablet",
    frequency: "Three times daily",
    duration: "3",
    durationUnit: "Days",
    isDispensed: true,
    status: "dispensed",
  }

  test("Historical Integrity: Ordered or dispensed medications from past visits remain locked", () => {
    // In an ongoing consultation, previously ordered medicines are locked
    assert.strictEqual(
      isMedicineLocked(orderedHistoricalMed, false),
      true,
      "Ordered medication must be locked even if table is not locked",
    )

    // Dispensed medicines from past visits are locked
    assert.strictEqual(
      isMedicineLocked(dispensedPastVisitMed, false),
      true,
      "Dispensed medication must be locked even if table is not locked",
    )

    // Historical status flag explicitly locks medicine
    const historicalFlagMed: VisitMedicine = {
      name: "Atorvastatin 20mg",
      isHistorical: true,
    }
    assert.strictEqual(isMedicineLocked(historicalFlagMed, false), true)
  })

  test("Historical Integrity: Completed visits lock all medications regardless of item flags", () => {
    // When the whole consultation/visit is locked (e.g. status === COMPLETED or past visit)
    assert.strictEqual(
      isMedicineLocked(activeUncommittedMed, true),
      true,
      "Any medication in a completed/locked visit must be locked",
    )
  })

  test("Edit & Delete Applicability: Only current, active, uncommitted prescription entries are editable/deletable", () => {
    // Active entry in an open consultation is NOT locked
    assert.strictEqual(
      isMedicineLocked(activeUncommittedMed, false),
      false,
      "Current uncommitted prescription entry must be editable and deletable",
    )

    // Doctor can edit uncommitted medicine
    const updated = editedVisitMedicine(
      activeUncommittedMed,
      { dose: "2", instruction: "Take strictly after food" },
      true,
    )
    assert.strictEqual(updated.dose, "2")
    assert.strictEqual(updated.instruction, "Take strictly after food")
  })

  test("Historical records simulation: deleting or mutating an ordered medication is rejected", () => {
    const consultationMedicines: VisitMedicine[] = [
      orderedHistoricalMed,
      activeUncommittedMed,
    ]

    function simulateRemoveMedicine(
      medicines: VisitMedicine[],
      indexToRemove: number,
      isVisitCompleted: boolean,
    ): { allowed: boolean; error?: string } {
      if (isVisitCompleted) {
        return { allowed: false, error: "Visit is already completed. Prescriptions are locked." }
      }
      const target = medicines[indexToRemove]
      if (!target) return { allowed: false, error: "Medicine not found." }

      if (isMedicineLocked(target, isVisitCompleted)) {
        return {
          allowed: false,
          error: `Historical integrity violation: "${target.name}" has already been ordered and cannot be deleted.`,
        }
      }

      return { allowed: true }
    }

    // Attempting to remove index 0 (orderedHistoricalMed) must be blocked
    const removeOrderedResult = simulateRemoveMedicine(consultationMedicines, 0, false)
    assert.strictEqual(removeOrderedResult.allowed, false)
    assert.ok(removeOrderedResult.error?.includes("Historical integrity violation"))

    // Attempting to remove index 1 (activeUncommittedMed) is allowed
    const removeActiveResult = simulateRemoveMedicine(consultationMedicines, 1, false)
    assert.strictEqual(removeActiveResult.allowed, true)
    assert.strictEqual(removeActiveResult.error, undefined)

    // If the visit is completed, removing even active medicines is blocked
    const removeCompletedResult = simulateRemoveMedicine(consultationMedicines, 1, true)
    assert.strictEqual(removeCompletedResult.allowed, false)
    assert.ok(removeCompletedResult.error?.includes("Visit is already completed"))
  })
})
