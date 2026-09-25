import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ageFromDob, normalizeDateOfBirth } from "./dob.js";

describe("normalizeDateOfBirth", () => {
  it("accepts YYYY-MM-DD", () => {
    assert.equal(normalizeDateOfBirth("1990-05-15"), "1990-05-15");
  });

  it("accepts DD/MM/YYYY when day > 12", () => {
    assert.equal(normalizeDateOfBirth("15/05/1990"), "1990-05-15");
  });

  it("rejects missing or invalid", () => {
    assert.equal(normalizeDateOfBirth(null), null);
    assert.equal(normalizeDateOfBirth("not-a-date"), null);
    assert.equal(normalizeDateOfBirth("1899-01-01"), null);
  });
});

describe("ageFromDob", () => {
  it("computes whole years", () => {
    const now = new Date();
    const y = now.getFullYear() - 30;
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    assert.equal(ageFromDob(`${y}-${m}-${d}`), 30);
  });

  it("returns null for empty", () => {
    assert.equal(ageFromDob(null), null);
    assert.equal(ageFromDob(""), null);
  });
});
