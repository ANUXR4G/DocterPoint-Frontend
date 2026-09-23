import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  exactMenuIntent,
  menuNumberShortcut,
  postBookingNumberShortcut,
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

  it("maps interactive menu list row ids", () => {
    assert.equal(menuNumberShortcut("menu:book"), "book");
    assert.equal(menuNumberShortcut("menu:doctors"), "doctors");
    assert.equal(menuNumberShortcut("menu:language"), "language");
    assert.equal(menuNumberShortcut("menu:report"), "report");
    assert.equal(menuNumberShortcut("menu:help"), "help");
  });
});

describe("exactMenuIntent", () => {
  it("still matches keywords (not digits)", () => {
    assert.equal(exactMenuIntent("BOOK"), "book");
    assert.equal(exactMenuIntent("1"), null);
  });

  it("maps post-booking titles typed as free text", () => {
    assert.equal(exactMenuIntent("New booking"), "book");
    assert.equal(exactMenuIntent("new book"), "book");
    assert.equal(exactMenuIntent("3 · New booking"), "book");
    assert.equal(exactMenuIntent("book another"), "book");
    assert.equal(exactMenuIntent("Message your doctor"), "message_doctor");
  });

  it("maps main menu / menu to help", () => {
    assert.equal(exactMenuIntent("menu"), "help");
    assert.equal(exactMenuIntent("Main menu"), "help");
    assert.equal(exactMenuIntent("main menu"), "help");
    assert.equal(exactMenuIntent("MAIN MENU"), "help");
    assert.equal(exactMenuIntent("show menu"), "help");
    assert.equal(exactMenuIntent("main\u00a0menu"), "help");
  });

  it("maps attach report phrases", () => {
    assert.equal(exactMenuIntent("report"), "report");
    assert.equal(exactMenuIntent("attach report"), "report");
    assert.equal(exactMenuIntent("attach document"), "report");
    assert.equal(exactMenuIntent("send report"), "report");
    assert.equal(exactMenuIntent("9 · Report"), "report");
    assert.equal(exactMenuIntent("9 · Attach doc"), "report");
  });
});

describe("postBookingNumberShortcut", () => {
  it("maps 1–5 and post: ids", () => {
    assert.equal(postBookingNumberShortcut("1"), "reschedule");
    assert.equal(postBookingNumberShortcut("2"), "cancel");
    assert.equal(postBookingNumberShortcut("3"), "book");
    assert.equal(postBookingNumberShortcut("4"), "message_doctor");
    assert.equal(postBookingNumberShortcut("5"), "report");
    assert.equal(postBookingNumberShortcut("post:book"), "book");
    assert.equal(postBookingNumberShortcut("post:new_book"), "book");
    assert.equal(postBookingNumberShortcut("post:report"), "report");
  });

  it("maps typed New booking / menu titles", () => {
    assert.equal(postBookingNumberShortcut("New booking"), "book");
    assert.equal(postBookingNumberShortcut("3 · New booking"), "book");
    assert.equal(postBookingNumberShortcut("Reschedule"), "reschedule");
    assert.equal(postBookingNumberShortcut("Cancel"), "cancel");
    assert.equal(postBookingNumberShortcut("Message doctor"), "message_doctor");
    assert.equal(postBookingNumberShortcut("5 · Report"), "report");
    assert.equal(postBookingNumberShortcut("5 · Attach doc"), "report");
    assert.equal(postBookingNumberShortcut("Report"), "report");
    assert.equal(postBookingNumberShortcut("Attach doc"), "report");
  });
});
