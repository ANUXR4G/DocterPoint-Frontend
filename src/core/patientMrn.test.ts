import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveMrnPrefixFromName,
  formatPatientMrn,
  sanitizeMrnPrefix,
} from "./patientMrn.js";

describe("patient MRN", () => {
  it("zero-pads to MR######## without prefix", () => {
    assert.equal(formatPatientMrn(1), "MR00000001");
    assert.equal(formatPatientMrn(42), "MR00000042");
    assert.equal(formatPatientMrn(12345678), "MR12345678");
  });

  it("prefixes clinic/doctor initials before MR", () => {
    assert.equal(formatPatientMrn(1, "PC"), "PCMR00000001");
    assert.equal(formatPatientMrn(42, "an"), "ANMR00000042");
  });

  it("derives initials from practice name", () => {
    assert.equal(deriveMrnPrefixFromName("Priya Clinic"), "PC");
    assert.equal(deriveMrnPrefixFromName("Dr Anurag Nanda"), "AN");
    assert.equal(deriveMrnPrefixFromName("Apollo Care Centre"), "ACC");
  });

  it("sanitizes prefix to A-Z0-9", () => {
    assert.equal(sanitizeMrnPrefix("pc-1"), "PC1");
    assert.equal(sanitizeMrnPrefix(""), "");
  });
});
