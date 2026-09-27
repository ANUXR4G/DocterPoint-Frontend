import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingStatus } from "@prisma/client";
import { arrivalPatch } from "./bookingArrival.js";

describe("arrivalPatch", () => {
  const now = new Date("2026-09-28T05:10:00Z");
  const earlier = new Date("2026-09-28T04:55:00Z");

  test("first move to WAITING stamps arrival", () => {
    assert.deepEqual(arrivalPatch(null, BookingStatus.WAITING, now), { arrivedAt: now });
  });

  test("straight to IN_PROGRESS / COMPLETED also stamps when missing", () => {
    assert.deepEqual(arrivalPatch(null, BookingStatus.IN_PROGRESS, now), { arrivedAt: now });
    assert.deepEqual(arrivalPatch(undefined, BookingStatus.COMPLETED, now), { arrivedAt: now });
  });

  test("later moves keep the original arrival time", () => {
    assert.deepEqual(arrivalPatch(earlier, BookingStatus.IN_PROGRESS, now), {});
    assert.deepEqual(arrivalPatch(earlier, BookingStatus.COMPLETED, now), {});
  });

  test("back to Accepted or No-show clears arrival", () => {
    assert.deepEqual(arrivalPatch(earlier, BookingStatus.ACCEPTED, now), { arrivedAt: null });
    assert.deepEqual(arrivalPatch(earlier, BookingStatus.NO_SHOW, now), { arrivedAt: null });
  });

  test("cancel and no status leave it unchanged", () => {
    assert.deepEqual(arrivalPatch(earlier, BookingStatus.CANCELED, now), {});
    assert.deepEqual(arrivalPatch(earlier, undefined, now), {});
    assert.deepEqual(arrivalPatch(null, BookingStatus.ACCEPTED, now), {});
  });
});
