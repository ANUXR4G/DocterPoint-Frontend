import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  exactMenuIntent,
  menuNumberShortcut,
  stepUsesLlm,
} from "./whatsapp.nlu.js";

describe("Branch E message to doctor", () => {
  it("menu option 5 maps to message_doctor", () => {
    assert.equal(menuNumberShortcut("5"), "message_doctor");
    assert.equal(menuNumberShortcut("menu:message_doctor"), "message_doctor");
    assert.equal(exactMenuIntent("Message doctor"), "message_doctor");
    assert.equal(exactMenuIntent("Message your doctor"), "message_doctor");
  });

  it("askMessageDoctorText names the doctor", () => {
    const reply = BotPrompts.askMessageDoctorText("Priya Sharma", "en");
    assert.match(reply, /Please type the message you'd like to send/i);
    assert.match(reply, /appointment with \*Dr\. Priya Sharma\*/i);
  });

  it("askMessageDoctorText keeps existing Dr. prefix", () => {
    const reply = BotPrompts.askMessageDoctorText("Dr. Lee", "en");
    assert.match(reply, /Dr\. Lee/);
    assert.doesNotMatch(reply, /Dr\. Dr\./);
  });

  it("askMessageDoctorAdmin collects message for Admin assignment", () => {
    const reply = BotPrompts.askMessageDoctorAdmin("en");
    assert.match(reply, /No active appointment/i);
    assert.match(reply, /message/i);
    assert.match(reply, /admin|assign/i);
  });

  it("messageDoctorDelivered confirms delivery to medical team", () => {
    assert.equal(
      BotPrompts.messageDoctorDelivered("en"),
      "Your message has been delivered to the medical team.",
    );
  });

  it("structured Branch E steps skip LLM", () => {
    assert.equal(stepUsesLlm("awaiting_message_doctor_booking"), false);
    assert.equal(stepUsesLlm("awaiting_message_doctor_text"), false);
  });
});
