import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  defaultMedicineStartDate,
  medicineEndDate,
  medicineWithStartDate,
} from "./medicineDates"
import { practiceTodayIso } from "./practiceTime"

describe("new medicine row", () => {
  test("start date defaults to today", () => {
    assert.equal(defaultMedicineStartDate(), practiceTodayIso())
    assert.match(defaultMedicineStartDate(), /^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("medicineEndDate", () => {
  test("7 days is exactly 7 days later", () => {
    assert.equal(medicineEndDate("2026-10-16", "7", "Day"), "2026-10-23")
    assert.equal(medicineEndDate("2026-10-16", "7", "Days"), "2026-10-23")
  })

  test("one week is 7 days later", () => {
    assert.equal(medicineEndDate("2026-10-16", "1", "Week"), "2026-10-23")
    assert.equal(medicineEndDate("2026-10-16", "2", "Weeks"), "2026-10-30")
  })

  test("one month is the same day next month", () => {
    assert.equal(medicineEndDate("2026-10-16", "1", "Month"), "2026-11-16")
    assert.equal(medicineEndDate("2026-10-16", "1", "Months"), "2026-11-16")
  })

  test("a later start date keeps the same duration", () => {
    const next = medicineWithStartDate(
      {
        name: "Amoxylin",
        duration: "7",
        durationUnit: "Day",
        startDate: "2026-10-15",
        endDate: "2026-10-22",
      },
      "2026-10-20",
    )
    assert.equal(next.startDate, "2026-10-20")
    assert.equal(next.endDate, "2026-10-27")
    assert.equal(next.duration, "7")
  })

  test("missing duration does not invent an end date", () => {
    assert.equal(medicineEndDate("2026-10-16", "", "Day"), null)
    assert.equal(medicineEndDate("2026-10-16", "5", ""), null)
  })
})
