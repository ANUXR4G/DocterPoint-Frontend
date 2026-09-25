import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPracticeTime,
  parseLocalDate,
  zonedDateTime,
} from "./slotEngine.js";

describe("practice timezone (Asia/Kolkata)", () => {
  it("stores 11:40 clinic time as 06:10Z", () => {
    const d = zonedDateTime("2026-09-25", "11:40");
    assert.equal(d.toISOString(), "2026-09-25T06:10:00.000Z");
    assert.equal(formatPracticeTime(d), "11:40 AM");
  });

  it("parseLocalDate is midnight IST (previous day 18:30Z)", () => {
    const d = parseLocalDate("2026-09-25");
    assert.equal(d.toISOString(), "2026-09-24T18:30:00.000Z");
  });
});
