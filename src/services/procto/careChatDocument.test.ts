import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  documentMimeFor,
  isClinicDocumentUrl,
} from "../chat.whatsappFanout.js";

describe("Care chat document share", () => {
  it("only accepts files from the clinic Cloudinary account", () => {
    assert.equal(
      isClinicDocumentUrl(
        "https://res.cloudinary.com/dwhlynqj3/image/upload/v1/report-abc.pdf",
      ),
      true,
    );
    assert.equal(
      isClinicDocumentUrl("http://res.cloudinary.com/dwhlynqj3/image/upload/a.pdf"),
      false,
    );
    assert.equal(
      isClinicDocumentUrl("https://res.cloudinary.com/someoneelse/image/upload/a.pdf"),
      false,
    );
    assert.equal(isClinicDocumentUrl("https://169.254.169.254/latest/meta-data"), false);
    assert.equal(
      isClinicDocumentUrl("https://res.cloudinary.com.evil.test/dwhlynqj3/a.pdf"),
      false,
    );
    assert.equal(isClinicDocumentUrl("not a url"), false);
  });

  it("picks a WhatsApp mime type from the header, then the file name", () => {
    assert.equal(documentMimeFor("x.bin", "image/png; charset=binary"), "image/png");
    assert.equal(documentMimeFor("Lab report.PDF", "application/octet-stream"), "application/pdf");
    assert.equal(documentMimeFor("scan.jpeg", null), "image/jpeg");
    assert.equal(documentMimeFor("scan.webp", ""), "image/webp");
  });
});
