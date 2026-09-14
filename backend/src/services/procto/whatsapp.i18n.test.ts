import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  askPreferredLanguage,
  parseLanguageChoice,
  wantsLanguageChange,
} from "./whatsapp.i18n.js";

describe("whatsapp language choice", () => {
  it("does not treat bare hi/hello as Hindi", () => {
    assert.equal(parseLanguageChoice("hi"), null);
    assert.equal(parseLanguageChoice("Hi"), null);
    assert.equal(parseLanguageChoice("hello"), null);
    assert.equal(parseLanguageChoice("hey"), null);
  });

  it("accepts english and hindi choices", () => {
    assert.equal(parseLanguageChoice("1"), "en");
    assert.equal(parseLanguageChoice("english"), "en");
    assert.equal(parseLanguageChoice("2"), "hi");
    assert.equal(parseLanguageChoice("hindi"), "hi");
    assert.equal(parseLanguageChoice("hin"), "hi");
    assert.equal(parseLanguageChoice("हिंदी"), "hi");
  });

  it("detects language change commands", () => {
    assert.equal(wantsLanguageChange("LANGUAGE"), true);
    assert.equal(wantsLanguageChange("भाषा"), true);
    assert.equal(wantsLanguageChange("hi"), false);
  });

  it("asks language in bilingual prompt", () => {
    const prompt = askPreferredLanguage();
    assert.match(prompt, /preferred language/i);
    assert.match(prompt, /भाषा/);
    assert.match(prompt, /1\. English/);
    assert.match(prompt, /2\./);
  });
});
