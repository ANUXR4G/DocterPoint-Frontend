import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import { stepUsesLlm } from "./whatsapp.nlu.js";

describe("Branch B manage / cancel / reschedule prompts", () => {
  it("askManageBookingsPick lists upcoming visits", () => {
    const reply = BotPrompts.askManageBookingsPick(
      [
        { index: 1, label: "Dr Priya · Sept 28, 11:00 AM" },
        { index: 2, label: "Dr Mehta · Sept 30, Token #4" },
      ],
      "en",
    );
    assert.match(reply, /upcoming appointments/i);
    assert.match(reply, /1\. Dr Priya/);
    assert.match(reply, /reschedule|cancel/i);
  });

  it("askManageBookingsPick empty nudges to Book", () => {
    const reply = BotPrompts.askManageBookingsPick([], "en");
    assert.match(reply, /no upcoming/i);
    assert.match(reply, /Book/i);
  });

  it("askManageAction offers next step for selected visit", () => {
    const reply = BotPrompts.askManageAction("Dr Priya · Sept 28", "en");
    assert.match(reply, /Selected:/);
    assert.match(reply, /Dr Priya/);
    assert.match(reply, /What would you like to do/i);
  });

  it("askCancelConfirm prompts final confirmation", () => {
    const reply = BotPrompts.askCancelConfirm("Dr Priya · Sept 28", "en");
    assert.match(reply, /Cancel this booking/i);
    assert.match(reply, /Confirm Cancel/);
    assert.match(reply, /Keep Booking/);
  });

  it("cancellation receipt includes reference and released slot", () => {
    const reply = BotPrompts.canceledWithReason("schedule conflict", "en", {
      referenceId: "GG-A1B2C3D4",
      visitLabel: "Dr Priya · Sept 28, 11:00 AM",
    });
    assert.match(reply, /Cancellation receipt/i);
    assert.match(reply, /`GG-A1B2C3D4`/);
    assert.match(reply, /Dr Priya/);
    assert.match(reply, /schedule conflict/);
    assert.match(reply, /slot has been released/i);
  });

  it("rescheduled receipt includes reference and new time", () => {
    const reply = BotPrompts.rescheduled("Token #5 on 2026-09-30", "en", {
      referenceId: "GG-A1B2C3D4",
    });
    assert.match(reply, /Reschedule confirmed/i);
    assert.match(reply, /`GG-A1B2C3D4`/);
    assert.match(reply, /Token #5/);
  });

  it("rescheduleAskDate reuses date chip prompt", () => {
    const reply = BotPrompts.rescheduleAskDate("Dr Priya · Sept 28", "en");
    assert.match(reply, /Rescheduling/);
    assert.match(reply, /Today|Tomorrow|Dates/i);
  });

  it("structured Branch B steps skip LLM", () => {
    assert.equal(stepUsesLlm("awaiting_manage_booking"), false);
    assert.equal(stepUsesLlm("awaiting_manage_action"), false);
    assert.equal(stepUsesLlm("awaiting_cancel_confirm"), false);
    assert.equal(stepUsesLlm("awaiting_reschedule_slot"), false);
  });
});
