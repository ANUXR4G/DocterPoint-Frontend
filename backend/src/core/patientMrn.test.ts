import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatPatientMrn } from "./patientMrn.js";

describe("patient MRN", () => {
  it("zero-pads to MR########", () => {
    assert.equal(formatPatientMrn(1), "MR00000001");
    assert.equal(formatPatientMrn(42), "MR00000042");
    assert.equal(formatPatientMrn(12345678), "MR12345678");
  });
});
