import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isVisitDocumentMime } from "./whatsapp.visitDocs.js";

describe("isVisitDocumentMime", () => {
  it("accepts common image and pdf mime types", () => {
    assert.equal(isVisitDocumentMime("image/jpeg"), true);
    assert.equal(isVisitDocumentMime("image/png"), true);
    assert.equal(isVisitDocumentMime("application/pdf"), true);
  });

  it("accepts PDF labeled as octet-stream when filename or magic matches", () => {
    assert.equal(
      isVisitDocumentMime("application/octet-stream", {
        filename: "lab-report.pdf",
      }),
      true,
    );
    const pdfMagic = Buffer.from("%PDF-1.4 fake");
    assert.equal(
      isVisitDocumentMime("application/octet-stream", { buffer: pdfMagic }),
      true,
    );
  });

  it("rejects unknown binary without hints", () => {
    assert.equal(isVisitDocumentMime("application/octet-stream"), false);
    assert.equal(isVisitDocumentMime("video/mp4"), false);
  });
});
