import test, { describe, it } from "node:test"
import assert from "node:assert/strict"
import { patchBookingFields, applyLiveBookingEvent } from "./liveBooking"
import type { ProctoBooking } from "./services/procto"

describe("Patient Dashboard Real-Time Clinical Data Reflection", () => {
  it("patchBookingFields preserves clinical assessment, medicines, doctor notes, and documents from doctor/clinic", () => {
    const existingBooking: ProctoBooking = {
      id: "booking_123",
      status: "ACCEPTED",
      mode: "IN_CLINIC",
      channel: "WEB",
      patientName: "Jane Doe",
      patientPhone: "+919876543210",
      patient_phone: "+919876543210",
    }

    const doctorUpdatedPayload = {
      id: "booking_123",
      status: "COMPLETED",
      doctor_remarks: "Patient showing good recovery. Follow up in 30 days.",
      disease: "Type 2 Diabetes Mellitus",
      clinical_assessment: {
        diagnosis: "Type 2 Diabetes Mellitus - Controlled",
        advice: "Avoid sugary drinks and exercise 30 minutes daily.",
        vitals: {
          recordedAt: new Date().toISOString(),
          values: {
            bp_sys: 120,
            bp_dia: 80,
            pr: 72,
            spo2: 98,
            rbs: 110,
            wt: 68,
          },
        },
      },
      medicines: [
        {
          name: "Metformin 500mg",
          strength: "500mg",
          route: "Oral",
          dose: "1",
          doseUnit: "tablet",
          frequency: "Twice daily",
          duration: "30",
          durationUnit: "Day",
          instruction: "Take strictly after food with water",
        },
        {
          name: "Glimepiride 1mg",
          strength: "1mg",
          route: "Oral",
          dose: "1",
          doseUnit: "tablet",
          frequency: "Once daily",
          duration: "30",
          durationUnit: "Day",
          instruction: "Take 30 minutes before breakfast",
        },
      ],
      documents: [
        {
          name: "HbA1c_Lab_Report.pdf",
          url: "https://example.com/hba1c.pdf",
        },
      ],
    }

    const patched = patchBookingFields(existingBooking, doctorUpdatedPayload)

    assert.equal(patched.status, "COMPLETED")
    assert.equal(patched.doctorRemarks, "Patient showing good recovery. Follow up in 30 days.")
    assert.equal(patched.disease, "Type 2 Diabetes Mellitus")
    assert.ok(patched.medicines && patched.medicines.length === 2)
    assert.equal(patched.medicines[0].name, "Metformin 500mg")
    assert.equal(patched.medicines[0].instruction, "Take strictly after food with water")
    assert.ok(patched.documents && patched.documents.length === 1)
    assert.equal(patched.documents[0].name, "HbA1c_Lab_Report.pdf")

    const chart = (patched as any).clinicalAssessment
    assert.ok(chart, "Clinical assessment must be patched onto booking")
    assert.equal(chart.diagnosis, "Type 2 Diabetes Mellitus - Controlled")
    assert.equal(chart.advice, "Avoid sugary drinks and exercise 30 minutes daily.")
    assert.equal(chart.vitals?.values?.bp_sys, 120)
    assert.equal(chart.vitals?.values?.rbs, 110)
  })

  it("applyLiveBookingEvent immediately applies live socket updates into patient booking list", () => {
    const list: ProctoBooking[] = [
      {
        id: "b_1",
        status: "WAITING",
        mode: "IN_CLINIC",
        channel: "WEB",
        patient_phone: "+919876543210",
      },
      {
        id: "b_2",
        status: "SCHEDULED",
        mode: "IN_CLINIC",
        channel: "WEB",
        patient_phone: "+919876543210",
      },
    ]

    const liveDoctorEvent = {
      id: "b_1",
      status: "IN_PROGRESS",
      doctor_remarks: "Examining patient vitals.",
      medicines: [
        {
          name: "Paracetamol 650mg",
          dose: "1",
          frequency: "Three times daily",
          duration: "3",
        },
      ],
    }

    const { next, needsRefresh } = applyLiveBookingEvent(list, "booking_updated", liveDoctorEvent)

    assert.equal(needsRefresh, false)
    assert.equal(next.length, 2)
    const target = next.find((b) => b.id === "b_1")
    assert.ok(target)
    assert.equal(target.status, "IN_PROGRESS")
    assert.equal(target.doctorRemarks, "Examining patient vitals.")
    assert.ok(Array.isArray(target.medicines) && target.medicines.length === 1)
    assert.equal(target.medicines[0].name, "Paracetamol 650mg")
  })
})
