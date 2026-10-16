import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPrescriptionPdf, prescriptionFileName } from "./prescriptionPdf.js";

describe("prescription PDF", () => {
  test("file name is a pdf", () => {
    assert.equal(prescriptionFileName("Priya Nair"), "Prescription-Priya-Nair.pdf");
  });

  test("builds a PDF document, not a text body", async () => {
    const bytes = await buildPrescriptionPdf({
      clinicName: "City Care",
      address: "12 MG Road, Bengaluru",
      phone: "9990052082",
      patientName: "Asha Rao",
      patientPhone: "9999973601",
      mrn: "CCMR0001",
      doctorName: "Dr. Priya Nair",
      appointment: "16/10/2026 8:30 pm",
      chiefComplaint: "Fever",
      diagnosis: "Viral fever",
      allergies: ["Allergy : Food : Eggs"],
      vitalLine: "Temp (deg): 99, BP: 120/80 mmHg",
      remarks: "Rest and fluids",
      medicines: [
        {
          name: "Amoxylin",
          amount: "500 mg",
          frequency: "Twice daily",
          duration: "5",
          durationUnit: "Day",
        },
      ],
    });
    const header = Buffer.from(bytes.subarray(0, 5)).toString("utf8");
    assert.equal(header, "%PDF-");
    assert.ok(bytes.byteLength > 800);
  });
});
