import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISPLAY_NAME_PENDING_MESSAGE,
  OTP_DISPLAY_NAME_PENDING_MESSAGE,
  isMetaDisplayNameBlocked,
  parseMetaGraphError,
} from "./whatsapp.metaErrors.js";

describe("parseMetaGraphError", () => {
  it("maps #131037 from error.code", () => {
    const parsed = parseMetaGraphError({
      code: 131037,
      message: "(#131037) WhatsApp Business Account …",
    });
    assert.equal(parsed.code, 131037);
    assert.equal(parsed.userMessage, DISPLAY_NAME_PENDING_MESSAGE);
  });

  it("maps #131037 from message text alone", () => {
    const parsed = parseMetaGraphError({
      message:
        "(#131037) Whatsapp provided number needs display name approval before the message can be sent",
    });
    assert.equal(parsed.code, 131037);
    assert.match(parsed.userMessage, /display name/i);
  });

  it("OTP copy is distinct and patient-safe", () => {
    assert.match(OTP_DISPLAY_NAME_PENDING_MESSAGE, /login code/i);
    assert.doesNotMatch(OTP_DISPLAY_NAME_PENDING_MESSAGE, /#131037/);
  });

  it("detects display-name blocked strings", () => {
    assert.equal(
      isMetaDisplayNameBlocked(
        "(#131037) Whatsapp provided number needs display name approval",
      ),
      true,
    );
    assert.equal(isMetaDisplayNameBlocked("network timeout"), false);
  });
});
