import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decideIdleTimeoutAction,
  idleActivityLabel,
} from "./whatsapp.idleTimeout.js";
import { BotPrompts } from "./whatsapp.templates.js";

describe("idle reminder names the pending activity", () => {
  it("family registration mentions the member", () => {
    const activity = idleActivityLabel({
      step: "awaiting_register_family_details",
      registeringFamily: true,
      regName: "Roopa Satheesh",
    });
    const reply = BotPrompts.idleReminder("en", activity);
    assert.match(reply, /while \*adding Roopa Satheesh to your family\*/);
    assert.match(reply, /Continue/);
  });

  it("booking steps say booking an appointment", () => {
    assert.equal(
      idleActivityLabel({ step: "awaiting_slot" })?.en,
      "booking an appointment",
    );
  });

  it("unknown steps fall back to the plain reminder", () => {
    const reply = BotPrompts.idleReminder("en", idleActivityLabel({ step: "idle" }));
    assert.match(reply, /^It looks like you stepped away\.\n/);
  });
});

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
