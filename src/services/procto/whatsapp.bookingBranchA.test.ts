import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import { stepUsesLlm } from "./whatsapp.nlu.js";

describe("Branch A booking prompts", () => {
  it("askBookWhom offers Self with name and Family member", () => {
    const reply = BotPrompts.askBookWhom("Anurag Nanda", "en");
    assert.match(reply, /Whom is this appointment for/i);
    assert.match(reply, /Self \(\*Anurag Nanda\*\)/);
    assert.match(reply, /Family member \/ dependent/i);
  });

  it("askBookWhom without name still offers Self", () => {
    const reply = BotPrompts.askBookWhom(null, "en");
    assert.match(reply, /• Self\n/);
    assert.match(reply, /Family member \/ dependent/i);
  });

  it("needRegisterThenBook asks for self ID or details", () => {
    const reply = BotPrompts.needRegisterThenBook("en");
    assert.match(reply, /yourself/i);
    assert.match(reply, /Aadhaar|PAN|ID/i);
    assert.match(reply, /full name/i);
    assert.match(reply, /date of birth/i);
    assert.match(reply, /gender/i);
  });

  it("askRegisterDob prompts DD/MM/YYYY for self typed path", () => {
    const reply = BotPrompts.askRegisterDob("en");
    assert.match(reply, /Date of Birth/i);
    assert.match(reply, /DD\/MM\/YYYY/);
  });

  it("needRegisterDependentThenBook asks for dependent ID or details", () => {
    const reply = BotPrompts.needRegisterDependentThenBook("en");
    assert.match(reply, /family member|dependent/i);
    assert.match(reply, /Aadhaar|PAN|ID/i);
  });

  it("askSpecialty lists departments with Departments list cue", () => {
    const reply = BotPrompts.askSpecialty(
      [
        { index: 1, label: "General Medicine" },
        { index: 2, label: "Cardiology" },
        { index: 3, label: "Pediatrics" },
      ],
      "en",
    );
    assert.match(reply, /department \/ specialty/i);
    assert.match(reply, /1\. General Medicine/);
    assert.match(reply, /2\. Cardiology/);
    assert.match(reply, /3\. Pediatrics/);
    assert.match(reply, /Departments/);
  });

  it("askDate mentions Today / Tomorrow / Select Date", () => {
    const reply = BotPrompts.askDate("en");
    assert.match(reply, /Today/i);
    assert.match(reply, /Tomorrow/i);
    assert.match(reply, /Select Date/i);
  });

  it("doctorSelectedAskDate includes date prompt", () => {
    const reply = BotPrompts.doctorSelectedAskDate("Dr Mehta", "2026-09-26", "en");
    assert.match(reply, /Dr Mehta/);
    assert.match(reply, /Which date/i);
    assert.match(reply, /2026-09-26/);
  });

  it("bookingSummary lists patient, doctor, date/time, location", () => {
    const reply = BotPrompts.bookingSummary(
      {
        patient: "Satheesh Kumar",
        doctor: "Dr. Priya Nair",
        dateTime: "Sept 28, 2026 at 11:00 AM",
        location: "Main Clinic, Abu Dhabi",
      },
      "en",
    );
    assert.match(reply, /\*Appointment details\*/i);
    assert.match(reply, /• Patient: Satheesh Kumar/);
    assert.match(reply, /• Doctor: Dr\. Priya Nair/);
    assert.match(reply, /• Date & Time: Sept 28, 2026 at 11:00 AM/);
    assert.match(reply, /• Location: Main Clinic, Abu Dhabi/);
    assert.match(reply, /Tap a button below/i);
  });

  it("changeBookingDetails acknowledges edit", () => {
    assert.match(BotPrompts.changeBookingDetails("en"), /update the appointment/i);
  });

  it("structured Branch A steps skip LLM", () => {
    assert.equal(stepUsesLlm("awaiting_book_whom"), false);
    assert.equal(stepUsesLlm("awaiting_specialty"), false);
    assert.equal(stepUsesLlm("awaiting_book_patient"), false);
    assert.equal(stepUsesLlm("awaiting_provider"), false);
    assert.equal(stepUsesLlm("awaiting_date"), false);
    assert.equal(stepUsesLlm("awaiting_confirm"), false);
  });
});
