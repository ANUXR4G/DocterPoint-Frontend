import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatE164 } from "./whatsapp.client.js";

describe("formatE164", () => {
  it("keeps full international MSISDNs", () => {
    assert.equal(formatE164("919999973601"), "919999973601");
    assert.equal(formatE164("+971551328646"), "971551328646");
  });

  it("strips trunk 00 prefixes", () => {
    assert.equal(formatE164("00971551328646"), "971551328646");
  });

  it("adds 91 only for Indian-looking 10-digit mobiles", () => {
    assert.equal(formatE164("9999973601"), "919999973601");
    assert.equal(formatE164("1507801104"), "1507801104");
  });
});
