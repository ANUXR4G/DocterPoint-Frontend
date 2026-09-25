import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import {
  exactMenuIntent,
  menuNumberShortcut,
  stepUsesLlm,
} from "./whatsapp.nlu.js";

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

  it("askLinkDocumentToAppointment offers linking choice", () => {
    assert.match(
      BotPrompts.askLinkDocumentToAppointment("en"),
      /link this document to an upcoming appointment/i,
    );
  });

  it("confirm copy says Document received and saved to your record", () => {
    const visit = BotPrompts.visitDocAttached({
      name: "lab.pdf",
      count: 1,
      max: 5,
      whenLabel: "Tomorrow 10:00",
      lang: "en",
    });
    assert.match(visit, /Document received and saved to your record/i);

    const general = BotPrompts.documentSavedGeneral({
      name: "insurance.jpg",
      lang: "en",
    });
    assert.match(general, /Document received and saved to your record/i);
    assert.match(general, /general document/i);
  });

  it("structured Branch F steps skip LLM", () => {
    assert.equal(stepUsesLlm("awaiting_document_upload"), false);
    assert.equal(stepUsesLlm("awaiting_document_link"), false);
    assert.equal(stepUsesLlm("awaiting_report_booking"), false);
  });
});
