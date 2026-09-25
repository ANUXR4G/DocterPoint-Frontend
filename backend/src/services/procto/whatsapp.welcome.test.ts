import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";

describe("BotPrompts.welcome entry greeting", () => {
  it("existing user — welcome back with name + menu", () => {
    const reply = BotPrompts.welcome("Ananya Clinic", "Anurag Nanda", "en");
    assert.match(reply, /Welcome back, \*Anurag Nanda\*!/i);
    assert.match(reply, /How can I assist you today\?/i);
    assert.match(reply, /\*Main menu\*/i);
    assert.match(reply, /1 · Book New Appointment/);
    assert.doesNotMatch(reply, /Welcome to \*Ananya Clinic\*/i);
  });

  it("new user — clinic intro + capabilities + menu", () => {
    const reply = BotPrompts.welcome("Ananya Clinic", null, "en");
    assert.match(reply, /Welcome to \*Ananya Clinic\*!/i);
    assert.match(reply, /schedule appointments/i);
    assert.match(reply, /contact your doctor/i);
    assert.match(reply, /attach documents/i);
    assert.match(reply, /manage your profile/i);
    assert.match(reply, /\*Main menu\*/i);
    assert.doesNotMatch(reply, /Welcome back/i);
  });

  it("known phone without name — welcome back without name", () => {
    const reply = BotPrompts.welcome("Ananya Clinic", "", "en");
    assert.match(reply, /^Welcome back! How can I assist you today\?/m);
    assert.match(reply, /\*Main menu\*/i);
    assert.doesNotMatch(reply, /Welcome to \*Ananya Clinic\*/i);
  });

  it("help reuses the same entry greeting", () => {
    assert.equal(
      BotPrompts.help("Ananya Clinic", "Riya", "en"),
      BotPrompts.welcome("Ananya Clinic", "Riya", "en"),
    );
    assert.equal(
      BotPrompts.help("Ananya Clinic", null, "en"),
      BotPrompts.welcome("Ananya Clinic", null, "en"),
    );
  });

  it("Hindi existing user welcome back", () => {
    const reply = BotPrompts.welcome("Ananya Clinic", "अनुराग", "hi");
    assert.match(reply, /वापसी पर स्वागत है, \*अनुराग\*!/);
    assert.match(reply, /\*मुख्य मेनू\*/);
  });
});
