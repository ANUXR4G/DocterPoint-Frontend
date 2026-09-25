import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGlobalKeywordHijack } from "./whatsapp.hijacks.js";
import {
  formatNluBookConfirmSummary,
  shouldConfirmNluBook,
} from "./whatsapp.nlu.js";
import { BotPrompts } from "./whatsapp.templates.js";
import { decideIdleTimeoutAction } from "./whatsapp.idleTimeout.js";

describe("NLU book confirmation", () => {
  it("confirms freeform book with date/time", () => {
    assert.equal(
      shouldConfirmNluBook("Need to book tomorrow at 3pm", {
        date: "2026-09-26",
        preferredHour: 15,
        preferredMinute: 0,
      }),
      true,
    );
  });

  it("skips confirm for bare BOOK keyword", () => {
    assert.equal(shouldConfirmNluBook("Book", { date: "2026-09-26" }), false);
    assert.equal(shouldConfirmNluBook("booking", {}), false);
  });

  it("formats confirm summary like Sept 25 at 3:00 PM", () => {
    const summary = formatNluBookConfirmSummary({
      date: "2026-09-25",
      preferredHour: 15,
      preferredMinute: 0,
    });
    assert.match(summary, /Sep(t)?\s*25/i);
    assert.match(summary, /3:00\s*PM/i);
  });

  it("nluBookConfirm prompt asks Did you mean", () => {
    const reply = BotPrompts.nluBookConfirm("Fri, Sep 25, 2026 at 3:00 PM", "en");
    assert.match(reply, /Did you mean you want to book an appointment/i);
    assert.match(reply, /Fri, Sep 25, 2026 at 3:00 PM/);
  });
});

describe("Navigation command hijacks", () => {
  it("Main / Menu reset to main menu", () => {
    assert.equal(parseGlobalKeywordHijack("Main"), "main_menu");
    assert.equal(parseGlobalKeywordHijack("Menu"), "main_menu");
    assert.equal(parseGlobalKeywordHijack("Main Menu"), "main_menu");
  });

  it("Agent / Help route to human support", () => {
    assert.equal(parseGlobalKeywordHijack("Agent"), "agent");
    assert.equal(parseGlobalKeywordHijack("Help"), "agent");
  });
});

describe("NLU report freeform", () => {
  it("maps Send my lab report to my doctor to report intent", async () => {
    const { parseUtterance } = await import("./whatsapp.nlu.js");
    const nlu = await parseUtterance(
      "Send my lab report to my doctor",
      "step=idle",
      { useLlm: false },
    );
    assert.equal(nlu.intent, "report");
  });
});

describe("Idle timeout reminder copy", () => {
  it("uses Continue / Main Menu wording", () => {
    const reply = BotPrompts.idleReminder("en");
    assert.match(reply, /It looks like you stepped away/i);
    assert.match(reply, /Continue/i);
    assert.match(reply, /Main Menu/i);
  });

  it("still reminds after 10 minutes mid-flow", () => {
    assert.equal(
      decideIdleTimeoutAction(10 * 60_000, false, {
        reminderMs: 10 * 60_000,
        closeMs: 30 * 60_000,
      }),
      "remind",
    );
  });
});
