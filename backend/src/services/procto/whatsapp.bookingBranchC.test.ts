import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  parseFamilyDobAndId,
  parseRelationshipChoice,
} from "./whatsapp.familyParse.js";
import { stepUsesLlm } from "./whatsapp.nlu.js";

describe("Branch C family member registration", () => {
  it("askRegisterFamilyName asks for full name or ID document", () => {
    const reply = BotPrompts.askRegisterFamilyName("en");
    assert.match(reply, /full name.*family member/i);
    assert.match(reply, /photo or PDF/i);
    assert.match(reply, /Aadhaar|PAN|ID/i);
    assert.doesNotMatch(reply, /already registered/i);
  });

  it("askRegisterFamilyName includes already-registered notice when primary exists", () => {
    const reply = BotPrompts.askRegisterFamilyName("en", "Anurag Nanda");
    assert.match(reply, /already registered.*Anurag Nanda/i);
    assert.match(reply, /full name.*family member/i);
    assert.match(reply, /photo or PDF/i);
  });

  it("askRegisterFamilyRelationship offers Spouse/Child/Parent cue", () => {
    const reply = BotPrompts.askRegisterFamilyRelationship("en");
    assert.match(reply, /relationship/i);
    assert.match(reply, /Spouse/);
    assert.match(reply, /Child/);
    assert.match(reply, /Parent/);
  });

  it("askRegisterFamilyDobAndId asks for DOB and Emirates/National ID", () => {
    const reply = BotPrompts.askRegisterFamilyDobAndId("en");
    assert.match(reply, /Date of Birth/i);
    assert.match(reply, /DD\/MM\/YYYY/);
    assert.match(reply, /Emirates ID|National ID/i);
  });

  it("askRegisterFamilyGender prompts dependent gender", () => {
    assert.match(
      BotPrompts.askRegisterFamilyGender("en"),
      /family member's gender/i,
    );
  });

  it("familyRegistered confirms success under profile", () => {
    const reply = BotPrompts.familyRegistered("Aisha", "en", "Child");
    assert.match(reply, /Family member added successfully/i);
    assert.match(reply, /Aisha/);
    assert.match(reply, /Child/);
    assert.match(reply, /under your profile/i);
  });

  it("parseFamilyDobAndId extracts DD/MM/YYYY and Emirates ID", () => {
    const parsed = parseFamilyDobAndId("15/08/2015 784-1990-1234567-1");
    assert.equal(parsed.dob, "2015-08-15");
    assert.equal(parsed.nationalId, "784199012345671");
  });

  it("parseFamilyDobAndId accepts Aadhaar-style 12 digits", () => {
    const parsed = parseFamilyDobAndId("DOB 01-03-2010 ID 123456789012");
    assert.equal(parsed.dob, "2010-03-01");
    assert.equal(parsed.nationalId, "123456789012");
  });

  it("parseRelationshipChoice maps buttons and synonyms", () => {
    assert.equal(parseRelationshipChoice("rel:spouse"), "Spouse");
    assert.equal(parseRelationshipChoice("son"), "Child");
    assert.equal(parseRelationshipChoice("Mother"), "Parent");
    assert.equal(parseRelationshipChoice("Guardian"), "Guardian");
  });

  it("structured Branch C steps skip LLM", () => {
    assert.equal(stepUsesLlm("awaiting_register_relationship"), false);
    assert.equal(stepUsesLlm("awaiting_register_family_details"), false);
  });
});
