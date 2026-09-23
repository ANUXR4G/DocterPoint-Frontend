import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideIdleTimeoutAction } from "./whatsapp.idleTimeout.js";

describe("whatsapp idle timeout phases", () => {
  const reminderMs = 10 * 60_000;
  const closeMs = 30 * 60_000;

  it("does nothing before reminder window", () => {
    assert.equal(
      decideIdleTimeoutAction(5 * 60_000, false, { reminderMs, closeMs }),
      "none",
    );
  });

  it("reminds once after reminder window", () => {
    assert.equal(
      decideIdleTimeoutAction(12 * 60_000, false, { reminderMs, closeMs }),
      "remind",
    );
    assert.equal(
      decideIdleTimeoutAction(12 * 60_000, true, { reminderMs, closeMs }),
      "none",
    );
  });

  it("closes after close window even if reminder was sent", () => {
    assert.equal(
      decideIdleTimeoutAction(31 * 60_000, true, { reminderMs, closeMs }),
      "close",
    );
    assert.equal(
      decideIdleTimeoutAction(31 * 60_000, false, { reminderMs, closeMs }),
      "close",
    );
  });
});
