import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  searchMedicineMaster,
  medicineMatchesQuery,
  medicineSelectionKey,
  mergeMedicineMasterItems,
  listFavoriteMedicineMaster,
  CENTRAL_MEDICINE_MASTER,
} from "./medicineMaster"

describe("Centralized Medicine Master", () => {
  test("master contains essential drugs", () => {
    assert.ok(CENTRAL_MEDICINE_MASTER.length >= 30)
  })

  test("type first few letters 'Met' returns Metformin options", () => {
    const results = searchMedicineMaster("Met")
    assert.ok(results.length > 0)
    assert.ok(results.some((m) => m.name.toLowerCase().includes("metformin")))
    const metformin = results.find((m) => m.name.includes("Metformin 500mg"))
    assert.ok(metformin)
    assert.equal(metformin.category, "Antidiabetic")
    assert.equal(metformin.route, "Oral")
    assert.equal(metformin.doseUnit, "tablet")
  })

  test("type first few letters 'Par' returns Paracetamol options", () => {
    const results = searchMedicineMaster("Par")
    assert.ok(results.length > 0)
    assert.ok(results.some((m) => m.name.toLowerCase().includes("paracetamol")))
  })

  test("type first few letters 'Amo' returns Amoxicillin options", () => {
    const results = searchMedicineMaster("Amo")
    assert.ok(results.length > 0)
    assert.ok(results.some((m) => m.name.toLowerCase().includes("amoxicillin")))
  })

  test("type first few letters 'Pan' returns Pantoprazole options", () => {
    const results = searchMedicineMaster("Pan")
    assert.ok(results.length > 0)
    assert.ok(results.some((m) => m.name.toLowerCase().includes("pantoprazole")))
  })

  test("search by generic/salt name 'Acetaminophen' matches Paracetamol", () => {
    const results = searchMedicineMaster("Acetaminophen")
    assert.ok(results.some((m) => m.name.toLowerCase().includes("paracetamol")))
  })

  test("empty query returns top items", () => {
    const results = searchMedicineMaster("", 10)
    assert.equal(results.length, 10)
  })

  test("tokenized query 'paracetamol 500mg' matches strength+name", () => {
    const results = searchMedicineMaster("paracetamol 500mg", 20)
    assert.ok(results.length > 0)
    assert.ok(
      results.every((m) => medicineMatchesQuery(m, "paracetamol 500mg")),
    )
    assert.ok(
      results.some((m) => m.name.toLowerCase().includes("paracetamol")),
    )
  })

  test("medicineSelectionKey stays unique when id is empty", () => {
    const a = medicineSelectionKey({
      id: "",
      name: "Metformin 500mg",
      strength: "500mg",
    })
    const b = medicineSelectionKey({
      id: "",
      name: "Metformin 850mg",
      strength: "850mg",
    })
    assert.notEqual(a, b)
    assert.equal(a, "label:metformin 500mg|500mg")
  })

  test("same medicineCode collapses Metformin and Glucophage brand alias", () => {
    const merged = mergeMedicineMasterItems([
      {
        id: "med-metformin-500",
        medicineCode: "MED-MET-500",
        name: "Metformin 500mg",
        brandName: "Glucophage 500",
        strength: "500mg",
        frequency: "Twice daily",
        duration: "1",
        durationUnit: "Month",
        instruction: "After meals",
        favourite: true,
      },
      {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        medicineCode: "MED-MET-500",
        name: "Glucophage 500",
        brandName: "Glucophage 500",
        strength: "500 mg",
        favourite: true,
      },
    ])
    assert.equal(merged.length, 1)
    assert.equal(merged[0]!.medicineCode, "MED-MET-500")
    assert.equal(merged[0]!.frequency, "Twice daily")
    assert.match(merged[0]!.name + merged[0]!.brandName, /Metformin|Glucophage/i)
  })

  test("selecting one merged favorite must not yield two Rx names", () => {
    const merged = mergeMedicineMasterItems([
      {
        id: "med-metformin-500",
        medicineCode: "MED-MET-500",
        name: "Metformin 500mg",
        brandName: "Glucophage 500",
        strength: "500mg",
        favourite: true,
      },
      {
        id: "med-metformin-850",
        medicineCode: "MED-MET-850",
        name: "Metformin 850mg",
        brandName: "Glucophage 850",
        strength: "850mg",
        favourite: true,
      },
      {
        id: "uuid-glucophage-500",
        name: "Glucophage 500",
        brandName: "Glucophage 500",
        strength: "500 mg",
        medicineCode: "MED-MET-500",
        favourite: true,
      },
      {
        id: "uuid-glucophage-850",
        name: "Glucophage 850",
        brandName: "Glucophage 850",
        strength: "850 mg",
        medicineCode: "MED-MET-850",
        favourite: true,
      },
    ])
    assert.equal(merged.length, 2)
    const selected = new Set([medicineSelectionKey(merged[0]!)])
    const toAdd = merged.filter((m) => selected.has(medicineSelectionKey(m)))
    assert.equal(toAdd.length, 1)
  })

  test("listFavoriteMedicineMaster returns starred/popular rows (not search slice)", () => {
    const favs = listFavoriteMedicineMaster()
    assert.ok(favs.length > 2)
    assert.ok(favs.every((m) => m.favourite || m.isPopular))
  })
})
