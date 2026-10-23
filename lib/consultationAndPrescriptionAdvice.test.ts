import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { consultationModel } from "./consultationPdf"
import { prescriptionModel } from "./prescriptionPdf"

describe("Consultation and Prescription Advice Rendering", () => {
  test("consultationModel extracts advice from clinicalAssessment object", () => {
    const booking = {
      id: "book-123",
      patientName: "Jane Doe",
      clinicalAssessment: {
        diagnosis: "Type 2 Diabetes Mellitus",
        advice: "1. Take metformin with meals\n2. Walk 30 minutes daily\n3. Reduce sugary snacks",
      },
    }

    const model = consultationModel(booking)
    assert.equal(
      model.advice,
      "1. Take metformin with meals\n2. Walk 30 minutes daily\n3. Reduce sugary snacks",
    )
    assert.equal(model.diagnosis, "Type 2 Diabetes Mellitus")
  })

  test("consultationModel extracts advice from JSON-stringified clinicalAssessment", () => {
    const booking = {
      id: "book-456",
      patientName: "John Smith",
      clinicalAssessment: JSON.stringify({
        diagnosis: "Hypertension",
        advice: "Drink plenty of water and reduce sodium intake.",
      }),
    }

    const model = consultationModel(booking)
    assert.equal(model.advice, "Drink plenty of water and reduce sodium intake.")
    assert.equal(model.diagnosis, "Hypertension")
  })

  test("prescriptionModel formats advice as bulleted lines from clinicalAssessment", () => {
    const booking = {
      id: "book-789",
      patientName: "Alice Walker",
      clinicalAssessment: {
        diagnosis: "Upper Respiratory Tract Infection",
        advice: "Steam inhalation twice daily\nWarm salt water gargle\nRest for 3 days",
      },
      medicines: [
        {
          name: "Azithromycin 500mg",
          dose: "1",
          doseUnit: "tab",
          duration: "3",
          durationUnit: "days",
        },
      ],
    }

    const rx = prescriptionModel(booking)
    assert.equal(rx.advice.length, 3)
    assert.equal(rx.advice[0], "* Steam inhalation twice daily")
    assert.equal(rx.advice[1], "* Warm salt water gargle")
    assert.equal(rx.advice[2], "* Rest for 3 days")
  })

  test("handles empty advice gracefully", () => {
    const booking = {
      id: "book-empty",
      patientName: "Bob Brown",
      clinicalAssessment: null,
    }

    const model = consultationModel(booking)
    assert.equal(model.advice, "")

    const rx = prescriptionModel(booking)
    assert.deepEqual(rx.advice, [])
  })
})
