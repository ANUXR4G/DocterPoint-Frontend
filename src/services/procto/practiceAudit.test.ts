import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OverrideType, type ScheduleOverride } from "@prisma/client";
import { auditStamp, auditSummary } from "./practiceAudit.js";
import { classifyPatientQuery } from "./deskPatients.service.js";
import { permissionScope } from "./practicePermissions.js";
import { dayWindows } from "./calendarSlots.js";
import { parseLocalDate, startOfLocalDay } from "./slotEngine.js";

describe("audit trail", () => {
  it("stamps events in clinic time", () => {
    assert.equal(auditStamp(new Date("2026-09-28T19:10:00Z")), "29 Sep 2026, 12:40 AM");
    assert.equal(auditStamp(new Date("2026-11-05T11:30:00Z")), "5 Nov 2026, 5:00 PM");
  });

  it("writes 'created manually by <Role> <Name> on <Timestamp>'", () => {
    const at = new Date("2026-09-28T19:10:00Z");
    assert.equal(
      auditSummary("Slot created manually", { name: "Asha Rao", role: "RECEPTIONIST" }, at, "Dr Priya Nair, Thu 5 Nov"),
      "Slot created manually by Receptionist Asha Rao on 29 Sep 2026, 12:40 AM — Dr Priya Nair, Thu 5 Nov.",
    );
    assert.equal(
      auditSummary("Extra slot removed", { name: null, role: null }, at),
      "Extra slot removed by Staff member on 29 Sep 2026, 12:40 AM.",
    );
    assert.equal(
      auditSummary("Day blocked", { name: "Dr. Priya Nair", role: "DOCTOR" }, at),
      "Day blocked by Dr. Priya Nair on 29 Sep 2026, 12:40 AM.",
    );
    assert.equal(
      auditSummary("Day blocked", { name: "Ravi Kumar", role: "DOCTOR" }, at),
      "Day blocked by Doctor Ravi Kumar on 29 Sep 2026, 12:40 AM.",
    );
  });

  it("VIEW_AUDIT_LOG: owners and admins see all, doctors their own, reception none", () => {
    assert.equal(permissionScope("PRACTICE_OWNER", "VIEW_AUDIT_LOG"), "ANY");
    assert.equal(permissionScope("PRACTICE_ADMIN", "VIEW_AUDIT_LOG"), "ANY");
    assert.equal(permissionScope("DOCTOR", "VIEW_AUDIT_LOG"), "OWN");
    assert.equal(permissionScope("RECEPTIONIST", "VIEW_AUDIT_LOG"), null);
  });

  it("extra windows carry who added them and when", () => {
    const createdAt = new Date("2026-09-28T19:10:00Z");
    const row = {
      id: "x1",
      practiceId: "p",
      providerId: "d",
      date: startOfLocalDay(parseLocalDate("2026-11-05")),
      type: OverrideType.EXTRA_SLOT,
      startTime: "17:00",
      endTime: "18:00",
      maxTokens: null,
      reason: "Overtime",
      slotIntervalMin: null,
      capacity: null,
      seriesId: null,
      createdBy: "u-desk",
      createdAt,
    } satisfies ScheduleOverride;
    const w = dayWindows([], [row], parseLocalDate("2026-11-05"));
    assert.equal(w.extra[0].createdBy, "u-desk");
    assert.equal(w.extra[0].createdAt, createdAt.toISOString());
  });
});

describe("desk patient search", () => {
  it("reads mobile, MRN or name from one box", () => {
    assert.deepEqual(classifyPatientQuery("98765 43210"), { kind: "phone", digits: "9876543210" });
    assert.deepEqual(classifyPatientQuery("+91 98765-43210"), { kind: "phone", digits: "919876543210" });
    assert.deepEqual(classifyPatientQuery("4321"), { kind: "phone", digits: "4321" });
    assert.deepEqual(classifyPatientQuery("pcmr00000012"), { kind: "mrn", text: "PCMR00000012" });
    assert.deepEqual(classifyPatientQuery("MR 42"), { kind: "mrn", text: "MR42" });
    assert.deepEqual(classifyPatientQuery("Priya"), { kind: "name", text: "Priya" });
    assert.deepEqual(classifyPatientQuery("12"), { kind: "short" });
    assert.deepEqual(classifyPatientQuery("a"), { kind: "short" });
    assert.deepEqual(classifyPatientQuery(undefined), { kind: "short" });
  });
});
