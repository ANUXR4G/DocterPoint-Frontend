import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BotPrompts } from "./whatsapp.templates.js";
import { splitReplyForButtonCard } from "./whatsapp.service.js";

describe("booking confirm + attach document card", () => {
  const confirm = BotPrompts.bookingConfirmed(
    "Dr. Priya Nair Clinic",
    "Dr Priya Nair · Mon 29 Sep, 10:30 AM",
    "en",
    {
      referenceId: "PNC-8K2Q",
      googleCalendarUrl: `https://calendar.google.com/calendar/render?${"x".repeat(600)}`,
      icsUrl: "https://api.example.com/ics/abc.ics",
      mapsUrl: "https://maps.google.com/?q=12.97,77.59",
    },
  );

  it("puts the full attach question on the card, not only the last line", () => {
    const ask = BotPrompts.askAttachDocument("en");
    const { textFirst, cardBody } = splitReplyForButtonCard(
      `${confirm}\n\n${ask}`,
      ask,
    );
    assert.match(cardBody, /send a \*report or document\* to your doctor\?/);
    assert.match(cardBody, /Tap \*Yes\* or \*No\* below/);
    assert.ok(cardBody.length <= 1024);
    assert.equal(textFirst, confirm);
    assert.doesNotMatch(textFirst, /report or document/);
  });

  it("keeps the Hindi question whole", () => {
    const ask = BotPrompts.askAttachDocument("hi");
    const { cardBody } = splitReplyForButtonCard(`${confirm}\n\n${ask}`, ask);
    assert.equal(cardBody, ask.trim());
  });

  it("falls back to sending everything as text when no prompt matches", () => {
    const reply = `${confirm}\n\nSomething else?`;
    const { textFirst, cardBody } = splitReplyForButtonCard(reply, "Other prompt");
    assert.equal(textFirst, reply);
    assert.ok(cardBody.length > 0);
  });
});
