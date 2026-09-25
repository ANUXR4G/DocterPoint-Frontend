import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  exactMenuIntent,
  menuNumberShortcut,
  stepUsesLlm,
} from "./whatsapp.nlu.js";

describe("Branch D talk to support / agent", () => {
  it("menu option 4 and support taps map to human intent", () => {
    assert.equal(menuNumberShortcut("4"), "human");
    assert.equal(menuNumberShortcut("menu:support"), "human");
    assert.equal(exactMenuIntent("Talk to support"), "human");
    assert.equal(exactMenuIntent("Talk to agent"), "human");
    assert.equal(exactMenuIntent("Support"), "human");
  });

  it("escalateReply / agentTransferConnecting matches product wording", () => {
    assert.equal(
      BotPrompts.agentTransferConnecting("en"),
      "Connecting you to an agent... A team member will reply shortly.",
    );
  });

  it("handedOffWait keeps patient in Agent Transfer", () => {
    const reply = BotPrompts.handedOffWait("en");
    assert.match(reply, /support|team member/i);
    assert.match(reply, /Menu|BOT/i);
  });

  it("main menu lists Talk to Support / Agent as option 4", () => {
    assert.match(
      BotPrompts.mainMenuOptions("en"),
      /4 · Talk to Support \/ Agent/,
    );
  });

  it("agent_transfer step skips LLM", () => {
    assert.equal(stepUsesLlm("agent_transfer"), false);
  });
});
