import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  formatRupees,
  paymentLinkExpiry,
  paymentView,
  prepayAmountPaise,
  statusFromLink,
} from "./bookingPayment.service.js";
import {
  customLinkExpiry,
  kindLabel,
  normalizePatientPhone,
  parseCustomAmountPaise,
  prepayOffer,
} from "./paymentHelpers.js";
import { razorpay } from "../../lib/razorpay.js";
import { settings } from "../../config/index.js";

describe("prepayAmountPaise", () => {
  test("rupees → paise", () => {
    assert.equal(prepayAmountPaise(500), 50000);
    assert.equal(prepayAmountPaise(499.5), 49950);
  });
  test("no fee / zero / junk → null (no pay offer)", () => {
    assert.equal(prepayAmountPaise(null), null);
    assert.equal(prepayAmountPaise(undefined), null);
    assert.equal(prepayAmountPaise(0), null);
    assert.equal(prepayAmountPaise(Number.NaN), null);
  });
});

describe("formatRupees", () => {
  test("whole and fractional", () => {
    assert.equal(formatRupees(50000), "₹500");
    assert.equal(formatRupees(49950), "₹499.50");
  });
});

describe("paymentLinkExpiry", () => {
  const now = new Date("2026-09-28T04:00:00Z");
  test("expires at the slot start", () => {
    const slot = new Date("2026-09-29T05:10:00Z");
    assert.equal(
      paymentLinkExpiry({ slotStart: slot, sessionDate: null }, now).toISOString(),
      slot.toISOString(),
    );
  });
  test("at least 30 minutes even for a visit starting sooner", () => {
    const soon = new Date(now.getTime() + 5 * 60 * 1000);
    assert.equal(
      paymentLinkExpiry({ slotStart: soon, sessionDate: null }, now).getTime(),
      now.getTime() + 30 * 60 * 1000,
    );
  });
  test("token visits run to end of the session day", () => {
    const exp = paymentLinkExpiry(
      { slotStart: null, sessionDate: new Date("2026-09-30T00:00:00Z") },
      now,
    );
    assert.ok(exp.getTime() > new Date("2026-09-30T12:00:00Z").getTime());
  });
});

describe("statusFromLink", () => {
  test("maps Razorpay link states", () => {
    assert.equal(statusFromLink({ status: "paid" }), "PAID");
    assert.equal(statusFromLink({ status: "expired" }), "EXPIRED");
    assert.equal(statusFromLink({ status: "cancelled" }), "CANCELLED");
    assert.equal(statusFromLink({ status: "created" }), "PENDING");
    assert.equal(statusFromLink({ status: "partially_paid" }), "PENDING");
  });
});

describe("paymentView", () => {
  test("link URL only while pending", () => {
    const base = {
      paymentAmount: 50000,
      paymentLinkUrl: "https://rzp.io/x",
      paymentId: null,
      paidAt: null,
    };
    assert.equal(paymentView({ ...base, paymentStatus: "PENDING" }).linkUrl, "https://rzp.io/x");
    assert.equal(paymentView({ ...base, paymentStatus: "PAID" }).linkUrl, null);
    assert.equal(paymentView({ ...base, paymentStatus: null }).status, null);
  });
});

describe("prepayOffer", () => {
  test("advance booking amount wins over the full fee", () => {
    assert.deepEqual(
      prepayOffer({ consultationFee: 700, advanceBookingAmount: 200 }),
      { amount: 20000, kind: "ADVANCE" },
    );
  });
  test("falls back to the consultation fee", () => {
    assert.deepEqual(
      prepayOffer({ consultationFee: 700, advanceBookingAmount: null }),
      { amount: 70000, kind: "CONSULTATION" },
    );
  });
  test("nothing payable → no offer", () => {
    assert.equal(prepayOffer({ consultationFee: null, advanceBookingAmount: 0 }), null);
  });
});

describe("parseCustomAmountPaise", () => {
  test("accepts rupees with commas / ₹ / 2 decimals", () => {
    assert.equal(parseCustomAmountPaise("₹1,500"), 150000);
    assert.equal(parseCustomAmountPaise(249.5), 24950);
    assert.equal(parseCustomAmountPaise("99.99"), 9999);
  });
  test("rejects < ₹1, > ₹5 lakh, 3+ decimals, junk", () => {
    assert.equal(parseCustomAmountPaise(0.5), null);
    assert.equal(parseCustomAmountPaise(500001), null);
    assert.equal(parseCustomAmountPaise("10.555"), null);
    assert.equal(parseCustomAmountPaise("abc"), null);
    assert.equal(parseCustomAmountPaise(""), null);
  });
});

describe("customLinkExpiry", () => {
  const now = new Date("2026-09-28T04:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  test("default 7 days, clamped to 1–30", () => {
    assert.equal(customLinkExpiry(undefined, now).getTime(), now.getTime() + 7 * day);
    assert.equal(customLinkExpiry(3, now).getTime(), now.getTime() + 3 * day);
    assert.equal(customLinkExpiry(90, now).getTime(), now.getTime() + 30 * day);
    assert.equal(customLinkExpiry(0, now).getTime(), now.getTime() + 7 * day);
  });
});

describe("normalizePatientPhone / kindLabel", () => {
  test("keeps international digits, trims local to 10", () => {
    assert.equal(normalizePatientPhone("+91 98765 43210"), "919876543210");
    assert.equal(normalizePatientPhone("00971507801104"), "971507801104");
    assert.equal(normalizePatientPhone("98765-43210"), "9876543210");
    assert.equal(normalizePatientPhone("12345"), null);
  });
  test("labels", () => {
    assert.equal(kindLabel("ADVANCE"), "Advance booking amount");
    assert.equal(kindLabel("CONSULTATION"), "Consultation fee");
    assert.equal(kindLabel("CUSTOM", "Lab tests"), "Lab tests");
  });
});

describe("verifyPaymentLinkSignature", { skip: !razorpay.isConfigured() }, () => {
  const p = {
    paymentLinkId: "plink_123",
    referenceId: "bk-abc",
    status: "paid",
    paymentId: "pay_456",
  };
  const good = crypto
    .createHmac("sha256", settings.razorpayKeySecret)
    .update(`${p.paymentLinkId}|${p.referenceId}|${p.status}|${p.paymentId}`)
    .digest("hex");
  test("accepts Razorpay's signature", () => {
    assert.equal(razorpay.verifyPaymentLinkSignature({ ...p, signature: good }), true);
  });
  test("rejects tampered status / missing signature", () => {
    assert.equal(
      razorpay.verifyPaymentLinkSignature({ ...p, status: "created", signature: good }),
      false,
    );
    assert.equal(razorpay.verifyPaymentLinkSignature({ ...p, signature: undefined }), false);
  });
});
