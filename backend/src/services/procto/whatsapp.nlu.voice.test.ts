import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isUnclearVoiceTranscript,
  matchPreferredSlotIndex,
  parsePatientDate,
  parseSpokenTime,
  parseSlotsRegex,
  shouldUseLlmForMessage,
} from "./whatsapp.nlu.js";

describe("parseSpokenTime", () => {
  it("parses am/pm clock times", () => {
    assert.equal(parseSpokenTime("book tomorrow at 10 am").preferredHour, 10);
    assert.equal(parseSpokenTime("3:30 pm please").preferredHour, 15);
    assert.equal(parseSpokenTime("3:30 pm please").preferredMinute, 30);
  });

  it("prefers clock over day-part when both present", () => {
    const s = parseSpokenTime("tomorrow morning at 10 am");
    assert.equal(s.preferredHour, 10);
    assert.equal(s.preferredPeriod, undefined);
  });

  it("parses day-part alone", () => {
    assert.equal(parseSpokenTime("kal shaam").preferredPeriod, "evening");
    assert.equal(parseSpokenTime("subah wali slot").preferredPeriod, "morning");
  });

  it("does not treat calendar day as a clock time", () => {
    assert.equal(parseSpokenTime("book on 17-03-2026").preferredHour, undefined);
  });
});

describe("parsePatientDate in free speech", () => {
  it("finds tomorrow inside a longer voice transcript", () => {
    const r = parsePatientDate("please book me tomorrow at 10 am");
    assert.equal(r.ok, true);
    if (r.ok) {
      const expected = new Date();
      expected.setHours(0, 0, 0, 0);
      expected.setDate(expected.getDate() + 1);
      const y = expected.getFullYear();
      const m = String(expected.getMonth() + 1).padStart(2, "0");
      const d = String(expected.getDate()).padStart(2, "0");
      assert.equal(r.date, `${y}-${m}-${d}`);
    }
  });
});

describe("parseSlotsRegex voice combo", () => {
  it("extracts date and time from one utterance", () => {
    const slots = parseSlotsRegex("book tomorrow at 10 am");
    assert.ok(slots.date);
    assert.equal(slots.preferredHour, 10);
  });
});

describe("isUnclearVoiceTranscript", () => {
  it("flags empty / filler STT", () => {
    assert.equal(isUnclearVoiceTranscript(""), true);
    assert.equal(isUnclearVoiceTranscript("..."), true);
    assert.equal(isUnclearVoiceTranscript("um"), true);
    assert.equal(isUnclearVoiceTranscript("book tomorrow"), false);
  });
});

describe("matchPreferredSlotIndex", () => {
  it("picks closest open slot within tolerance", () => {
    const open = [
      { start: new Date(2026, 2, 18, 9, 0) },
      { start: new Date(2026, 2, 18, 10, 0) },
      { start: new Date(2026, 2, 18, 11, 30) },
    ];
    assert.equal(
      matchPreferredSlotIndex(open, { preferredHour: 10, preferredMinute: 0 }),
      1,
    );
    assert.equal(
      matchPreferredSlotIndex(open, { preferredPeriod: "morning" }),
      0,
    );
  });
});

describe("shouldUseLlmForMessage", () => {
  it("uses LLM for multi-word voice notes even on awaiting_date", () => {
    assert.equal(
      shouldUseLlmForMessage("awaiting_date", "next Monday morning please", true),
      true,
    );
    assert.equal(shouldUseLlmForMessage("awaiting_confirm", "yes", true), false);
  });
});
