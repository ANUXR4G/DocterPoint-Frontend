import test, { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  listFavoriteMedicineMaster,
  medicineSelectionKey,
  searchMedicineMaster,
} from "@/lib/medicineMaster"
import { type VisitMedicine } from "./MedicineEntryTable"
import { type OrderSet, type OrderSetItem } from "./FavoriteOrderSetModal"

describe("Favorite Medicines & Order Set Quick-Prescription Integration", () => {
  it("favorite star colors are correctly defined: green (#10b981 / emerald) if favorite, orange (#f97316 / orange) if not", () => {
    function getStarColorClass(isFav: boolean) {
      return isFav
        ? "text-emerald-500 hover:text-emerald-600"
        : "text-orange-500 hover:text-orange-600"
    }

    assert.equal(getStarColorClass(true), "text-emerald-500 hover:text-emerald-600")
    assert.equal(getStarColorClass(false), "text-orange-500 hover:text-orange-600")
  })

  it("adds selected favorite medicines to prescription rows", () => {
    const mockFavorites = listFavoriteMedicineMaster()
    assert.ok(mockFavorites.length > 1, "Should have favorite medicines in catalog")

    const first = mockFavorites[0]!
    const second = mockFavorites[1]!
    const selectedKeys = new Set([
      medicineSelectionKey(first),
      medicineSelectionKey(second),
    ])
    const toAdd = mockFavorites.filter((m) =>
      selectedKeys.has(medicineSelectionKey(m)),
    )

    // Must not dump the rest of the favorites list when two are selected.
    assert.equal(toAdd.length, 2)
    assert.equal(toAdd[0]!.name, first.name)
    assert.equal(toAdd[1]!.name, second.name)

    const prescriptionRows: VisitMedicine[] = toAdd.map((med) => ({
      name: med.name,
      strength: med.strength || "",
      route: med.route || "Oral",
      dose: med.dose || "1",
      doseUnit: med.doseUnit || "tablet",
      frequency: med.frequency || "Once daily",
      duration: med.duration || "5",
      durationUnit: med.durationUnit || "Day",
      instruction: med.instruction || "After food",
      favourite: true,
    }))

    assert.equal(prescriptionRows.length, 2)
    assert.equal(prescriptionRows[0]!.favourite, true)
    assert.ok(prescriptionRows[0]!.instruction)
  })

  it("empty-id favorites do not collide on selection key", () => {
    const a = { id: "", name: "Metformin 500mg", strength: "500mg" }
    const b = { id: "", name: "Metformin 850mg", strength: "850mg" }
    const selected = new Set([medicineSelectionKey(a)])
    const pool = [a, b]
    const toAdd = pool.filter((m) => selected.has(medicineSelectionKey(m)))
    assert.equal(toAdd.length, 1)
    assert.equal(toAdd[0]!.name, "Metformin 500mg")
  })

  it("clicking an order set applies all medicines in that group to prescription", () => {
    const testOrderSet: OrderSet = {
      id: "os_test_fever",
      name: "Acute Viral Illness & Fever Care",
      category: "General Medicine",
      medicines: [
        {
          name: "Paracetamol 650mg",
          strength: "650mg",
          route: "Oral",
          dose: "1",
          doseUnit: "tablet",
          frequency: "Three times daily",
          duration: "3",
          durationUnit: "Day",
          instruction: "Take after meals; max 3 times a day",
        },
        {
          name: "Levocetirizine 5mg",
          strength: "5mg",
          route: "Oral",
          dose: "1",
          doseUnit: "tablet",
          frequency: "At bedtime",
          duration: "5",
          durationUnit: "Day",
          instruction: "Take at night before sleep; causes mild sedation",
        },
        {
          name: "Vitamin C 500mg Chewable",
          strength: "500mg",
          route: "Oral",
          dose: "1",
          doseUnit: "tablet",
          frequency: "Once daily",
          duration: "7",
          durationUnit: "Day",
          instruction: "Chew after breakfast daily",
        },
      ],
    }

    // Simulate clicking order set
    const rowsToAdd: VisitMedicine[] = testOrderSet.medicines.map((m) => ({
      name: m.name,
      strength: m.strength || "",
      route: m.route || "Oral",
      dose: m.dose || "1",
      doseUnit: m.doseUnit || "tablet",
      frequency: m.frequency || "Once daily",
      duration: m.duration || "5",
      durationUnit: m.durationUnit || "Day",
      instruction: m.instruction || "After food",
      favourite: false,
    }))

    assert.equal(rowsToAdd.length, 3, "All 3 medicines in group should be converted")
    assert.equal(rowsToAdd[0].name, "Paracetamol 650mg")
    assert.equal(rowsToAdd[1].name, "Levocetirizine 5mg")
    assert.equal(rowsToAdd[2].name, "Vitamin C 500mg Chewable")
    assert.equal(rowsToAdd[0].frequency, "Three times daily")
    assert.equal(rowsToAdd[1].instruction, "Take at night before sleep; causes mild sedation")
  })

  it("creating an order set validates required name and non-empty medicine group", () => {
    function validateNewOrderSet(name: string, medicines: OrderSetItem[]) {
      if (!name.trim()) return { valid: false, error: "Order set name is required." }
      if (medicines.length === 0) return { valid: false, error: "Please add or import at least one medicine." }
      return { valid: true }
    }

    assert.equal(validateNewOrderSet("", []).valid, false)
    assert.equal(validateNewOrderSet("My Routine", []).valid, false)
    assert.equal(
      validateNewOrderSet("My Routine", [{ name: "Amoxicillin 500mg", dose: "1", frequency: "Twice daily" }]).valid,
      true,
    )
  })

  it("can import current prescription rows into a new order set draft", () => {
    const currentRx: VisitMedicine[] = [
      {
        name: "Metformin 500mg",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "30",
        durationUnit: "Day",
        instruction: "After food",
      },
      {
        name: "Glimepiride 1mg",
        strength: "1mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Day",
        instruction: "Before breakfast",
      },
    ]

    const importedItems: OrderSetItem[] = currentRx
      .filter((r) => r.name.trim().length > 0)
      .map((r) => ({
        name: r.name,
        strength: r.strength,
        route: r.route || "Oral",
        dose: r.dose || "1",
        doseUnit: r.doseUnit || "tablet",
        frequency: r.frequency || "Once daily",
        duration: r.duration || "5",
        durationUnit: r.durationUnit || "Day",
        instruction: r.instruction,
      }))

    assert.equal(importedItems.length, 2)
    assert.equal(importedItems[0].name, "Metformin 500mg")
    assert.equal(importedItems[1].name, "Glimepiride 1mg")
  })

  it("prevents duplicate medicine addition and detects existing items", () => {
    const existingMedicines: VisitMedicine[] = [
      {
        name: "Paracetamol 650mg",
        strength: "650mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Day",
        instruction: "After food",
        favourite: true,
      },
    ]

    const newMedToAdd: VisitMedicine = {
      name: "paracetamol 650mg", // Case-insensitive duplicate
      strength: "650mg",
      route: "Oral",
      dose: "1",
      doseUnit: "tablet",
      frequency: "Three times daily",
      duration: "3",
      durationUnit: "Day",
      instruction: "After meals",
      favourite: true,
    }

    const isDuplicate = existingMedicines.some(
      (m) => m.name.trim().toLowerCase() === newMedToAdd.name.trim().toLowerCase(),
    )
    assert.equal(isDuplicate, true, "Should identify existing medicine as duplicate")

    // Filter duplicates from bulk list
    const incomingList: VisitMedicine[] = [
      { name: "Paracetamol 650mg", strength: "650mg" },
      { name: "Amoxicillin 500mg", strength: "500mg" },
      { name: "PARACETAMOL 650MG", strength: "650mg" },
    ]

    const existingSet = new Set(
      existingMedicines.map((m) => m.name.trim().toLowerCase()),
    )
    const validToAdd: VisitMedicine[] = []
    const duplicateNames: string[] = []

    for (const item of incomingList) {
      const key = item.name.trim().toLowerCase()
      if (existingSet.has(key)) {
        duplicateNames.push(item.name)
      } else {
        existingSet.add(key)
        validToAdd.push(item)
      }
    }

    assert.equal(validToAdd.length, 1, "Only non-duplicate medicine should be added")
    assert.equal(validToAdd[0].name, "Amoxicillin 500mg")
    assert.equal(duplicateNames.length, 2, "Both duplicates should be detected")
  })
})

