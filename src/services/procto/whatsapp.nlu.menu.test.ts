import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exactMenuIntent,
  menuNumberShortcut,
} from "./whatsapp.nlu.js";

describe("menuNumberShortcut", () => {
  it("maps 1–9 to help-menu actions", () => {
    assert.equal(menuNumberShortcut("1"), "book");
    assert.equal(menuNumberShortcut("2"), "doctors");
    assert.equal(menuNumberShortcut("3"), "status");
    assert.equal(menuNumberShortcut("4"), "register");
    assert.equal(menuNumberShortcut("5"), "faq");
    assert.equal(menuNumberShortcut("6"), "cancel");
    assert.equal(menuNumberShortcut("7"), "reschedule");
    assert.equal(menuNumberShortcut("8"), "language");
    assert.equal(menuNumberShortcut("9"), "report");
  });

  it("accepts dotted / emoji-keycap forms", () => {
    assert.equal(menuNumberShortcut("1."), "book");
    assert.equal(menuNumberShortcut("3)"), "status");
    assert.equal(menuNumberShortcut("option 2"), "doctors");
    assert.equal(menuNumberShortcut("1️⃣"), "book");
  });

  it("ignores multi-digit and free text", () => {
    assert.equal(menuNumberShortcut("10"), null);
    assert.equal(menuNumberShortcut("book"), null);
    assert.equal(menuNumberShortcut(""), null);
  });
});

describe("exactMenuIntent", () => {
  it("still matches keywords (not digits)", () => {
    assert.equal(exactMenuIntent("BOOK"), "book");
    assert.equal(exactMenuIntent("1"), null);
  });
});
