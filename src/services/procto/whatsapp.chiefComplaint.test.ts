import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import { shouldUseLlmForMessage, stepUsesLlm } from "./whatsapp.nlu.js";
import { guardOutbound, triggersOutboundGuard } from "./whatsapp.policy.js";

describe("booking chief complaint step", () => {
  it("asks for the complaint with text or voice note, naming a family member", () => {
    const en = BotPrompts.askChiefComplaint("Roopa Satheesh", "en");
    assert.match(en, /^What is \*Roopa Satheesh\*'s main problem for this visit/);
    assert.match(en, /chief complaint/i);
    assert.match(en, /\*type\*.*\*voice note\*/);
    assert.doesNotMatch(en, / {2}/);

    const self = BotPrompts.askChiefComplaint(null, "en");
    assert.match(self, /^What is your main problem for this visit/);

    const hi = BotPrompts.askChiefComplaint("Roopa", "hi");
    assert.match(hi, /मुख्य समस्या/);
    assert.match(hi, /वॉइस नोट/);
  });

  it("first asks Yes / No whether to add a chief complaint", () => {
    const en = BotPrompts.askChiefComplaintOpt("Roopa Satheesh", "en");
    assert.match(en, /^Would you like to add the \*chief complaint\*/);
    assert.match(en, /\*Roopa Satheesh\*'s visit/);
    assert.match(en, /Tap \*Yes\* or \*No\*/);
    assert.match(BotPrompts.askChiefComplaintOpt(null, "en"), /for your visit/);
    assert.match(BotPrompts.askChiefComplaintOpt("Roopa", "hi"), /मुख्य समस्या/);
    assert.equal(stepUsesLlm("awaiting_chief_complaint_opt"), false);
  });

  it("shows the complaint on the booking summary only when given", () => {
    const base = {
      patient: "Roopa",
      doctor: "Dr. Priya Nair",
      dateTime: "Mon 29 Sep at 10:30 AM",
      location: "Main clinic",
    };
    const withComplaint = BotPrompts.bookingSummary(
      { ...base, complaint: "Fever for 3 days" },
      "en",
    );
    assert.match(withComplaint, /• Chief complaint: Fever for 3 days\n/);
    assert.match(withComplaint, /Tap a button below to continue\./);

    const skipped = BotPrompts.bookingSummary({ ...base, complaint: "" }, "en");
    assert.doesNotMatch(skipped, /Chief complaint/);
    assert.match(skipped, /• Location: Main clinic\n\nTap a button/);

    const hi = BotPrompts.bookingSummary(
      { ...base, complaint: "3 दिन से बुखार" },
      "hi",
    );
    assert.match(hi, /• मुख्य समस्या: 3 दिन से बुखार/);
  });

  it("never sends the complaint through the LLM classifier (typed or voice)", () => {
    assert.equal(stepUsesLlm("awaiting_chief_complaint"), false);
    assert.equal(
      shouldUseLlmForMessage("awaiting_chief_complaint", "knee pain since last week", true),
      false,
    );
    assert.equal(
      shouldUseLlmForMessage("awaiting_chief_complaint", "fever and cough", false),
      false,
    );
  });

  it("detects complaints that would trip the outbound clinical guard", () => {
    assert.equal(triggersOutboundGuard("need diagnosis for thyroid"), true);
    assert.equal(triggersOutboundGuard("fever for 3 days"), false);
    const summary = BotPrompts.bookingSummary(
      {
        patient: "A",
        doctor: "B",
        dateTime: "C",
        location: "D",
        complaint: "Fever for 3 days",
      },
      "en",
    );
    assert.equal(guardOutbound(summary, "en"), summary);
  });
});
