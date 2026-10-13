import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isChildRelationship, phoneKey, samePatientMobile } from "./phoneMatch.js";

describe("patient mobile identity", () => {
  it("treats India with and without 91 as the same number", () => {
    assert.equal(phoneKey("9876543210"), "9876543210");
    assert.equal(phoneKey("+91 98765 43210"), "9876543210");
    assert.equal(samePatientMobile("919876543210", "9876543210"), true);
  });

  it("does not merge +971 and +1 when they share the last 10 digits", () => {
    assert.equal(samePatientMobile("971507801104", "1507801104"), false);
    assert.equal(samePatientMobile("+971 50 780 1104", "971507801104"), true);
    assert.equal(samePatientMobile("+1 507801104", "1507801104"), true);
  });

  it("recognises a child relationship only", () => {
    assert.equal(isChildRelationship("Child"), true);
    assert.equal(isChildRelationship(" daughter "), true);
    assert.equal(isChildRelationship("Spouse"), false);
    assert.equal(isChildRelationship(""), false);
  });
});
