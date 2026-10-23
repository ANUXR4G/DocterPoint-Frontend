import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  isTokenModeDay,
  isTokenBooking,
  isTimedBooking,
} from "./AppointmentCalendar"

describe("AppointmentCalendar token mode helpers", () => {
  test("identifies token and timed bookings correctly", () => {
    assert.equal(
      isTokenBooking({ id: "1", tokenNumber: 5, slotStart: null }),
      true,
    )
    assert.equal(
      isTokenBooking({ id: "2", mode: "TOKEN_BASED" }),
      true,
    )
    assert.equal(
      isTimedBooking({ id: "3", slotStart: "2026-10-24T10:00:00Z" }),
      true,
    )
    assert.equal(
      isTimedBooking({ id: "4", slotStart: "2026-10-24T10:00:00Z", tokenNumber: 2 }),
      false,
    )
  })

  test("detects token mode when all columns have TOKEN_BASED window", () => {
    const columns = [{ id: "doc-1" }, { id: "doc-2" }]
    const windows = {
      "doc-1": { mode: "TOKEN_BASED" },
      "doc-2": { mode: "TOKEN_BASED" },
    }
    assert.equal(isTokenModeDay(columns, windows as any, []), true)
  })

  test("detects token mode when day only has token bookings and no timed bookings", () => {
    const columns = [{ id: "doc-1" }]
    const windows = { "doc-1": { mode: null } }
    const bookings = [{ id: "b-1", tokenNumber: 1, providerId: "doc-1" }]
    assert.equal(isTokenModeDay(columns, windows as any, bookings as any), true)
  })

  test("detects token mode when configured doctors are all TOKEN_BASED even if some windows are null", () => {
    const columns = [{ id: "doc-1" }, { id: "doc-2" }]
    const windows = {
      "doc-1": { mode: "TOKEN_BASED" },
      "doc-2": { mode: null },
    }
    assert.equal(isTokenModeDay(columns, windows as any, []), true)
  })

  test("returns false when a doctor has timed bookings", () => {
    const columns = [{ id: "doc-1" }]
    const windows = { "doc-1": { mode: "TIME_BASED" } }
    const bookings = [
      { id: "b-1", slotStart: "2026-10-24T10:00:00Z", providerId: "doc-1" },
    ]
    assert.equal(isTokenModeDay(columns, windows as any, bookings as any), false)
  })
})
