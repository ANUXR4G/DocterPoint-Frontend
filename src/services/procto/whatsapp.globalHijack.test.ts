import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGlobalKeywordHijack } from "./whatsapp.hijacks.js";
import { BotPrompts } from "./whatsapp.templates.js";
import { exactMenuIntent } from "./whatsapp.nlu.js";

describe("Global keyword hijacks", () => {
  it("maps Register / Book / Attach triggers", () => {
    assert.equal(parseGlobalKeywordHijack("Register"), "register");
    assert.equal(parseGlobalKeywordHijack("registration"), "register");
    assert.equal(parseGlobalKeywordHijack("Book"), "book");
    assert.equal(parseGlobalKeywordHijack("booking"), "book");
    assert.equal(parseGlobalKeywordHijack("Attach"), "attach");
    assert.equal(parseGlobalKeywordHijack("attach document"), "attach");
  });

  it("maps voice/STT Book variants so mid-flow (e.g. docs) can abort", () => {
    assert.equal(parseGlobalKeywordHijack("Book."), "book");
    assert.equal(parseGlobalKeywordHijack("book!"), "book");
    assert.equal(parseGlobalKeywordHijack("book please"), "book");
    assert.equal(parseGlobalKeywordHijack("please book"), "book");
    assert.equal(parseGlobalKeywordHijack("book appointment"), "book");
    assert.equal(parseGlobalKeywordHijack("new booking"), "book");
    assert.equal(parseGlobalKeywordHijack("I want to book"), "book");
  });

  it("maps Main / Menu to main menu and Help / Agent to support", () => {
    assert.equal(parseGlobalKeywordHijack("Main"), "main_menu");
    assert.equal(parseGlobalKeywordHijack("Menu"), "main_menu");
    assert.equal(parseGlobalKeywordHijack("Help"), "agent");
    assert.equal(parseGlobalKeywordHijack("Agent"), "agent");
  });

  it("maps Exit and Cancel to session end", () => {
    assert.equal(parseGlobalKeywordHijack("Exit"), "exit");
    assert.equal(parseGlobalKeywordHijack("Cancel"), "exit");
    assert.equal(parseGlobalKeywordHijack("quit"), "exit");
  });

  it("does not treat cancel booking as Exit hijack", () => {
    assert.equal(parseGlobalKeywordHijack("cancel booking"), null);
    assert.equal(parseGlobalKeywordHijack("Cancel my appointment"), null);
    // Longer cancel phrases still map via menu intent to Branch B cancel
    assert.equal(exactMenuIntent("cancel"), "cancel");
  });

  it("maps CallBack variants", () => {
    assert.equal(parseGlobalKeywordHijack("CallBack"), "callback");
    assert.equal(parseGlobalKeywordHijack("callback"), "callback");
    assert.equal(parseGlobalKeywordHijack("call back"), "callback");
    assert.equal(parseGlobalKeywordHijack("request callback"), "callback");
  });

  it("ignores interactive ids and free sentences with dates", () => {
    assert.equal(parseGlobalKeywordHijack("menu:book"), null);
    assert.equal(parseGlobalKeywordHijack("cancel:yes"), null);
    assert.equal(parseGlobalKeywordHijack("doc:general"), null);
    assert.equal(
      parseGlobalKeywordHijack("I want to book tomorrow morning"),
      null,
    );
  });

  it("Exit reply matches product copy", () => {
    assert.equal(
      BotPrompts.sessionEnded("en"),
      "Session ended. Type 'Hi' anytime to start again.",
    );
  });

  it("CallBack reply matches product copy", () => {
    assert.equal(
      BotPrompts.callbackRequestLogged("en"),
      "We have logged your callback request. An admin representative will call you shortly.",
    );
  });
});
