import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { BookingStatus } from "@prisma/client";
import { assertVisitStatusMove } from "./bookingStatusFlow.js";

function rejects(from: BookingStatus, to: BookingStatus, via: "status" | "visit" = "status") {
  assert.throws(() => assertVisitStatusMove(from, to, via));
}

describe("assertVisitStatusMove", () => {
  test("accepted can arrive, no-show, or cancel", () => {
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.ACCEPTED, BookingStatus.WAITING, "status"),
    );
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.SCHEDULED, BookingStatus.NO_SHOW, "status"),
    );
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.REQUESTED, BookingStatus.CANCELED, "status"),
    );
  });

  test("accepted cannot jump straight to started", () => {
    rejects(BookingStatus.ACCEPTED, BookingStatus.IN_PROGRESS);
  });

  test("waiting can start, no-show (left), or cancel", () => {
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.WAITING, BookingStatus.IN_PROGRESS, "status"),
    );
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.WAITING, BookingStatus.NO_SHOW, "status"),
    );
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.WAITING, BookingStatus.CANCELED, "status"),
    );
  });

  test("started consultation can only finish, and only from the visit", () => {
    rejects(BookingStatus.IN_PROGRESS, BookingStatus.NO_SHOW);
    rejects(BookingStatus.IN_PROGRESS, BookingStatus.CANCELED);
    rejects(BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, "status");
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.IN_PROGRESS, BookingStatus.COMPLETED, "visit"),
    );
  });

  test("visit finish is allowed from waiting or accepted", () => {
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.WAITING, BookingStatus.COMPLETED, "visit"),
    );
    assert.doesNotThrow(() =>
      assertVisitStatusMove(BookingStatus.ACCEPTED, BookingStatus.COMPLETED, "visit"),
    );
  });

  test("finished, canceled, and no-show stay locked", () => {
    rejects(BookingStatus.COMPLETED, BookingStatus.CANCELED);
    rejects(BookingStatus.NO_SHOW, BookingStatus.WAITING);
    rejects(BookingStatus.CANCELED, BookingStatus.ACCEPTED, "visit");
  });
});
