import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  exactMenuIntent,
  menuNumberShortcut,
  stepUsesLlm,
} from "./whatsapp.nlu.js";
import { resolveBranchFDocTarget } from "./whatsapp.visitDocs.js";

describe("Branch F attach document", () => {
  it("menu option 6 maps to report/attach", () => {
    assert.equal(menuNumberShortcut("6"), "report");
    assert.equal(menuNumberShortcut("menu:report"), "report");
    assert.equal(exactMenuIntent("Attach document"), "report");
    assert.equal(exactMenuIntent("6 · Attach doc"), "report");
  });

  it("askAttachDocumentUpload asks for Lab Report / PDF / Photo", () => {
    const reply = BotPrompts.askAttachDocumentUpload("en");
    assert.equal(
      reply,
      "Please upload or attach your document (e.g., Lab Report, Insurance Card, ID, PDF, or Photo).",
    );
  });

  it("askDocumentKind names both choices before any upload", () => {
    const reply = BotPrompts.askDocumentKind("en");
    assert.match(reply, /Select Appointment/);
    assert.match(reply, /General Document/);
    assert.doesNotMatch(reply, /upload/i);
  });

  it("askGeneralDocumentUpload names whose record and says not linked", () => {
    assert.match(
      BotPrompts.askGeneralDocumentUpload("Rathul Satheesh", "en"),
      /\*Rathul Satheesh\*'s record \(not linked to any appointment\)/,
    );
    assert.match(BotPrompts.askGeneralDocumentUpload(undefined, "en"), /your record/);
  });

  it("askLinkDocumentToAppointment offers linking choice", () => {
    assert.match(
      BotPrompts.askLinkDocumentToAppointment("en"),
      /link this document to an upcoming appointment/i,
    );
  });

  it("confirm copy says Document received and saved to your record", () => {
    const visit = BotPrompts.visitDocAttached({
      name: "Lab.pdf",
      count: 1,
      whenLabel: "tomorrow 10:00 AM",
      lang: "en",
    });
    assert.match(visit, /Document received and saved to your record/i);

    const general = BotPrompts.documentSavedGeneral({
      name: "ID.pdf",
      lang: "en",
    });
    assert.match(general, /Document received and saved to your record/i);
    assert.match(general, /general document/i);
    assert.match(general, /not linked to any appointment/i);
  });

  it("structured Branch F steps skip LLM", () => {
    assert.equal(stepUsesLlm("awaiting_document_upload"), false);
    assert.equal(stepUsesLlm("awaiting_document_link"), false);
    assert.equal(stepUsesLlm("awaiting_report_booking"), false);
  });
});

describe("Branch F General Document never auto-attaches to a visit", () => {
  it("with one open booking and no preferred id → ask_link (not attach)", () => {
    assert.equal(
      resolveBranchFDocTarget({
        preferredBookingId: null,
        openBookingIds: ["booking-1"],
      }),
      "ask_link",
    );
  });

  it("with two open bookings and no preferred id → ask_link", () => {
    assert.equal(
      resolveBranchFDocTarget({
        openBookingIds: ["a", "b"],
      }),
      "ask_link",
    );
  });

  it("with no open bookings → general (patient record only)", () => {
    assert.equal(
      resolveBranchFDocTarget({
        preferredBookingId: "stale-id",
        openBookingIds: [],
      }),
      "general",
    );
  });

  it("preferred id must be an open booking to attach; stale id asks instead", () => {
    assert.equal(
      resolveBranchFDocTarget({
        preferredBookingId: "open-1",
        openBookingIds: ["open-1", "open-2"],
      }),
      "attach_preferred",
    );
    assert.equal(
      resolveBranchFDocTarget({
        preferredBookingId: "closed-old",
        openBookingIds: ["open-1"],
      }),
      "ask_link",
    );
  });
});

describe("Branch F button titles are bot commands (not care-chat)", () => {
  it("Select Appointment / General Document / doc: ids skip care chat", async () => {
    const { looksLikeBotCommand } = await import("../chat.whatsappInbound.js");
    assert.equal(looksLikeBotCommand("Select Appointment"), true);
    assert.equal(looksLikeBotCommand("General Document"), true);
    assert.equal(looksLikeBotCommand("doc:appointment"), true);
    assert.equal(looksLikeBotCommand("doc:general"), true);
    // Registration / main-menu reply titles that previously leaked
    assert.equal(looksLikeBotCommand("main"), true);
    assert.equal(looksLikeBotCommand("Main Menu"), true);
    assert.equal(looksLikeBotCommand("Female"), true);
    assert.equal(looksLikeBotCommand("Male"), true);
    assert.equal(looksLikeBotCommand("Others"), true);
  });
});
