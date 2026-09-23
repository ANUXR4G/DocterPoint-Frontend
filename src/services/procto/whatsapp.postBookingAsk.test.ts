import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";

describe("postBookingAsk multi-booking", () => {
  it("lists a single visit", () => {
    const msg = BotPrompts.postBookingAsk("City Clinic", "Dr Priya · Mon 10am", "en");
    assert.match(msg, /already have a booking/i);
    assert.match(msg, /Dr Priya · Mon 10am/);
    assert.doesNotMatch(msg, /2 bookings/i);
  });

  it("lists every upcoming visit when there are several", () => {
    const msg = BotPrompts.postBookingAsk(
      "City Clinic",
      ["Dr Priya · Mon 10am", "Dr Amit · Tue 3pm"],
      "en",
    );
    assert.match(msg, /\*2\* bookings/i);
    assert.match(msg, /1\. \*Dr Priya · Mon 10am\*/);
    assert.match(msg, /2\. \*Dr Amit · Tue 3pm\*/);
  });
});
