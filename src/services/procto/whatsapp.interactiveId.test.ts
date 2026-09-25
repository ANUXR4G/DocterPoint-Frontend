import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { preferInteractiveId } from "./whatsapp.service.js";
import { parseGlobalKeywordHijack } from "./whatsapp.hijacks.js";

describe("preferInteractiveId — booking confirm buttons", () => {
  it("keeps confirm:* ids so Cancel title does not become Exit hijack", () => {
    assert.equal(
      preferInteractiveId("confirm:cancel", "Cancel"),
      "confirm:cancel",
    );
    assert.equal(
      preferInteractiveId("confirm:yes", "Confirm Booking"),
      "confirm:yes",
    );
    assert.equal(
      preferInteractiveId("confirm:change", "Change Details"),
      "confirm:change",
    );
  });

  it("keeps whom / manage / doc / specialty / rel ids", () => {
    assert.equal(preferInteractiveId("whom:self", "Self (Anurag)"), "whom:self");
    assert.equal(
      preferInteractiveId("whom:family", "Family member"),
      "whom:family",
    );
    assert.equal(
      preferInteractiveId("manage:cancel", "Cancel Booking"),
      "manage:cancel",
    );
    assert.equal(
      preferInteractiveId("doc:appointment", "Select Appointment"),
      "doc:appointment",
    );
    assert.equal(preferInteractiveId("specialty:2", "Cardiology"), "specialty:2");
    assert.equal(preferInteractiveId("rel:spouse", "Spouse"), "rel:spouse");
  });

  it("falls back to title when id is not structured", () => {
    assert.equal(preferInteractiveId("plain", "Hello"), "Hello");
    assert.equal(preferInteractiveId(undefined, "Hello"), "Hello");
  });
});

describe("Cancel title vs confirm:cancel hijack", () => {
  it("typed Cancel exits; confirm:cancel does not", () => {
    assert.equal(parseGlobalKeywordHijack("Cancel"), "exit");
    assert.equal(parseGlobalKeywordHijack("confirm:cancel"), null);
  });
});
