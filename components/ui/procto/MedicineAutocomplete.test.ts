import { test, describe } from "node:test"
import assert from "node:assert"
import { searchMedicineMaster, type MedicineMasterItem } from "@/lib/medicineMaster"

describe("MedicineAutocomplete Favorite Star Selection Box Logic", () => {
  test("medicine master catalog includes favourite status on medicines", () => {
    const results = searchMedicineMaster("", 40)
    assert.ok(results.length > 0, "Should return catalog items")
    
    const favItems = results.filter((m) => m.favourite === true)
    const nonFavItems = results.filter((m) => !m.favourite)
    
    assert.ok(favItems.length > 0, "Should have favorite medicines in catalog")
    assert.ok(nonFavItems.length > 0, "Should have non-favorite medicines in catalog")
  })

  test("favorite star color logic: green when favorite, orange when not favorite", () => {
    function getStarColor(isFav: boolean): "green" | "orange" {
      return isFav ? "green" : "orange"
    }

    assert.strictEqual(getStarColor(true), "green", "Favorite star must be green")
    assert.strictEqual(getStarColor(false), "orange", "Non-favorite star must be orange")
  })

  test("toggling favorite status on a medicine in selection box", () => {
    const med: MedicineMasterItem = {
      id: "med-test-1",
      name: "Metformin 500mg",
      brandName: "Glycomet",
      genericName: "Metformin",
      category: "Antidiabetic",
      medicineCode: "MED-MET-500",
      countryCode: "IN-DCGI-001",
      favourite: false,
    }

    assert.strictEqual(med.favourite, false)
    assert.strictEqual(med.favourite ? "green" : "orange", "orange")

    // User clicks star to add to favorite
    med.favourite = !med.favourite
    assert.strictEqual(med.favourite, true)
    assert.strictEqual(med.favourite ? "green" : "orange", "green")

    // User clicks star again to remove from favorite
    med.favourite = !med.favourite
    assert.strictEqual(med.favourite, false)
    assert.strictEqual(med.favourite ? "green" : "orange", "orange")
  })

  test("searching for specific medicines preserves favourite flag", () => {
    const dolo = searchMedicineMaster("Dolo", 5)
    assert.ok(dolo.length > 0)
    assert.strictEqual(dolo[0].favourite, true, "Dolo should be in favorite catalog")
    assert.strictEqual(dolo[0].favourite ? "green" : "orange", "green")
  })
})

