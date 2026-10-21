import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  searchMedicineMaster,
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
})
