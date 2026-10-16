import { readFileSync } from "node:fs";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingStatus } from "@prisma/client";
import { explicitClinicLogTemplate } from "./clinicLogSend.js";

describe("explicitClinicLogTemplate", () => {
  test("open visits are allowed to send", () => {
    assert.equal(
      explicitClinicLogTemplate(BookingStatus.IN_PROGRESS),
      "PRESCRIPTION_UPDATE",
    );
    assert.equal(
      explicitClinicLogTemplate(BookingStatus.WAITING),
      "PRESCRIPTION_UPDATE",
    );
    assert.equal(
      explicitClinicLogTemplate(BookingStatus.ACCEPTED),
      "PRESCRIPTION_UPDATE",
    );
  });

  test("a finished visit is allowed to send", () => {
    assert.equal(
      explicitClinicLogTemplate(BookingStatus.COMPLETED),
      "VISIT_SUMMARY",
    );
  });

  test("closed appointments cannot be sent", () => {
    assert.equal(explicitClinicLogTemplate(BookingStatus.CANCELED), null);
    assert.equal(explicitClinicLogTemplate(BookingStatus.NO_SHOW), null);
  });
});

describe("visit medicine save", () => {
  test("saving medicines does not enqueue a WhatsApp prescription", () => {
    const src = readFileSync(new URL("./booking.service.ts", import.meta.url), "utf8");
    const updateStart = src.indexOf("async updateVisit(");
    const updateEnd = src.indexOf("async resolveBookingPatientForDocs(");
    assert.ok(updateStart > 0 && updateEnd > updateStart);
    const saveBody = src.slice(updateStart, updateEnd);
    assert.equal(saveBody.includes("enqueuePrescriptionUpdate"), false);
    assert.equal(saveBody.includes("enqueueVisitSummary"), false);

    const sendStart = src.indexOf("async sendClinicLogWhatsApp(");
    const sendEnd = src.indexOf("async shareDocumentWithPatient(");
    assert.ok(sendStart > 0 && sendEnd > sendStart);
    const sendBody = src.slice(sendStart, sendEnd);
    assert.equal(sendBody.includes("enqueuePrescriptionUpdate"), false);
    assert.equal(sendBody.includes("enqueueVisitSummary"), false);
    assert.equal(sendBody.includes("sendClinicLogPdf"), true);
  });
});
