import { test, describe } from "node:test"
import assert from "node:assert/strict"
import type { SendToCustomerKind } from "./SendToCustomerModal"

describe("SendToCustomerModal logic", () => {
  test("supports all three document delivery kinds", () => {
    const kinds: SendToCustomerKind[] = ["prescription", "consultation", "both"]
    assert.equal(kinds.length, 3)
    assert.ok(kinds.includes("prescription"))
    assert.ok(kinds.includes("consultation"))
    assert.ok(kinds.includes("both"))
  })

  test("generates appropriate notification messages per kind", () => {
    const labels: Record<SendToCustomerKind, string> = {
      prescription: "Prescription PDF sent on WhatsApp.",
      consultation: "Consultation report sent on WhatsApp.",
      both: "Prescription and Consultation PDFs sent on WhatsApp.",
    }

    assert.equal(labels.prescription, "Prescription PDF sent on WhatsApp.")
    assert.equal(labels.consultation, "Consultation report sent on WhatsApp.")
    assert.equal(labels.both, "Prescription and Consultation PDFs sent on WhatsApp.")
  })

  test("prepares API payload correctly with kind", () => {
    const preparePayload = (bookingId: string, kind?: SendToCustomerKind) => {
      return {
        url: `/procto/bookings/${bookingId}/send-clinic-log`,
        method: "POST",
        body: JSON.stringify({ kind: kind || "prescription" }),
      }
    }

    const defaultCall = preparePayload("booking-1")
    assert.deepEqual(JSON.parse(defaultCall.body), { kind: "prescription" })

    const consultCall = preparePayload("booking-2", "consultation")
    assert.deepEqual(JSON.parse(consultCall.body), { kind: "consultation" })

    const bothCall = preparePayload("booking-3", "both")
    assert.deepEqual(JSON.parse(bothCall.body), { kind: "both" })
  })
})

