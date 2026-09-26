import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUtterance } from "./whatsapp.nlu.js";

describe("Monkey-test intent hardening", () => {
  it("does not treat cancel:maybe as cancel", async () => {
    const r = await parseUtterance("cancel:maybe", undefined, { useLlm: false });
    assert.notEqual(r.intent, "cancel");
  });

  it("still treats bare cancel / cancel booking as cancel", async () => {
    assert.equal(
      (await parseUtterance("cancel", undefined, { useLlm: false })).intent,
      "cancel",
    );
    assert.equal(
      (await parseUtterance("cancel my appointment", undefined, { useLlm: false }))
        .intent,
      "cancel",
    );
  });

  it("does not treat gibberish as human", async () => {
    const junk = ["asdfghjkl", "🙂🙂🙂", "https://evil.example/x", "999999"];
    for (const t of junk) {
      const r = await parseUtterance(t, undefined, { useLlm: false });
      assert.notEqual(r.intent, "human", t);
    }
  });
});
