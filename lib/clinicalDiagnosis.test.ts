import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { consultationModel, type ConsultBooking } from "./consultationPdf"
import { prescriptionModel } from "./prescriptionPdf"

describe("Consultation and Prescription Diagnosis", () => {
  test("does not fallback to EMERGENCY_WALK_IN consultationType for diagnosis", () => {
    const booking: ConsultBooking = {
      id: "booking-walkin-1",
      patientName: "Ramesh Kumar",
      consultationType: "EMERGENCY_WALK_IN",
      disease: "Severe abdominal pain",
      clinicalAssessment: null,
      medicines: [],
    }

    const consult = consultationModel(booking)
    assert.equal(consult.diagnosis, "", "Consultation diagnosis should be empty, not EMERGENCY_WALK_IN")

    const rx = prescriptionModel(booking)
    assert.equal(rx.diagnosis, "", "Prescription diagnosis should be empty, not EMERGENCY_WALK_IN")
  })

  test("correctly reflects entered clinical diagnosis", () => {
    const booking: ConsultBooking = {
      id: "booking-walkin-2",
      patientName: "Sita Sharma",
      consultationType: "EMERGENCY_WALK_IN",
      disease: "High fever",
      clinicalAssessment: {
        diagnosis: "Dengue Fever - Mild",
      },
      medicines: [],
    }

    const consult = consultationModel(booking)
    assert.equal(consult.diagnosis, "Dengue Fever - Mild")

    const rx = prescriptionModel(booking)
    assert.equal(rx.diagnosis, "Dengue Fever - Mild")
  })
})
