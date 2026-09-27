import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { createRazorpayClient, verifyRazorpayWebhook } from "../../lib/razorpay.js";
import {
  RAZORPAY_KEY_ID_RE,
  hasOwnRazorpayKeys,
  razorpayKeyMode,
} from "./paymentAccount.service.js";

describe("clinic Razorpay key ID", () => {
  test("accepts live / test key IDs", () => {
    assert.ok(RAZORPAY_KEY_ID_RE.test("rzp_live_AbCdEf1234567890"));
    assert.ok(RAZORPAY_KEY_ID_RE.test("rzp_test_1DP5mmOlF5G5ag"));
  });
  test("rejects secrets, spaces and other prefixes", () => {
    assert.equal(RAZORPAY_KEY_ID_RE.test("rzp_prod_AbCdEf1234567890"), false);
    assert.equal(RAZORPAY_KEY_ID_RE.test("rzp_live_ AbCdEf12345"), false);
    assert.equal(RAZORPAY_KEY_ID_RE.test("thisIsASecretValue1234"), false);
    assert.equal(RAZORPAY_KEY_ID_RE.test(""), false);
  });
  test("mode from prefix", () => {
    assert.equal(razorpayKeyMode("rzp_live_x"), "LIVE");
    assert.equal(razorpayKeyMode("rzp_test_x"), "TEST");
    assert.equal(razorpayKeyMode(null), null);
  });
  test("own keys = key ID saved", () => {
    assert.equal(hasOwnRazorpayKeys({ razorpayKeyId: "rzp_test_x" }), true);
    assert.equal(hasOwnRazorpayKeys({ razorpayKeyId: null }), false);
  });
});

describe("per-account signatures", () => {
  const clinic = createRazorpayClient({ keyId: "rzp_test_clinicA0001", keySecret: "clinic-secret-A" });
  const other = createRazorpayClient({ keyId: "rzp_test_clinicB0001", keySecret: "clinic-secret-B" });
  const p = { paymentLinkId: "plink_1", referenceId: "pr-1", status: "paid", paymentId: "pay_1" };
  const sig = crypto
    .createHmac("sha256", "clinic-secret-A")
    .update(`${p.paymentLinkId}|${p.referenceId}|${p.status}|${p.paymentId}`)
    .digest("hex");

  test("callback verifies only with the account that created the link", () => {
    assert.equal(clinic.verifyPaymentLinkSignature({ ...p, signature: sig }), true);
    assert.equal(other.verifyPaymentLinkSignature({ ...p, signature: sig }), false);
    assert.equal(clinic.verifyPaymentLinkSignature({ ...p, status: "created", signature: sig }), false);
    assert.equal(clinic.verifyPaymentLinkSignature({ ...p, signature: undefined }), false);
  });

  test("clinic webhook verifies with its own webhook secret", () => {
    const body = JSON.stringify({ event: "payment_link.paid" });
    const good = crypto.createHmac("sha256", "wh-secret").update(body).digest("hex");
    assert.equal(verifyRazorpayWebhook("wh-secret", body, good), true);
    assert.equal(verifyRazorpayWebhook("other-secret", body, good), false);
    assert.equal(verifyRazorpayWebhook("wh-secret", body + " ", good), false);
    assert.equal(verifyRazorpayWebhook("", body, good), false);
  });
});
