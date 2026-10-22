import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildConsultationPdf,
  consultationFileName,
  type ConsultBooking,
} from "./consultationPdf.js";

describe("consultation PDF", () => {
  test("generates valid PDF bytes and correct filename", async () => {
    const booking: ConsultBooking = {
      id: "test-booking-12345",
      patientName: "John Doe",
      patientPhone: "+919876543210",
      practice: {
        name: "Test Clinic",
        phone: "+919876543210",
        email: "clinic@example.com",
      },
      disease: "Fever and cough",
      clinicalAssessment: {
        diagnosis: "Viral Pharyngitis",
        advice: "Drink warm fluids and rest.",
        vitals: {
          values: {
            temp: 99.2,
            bp_sys: 120,
            bp_dia: 80,
            spo2: 98,
            pr: 78,
          },
        },
      },
      medicines: [
        {
          name: "Paracetamol 500mg",
          dose: "1",
          doseUnit: "tablet",
          frequency: "TDS",
          duration: "3",
          durationUnit: "days",
          instruction: "After food",
        },
      ],
    };

    const filename = consultationFileName("John Doe", booking.id);
    assert.ok(filename.endsWith(".pdf"));
    assert.ok(filename.includes("John-Doe"));

    const bytes = await buildConsultationPdf(booking);
    assert.ok(bytes instanceof Uint8Array);
    assert.ok(bytes.length > 100);
    // PDF magic bytes %PDF
    assert.equal(bytes[0], 0x25); // %
    assert.equal(bytes[1], 0x50); // P
    assert.equal(bytes[2], 0x44); // D
    assert.equal(bytes[3], 0x46); // F
  });
});

