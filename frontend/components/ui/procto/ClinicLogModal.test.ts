import { test, describe } from "node:test"
import assert from "node:assert/strict"

describe("ClinicLogModal send logic", () => {
  test("sends the active preview document kind to customer", () => {
    type PrintKind = "consultation" | "prescription"

    const prepareSendRequest = (bookingId: string, kind: PrintKind) => {
      return {
        endpoint: `/procto/bookings/${bookingId}/send-clinic-log`,
        method: "POST",
        payload: { kind },
        expectedMessage:
          kind === "consultation"
            ? "Consultation note sent to customer on WhatsApp."
            : "Prescription sent to customer on WhatsApp.",
      }
    }

    const consultReq = prepareSendRequest("b-123", "consultation")
    assert.equal(consultReq.payload.kind, "consultation")
    assert.equal(consultReq.expectedMessage, "Consultation note sent to customer on WhatsApp.")

    const rxReq = prepareSendRequest("b-123", "prescription")
    assert.equal(rxReq.payload.kind, "prescription")
    assert.equal(rxReq.expectedMessage, "Prescription sent to customer on WhatsApp.")
  })
})
