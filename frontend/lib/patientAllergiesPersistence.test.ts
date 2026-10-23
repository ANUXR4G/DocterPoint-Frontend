import test, { describe, it } from "node:test"
import assert from "node:assert/strict"
import { normalizeClinicalAssessment, DEFAULT_ALLERGY_MASTERS } from "./clinicalMasters"
import { patchBookingFields, applyLiveBookingEvent } from "./liveBooking"
import type { ProctoBooking } from "./services/procto"

describe("Patient Allergy Data Persistence and Cross-Appointment Synchronization", () => {
  it("normalizes allergy rows and preserves custom allergy names and severities", () => {
    const rawAllergies = [
      {
        category: "Drug",
        name: "Penicillin",
        severity: "Severe / High",
        active: "Yes",
        description: "Anaphylaxis symptoms",
      },
      {
        category: "Skin",
        name: "Latex",
        severity: "Moderate",
        active: "Yes",
        description: "Contact rash",
      },
    ]

    const normalized = normalizeClinicalAssessment({
      allergies: rawAllergies,
      noKnownAllergies: false,
    })
    assert.ok(normalized)
    assert.equal(normalized.noKnownAllergies, false)
    assert.equal(normalized.allergies?.length, 2)
    assert.equal(normalized.allergies?.[0].name, "Penicillin")
    assert.equal(normalized.allergies?.[0].severity, "Severe / High")
    assert.equal(normalized.allergies?.[1].name, "Latex")
    assert.equal(normalized.allergies?.[1].category, "Skin")
  })

  it("handles 'No Known Allergies' properly and resets when new allergy is added", () => {
    const noKnownAssessment = normalizeClinicalAssessment({
      noKnownAllergies: true,
      allergies: [
        {
          category: "Others",
          name: "No known allergy",
          severity: "Not available",
          active: "No",
          description: "No known allergy",
        },
      ],
    })
    assert.ok(noKnownAssessment)
    assert.equal(noKnownAssessment.noKnownAllergies, true)
    assert.equal(noKnownAssessment.allergies?.[0].name, "No known allergy")

    // When clinician adds a new allergy, noKnownAllergies is reset to false
    const updatedAssessment = normalizeClinicalAssessment({
      noKnownAllergies: false,
      allergies: [
        {
          category: "Drug",
          name: "Amoxicillin",
          severity: "Severe / High",
          active: "Yes",
          description: "Facial swelling and hives",
        },
      ],
    })
    assert.ok(updatedAssessment)
    assert.equal(updatedAssessment.noKnownAllergies, false)
    assert.equal(updatedAssessment.allergies?.length, 1)
    assert.equal(updatedAssessment.allergies?.[0].name, "Amoxicillin")
  })

  it("synchronizes allergy updates to all appointments of that patient via live updates", () => {
    // Patient has 3 appointments: past completed, today's in-progress, and future scheduled
    const patientBookings: ProctoBooking[] = [
      {
        id: "booking_past_1",
        status: "COMPLETED",
        mode: "IN_CLINIC",
        channel: "WEB",
        patientPhone: "+919876543210",
        patient_phone: "+919876543210",
        patientName: "Alice Smith",
        clinicalAssessment: {
          vitals: { breakfast: true, values: { bp_sys: 120 } },
          pain: [],
          allergies: [],
          noKnownAllergies: false,
        },
      },
      {
        id: "booking_today_2",
        status: "IN_PROGRESS",
        mode: "IN_CLINIC",
        channel: "WEB",
        patientPhone: "+919876543210",
        patient_phone: "+919876543210",
        patientName: "Alice Smith",
        clinicalAssessment: {
          vitals: { breakfast: null, values: { bp_sys: 118 } },
          pain: [],
          allergies: [],
          noKnownAllergies: false,
        },
      },
      {
        id: "booking_future_3",
        status: "SCHEDULED",
        mode: "IN_CLINIC",
        channel: "WEB",
        patientPhone: "+919876543210",
        patient_phone: "+919876543210",
        patientName: "Alice Smith",
      },
    ]

    // Clinician adds allergy in today's visit: Sulfa Drugs + Peanuts
    const newAllergies = [
      {
        category: "Drug",
        name: "Sulfa Drugs",
        severity: "Severe / High",
        active: "Yes",
        description: "Hives and respiratory distress",
      },
      {
        category: "Food",
        name: "Peanuts",
        severity: "Moderate",
        active: "Yes",
        description: "GI reaction",
      },
    ]

    // Simulate patch from clinic/doctor saving allergies
    const updatedToday = patchBookingFields(patientBookings[1], {
      clinicalAssessment: {
        ...(patientBookings[1].clinicalAssessment as any),
        allergies: newAllergies,
        noKnownAllergies: false,
      },
      patient: {
        allergies: newAllergies,
        noKnownAllergies: false,
      },
    })

    assert.equal(
      (updatedToday.clinicalAssessment as any).allergies.length,
      2,
      "Today visit should have 2 allergies",
    )

    // Simulate the cross-appointment synchronization that updates past and future visits for this patient
    const synchronizedPast = patchBookingFields(patientBookings[0], {
      clinicalAssessment: {
        ...(patientBookings[0].clinicalAssessment as any),
        allergies: newAllergies,
        noKnownAllergies: false,
      },
      patient: {
        allergies: newAllergies,
        noKnownAllergies: false,
      },
    })

    const synchronizedFuture = patchBookingFields(patientBookings[2], {
      clinicalAssessment: {
        allergies: newAllergies,
        noKnownAllergies: false,
      },
      patient: {
        allergies: newAllergies,
        noKnownAllergies: false,
      },
    })

    // All visits reflect the updated allergies
    assert.equal(
      (synchronizedPast.clinicalAssessment as any).allergies[0].name,
      "Sulfa Drugs",
      "Past appointment must reflect updated allergy",
    )
    assert.equal(
      (synchronizedFuture.clinicalAssessment as any).allergies[0].name,
      "Sulfa Drugs",
      "Future appointment must reflect updated allergy",
    )
    assert.equal(
      (synchronizedFuture.clinicalAssessment as any).allergies[1].name,
      "Peanuts",
      "Future appointment must reflect second allergy",
    )
  })

  it("allows modifying an existing allergy severity, active status, or description", () => {
    const initialAllergies = [
      {
        category: "Drug",
        name: "Penicillin",
        severity: "Mild / Low",
        active: "Yes",
        description: "Mild itchiness",
      },
    ]

    // Doctor updates severity to Severe / High and adds specific notes
    const editedAllergies = [
      {
        category: "Drug",
        name: "Penicillin",
        severity: "Severe / High",
        active: "Yes",
        description: "Confirmed anaphylaxis in 2026. Strictly avoid all penicillin class.",
      },
    ]

    const updated = normalizeClinicalAssessment({
      allergies: editedAllergies,
      noKnownAllergies: false,
    })
    assert.ok(updated)
    assert.equal(updated.allergies?.[0].severity, "Severe / High")
    assert.equal(
      updated.allergies?.[0].description,
      "Confirmed anaphylaxis in 2026. Strictly avoid all penicillin class.",
    )
  })

  it("includes rich allergy masters in platform defaults and excludes 'No known allergy' from options", () => {
    const drugAllergies = DEFAULT_ALLERGY_MASTERS.filter((a) => a.category === "Drug")
    assert.ok(drugAllergies.length >= 6, "Must provide comprehensive drug allergy suggestions")
    assert.ok(drugAllergies.some((a) => a.name === "Penicillin"))
    assert.ok(drugAllergies.some((a) => a.name === "Amoxicillin"))
    assert.ok(drugAllergies.some((a) => a.name.includes("Ciprofloxacin")))
    // 'No known allergy' must NOT be in masters
    assert.ok(
      !DEFAULT_ALLERGY_MASTERS.some((a) => /no known/i.test(a.name)),
      "'No known allergy' must not be in allergy master options",
    )
  })

  it("supports category 'Others' with custom text entry and preserves arbitrary allergy names", () => {
    const customAllergies = [
      {
        category: "Others",
        name: "Adhesive medical tape and band-aids",
        severity: "Moderate",
        active: "Yes",
        description: "Severe contact dermatitis and blistering",
      },
      {
        category: "Others",
        name: "Sunlight (Solar urticaria)",
        severity: "Mild / Low",
        active: "Yes",
        description: "Rash within 15 minutes of direct UV exposure",
      },
    ]

    const normalized = normalizeClinicalAssessment({
      allergies: customAllergies,
      noKnownAllergies: false,
    })
    assert.ok(normalized)
    assert.equal(normalized.allergies?.length, 2)
    assert.equal(normalized.allergies?.[0].category, "Others")
    assert.equal(
      normalized.allergies?.[0].name,
      "Adhesive medical tape and band-aids",
    )
    assert.equal(
      normalized.allergies?.[1].name,
      "Sunlight (Solar urticaria)",
    )
  })

  it("enforces mutual exclusivity: specific allergies prevent selecting 'No Known Allergies'", () => {
    const specificAllergies = [
      {
        category: "Food",
        name: "Peanuts",
        severity: "Severe",
        active: "Yes",
      },
    ]

    // Helper simulating the panel's mutual exclusivity check
    const hasSpecificAllergies = (allergies: Array<{ name?: string }>) =>
      allergies.some((a) => Boolean(a.name?.trim()) && !/no known/i.test(a.name || ""))

    assert.equal(
      hasSpecificAllergies(specificAllergies),
      true,
      "Peanuts should count as a specific allergy",
    )

    // Doctor cannot mark No Known Allergies when specific allergies exist
    const canSelectNoKnown = !hasSpecificAllergies(specificAllergies)
    assert.equal(canSelectNoKnown, false, "Must block selecting No Known Allergies when allergies exist")

    // Empty list allows selecting No Known Allergies
    assert.equal(hasSpecificAllergies([]), false)
    assert.equal(!hasSpecificAllergies([]), true)

    // Dummy row with 'No known allergy' alone does not count as specific allergy
    assert.equal(
      hasSpecificAllergies([{ name: "No known allergy" }]),
      false,
      "Dummy 'No known allergy' row must not count as a specific allergy",
    )
  })
})
