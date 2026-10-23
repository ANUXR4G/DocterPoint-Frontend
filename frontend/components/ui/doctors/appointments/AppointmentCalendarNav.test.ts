import { test, describe } from "node:test"
import assert from "node:assert/strict"

describe("AppointmentCalendar navigation button label", () => {
  type ViewMode = "day" | "week" | "month"

  function getJumpLabel(view: ViewMode): string {
    return view === "week" ? "Week" : view === "month" ? "Month" : "Today"
  }

  test("returns Today when view is day", () => {
    assert.equal(getJumpLabel("day"), "Today")
  })

  test("returns Week when view is week", () => {
    assert.equal(getJumpLabel("week"), "Week")
  })

  test("returns Month when view is month", () => {
    assert.equal(getJumpLabel("month"), "Month")
  })
})

