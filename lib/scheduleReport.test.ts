import test from "node:test";
import assert from "node:assert/strict";

import {
  formatScheduleTime,
  formatReportDate,
  resolveScheduleOnDate,
  buildWeekScheduleReport,
  buildMonthScheduleReport,
  buildCustomScheduleReport,
  buildDayScheduleReport,
  exportScheduleReportToCsv,
  type ScheduleRuleItem,
} from "./scheduleReport";

test("formatScheduleTime handles standard clinic hours", () => {
  assert.equal(formatScheduleTime("09:00"), "9 AM");
  assert.equal(formatScheduleTime("17:00"), "5 PM");
  assert.equal(formatScheduleTime("12:00"), "12 PM");
  assert.equal(formatScheduleTime("13:00"), "1 PM");
  assert.equal(formatScheduleTime("14:00"), "2 PM");
  assert.equal(formatScheduleTime("10:00"), "10 AM");
  assert.equal(formatScheduleTime("08:00"), "8 AM");
  assert.equal(formatScheduleTime("16:00"), "4 PM");
  assert.equal(formatScheduleTime("13:30"), "1:30 PM");
  assert.equal(formatScheduleTime(""), "");
  assert.equal(formatScheduleTime(null), "");
});

test("formatReportDate formats YYYY-MM-DD to DD/MM/YYYY", () => {
  assert.equal(formatReportDate("2026-10-18"), "18/10/2026");
  assert.equal(formatReportDate("2026-10-24"), "24/10/2026");
  assert.equal(formatReportDate("2026-12-01"), "01/12/2026");
  assert.equal(formatReportDate("2027-01-15"), "15/01/2027");
});

test("buildWeekScheduleReport generates 7 rows matching user specification", () => {
  const doctor = { id: "doc-1", name: "Dr. Ananya" };
  const rules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 0, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 2, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 4, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 5, startTime: "09:00", endTime: "17:00", breakStartTime: "12:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 6, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
  ];

  const report = buildWeekScheduleReport(doctor, "2026-10-18", rules);
  assert.equal(report.doctorName, "Dr. Ananya");
  assert.equal(report.fromToLabel, "From Date : 18/10/2026 to 24/10/2026");
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0].rows.length, 7);

  const rows = report.sections[0].rows;
  assert.equal(rows[0].sno, 1);
  assert.equal(rows[0].date, "18/10/2026");
  assert.equal(rows[0].day, "Sunday");
  assert.equal(rows[0].fromTime, "9 AM");
  assert.equal(rows[0].toTime, "5 PM");
  assert.equal(rows[0].breakTimeFrom, "1 PM");
  assert.equal(rows[0].breakTimeTo, "2 PM");

  // Friday has break 12 PM to 2 PM
  assert.equal(rows[5].sno, 6);
  assert.equal(rows[5].date, "23/10/2026");
  assert.equal(rows[5].day, "Friday");
  assert.equal(rows[5].fromTime, "9 AM");
  assert.equal(rows[5].toTime, "5 PM");
  assert.equal(rows[5].breakTimeFrom, "12 PM");
  assert.equal(rows[5].breakTimeTo, "2 PM");
});

test("buildMonthScheduleReport with uniform timing displays 'Same timing for all the month'", () => {
  const doctor = { id: "doc-1", name: "Dr. Ananya" };
  const rules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 0, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 2, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 4, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 5, startTime: "09:00", endTime: "17:00", breakStartTime: "12:00", breakEndTime: "14:00" },
    { providerId: "doc-1", dayOfWeek: 6, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
  ];

  const report = buildMonthScheduleReport(doctor, 2026, 10, rules);
  assert.equal(report.fromToLabel, "From Date : 01/10/2026 TO 31/10/2026");
  assert.equal(report.sections.length, 1);
  assert.equal(report.sections[0].title, "Same timing for all the month");
  assert.equal(report.sections[0].rows.length, 7);
  // Date is empty string per spec
  assert.equal(report.sections[0].rows[0].date, "");
  assert.equal(report.sections[0].rows[0].day, "Sunday");
  assert.equal(report.sections[0].rows[0].fromTime, "9 AM");
});

test("buildMonthScheduleReport partitions into sub-tables when schedule changes mid-month", () => {
  const doctor = { id: "doc-1", name: "Dr. Ananya" };
  const baselineRules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 0, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 2, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 4, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 5, startTime: "09:00", endTime: "17:00", breakStartTime: "12:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 6, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
  ];

  // Starting 2026-10-27, timing changes to 10 AM to 5 PM
  const updatedRules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 0, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
    { providerId: "doc-1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
    { providerId: "doc-1", dayOfWeek: 2, startTime: "10:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
    { providerId: "doc-1", dayOfWeek: 3, startTime: "10:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
    { providerId: "doc-1", dayOfWeek: 4, startTime: "10:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
    { providerId: "doc-1", dayOfWeek: 5, startTime: "10:00", endTime: "17:00", breakStartTime: "12:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
    { providerId: "doc-1", dayOfWeek: 6, startTime: "10:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2026-10-27" },
  ];

  const report = buildMonthScheduleReport(doctor, 2026, 10, [...baselineRules, ...updatedRules]);
  assert.equal(report.sections.length, 2);
  assert.match(report.sections[0].title || "", /Same timing for 01\/10\/2026 to 26\/10\/2026/);
  assert.match(report.sections[1].title || "", /From 26\/10\/2026 to 31\/10\/2026/);

  // Check section 2 has the updated 10 AM timing on Tuesday 27/10/2026
  const tueRow = report.sections[1].rows.find((r) => r.date === "27/10/2026");
  assert.ok(tueRow);
  assert.equal(tueRow.day, "Tuesday");
  assert.equal(tueRow.fromTime, "10 AM");
});

test("buildCustomScheduleReport handles custom date range and leading weekday rows", () => {
  const doctor = { id: "doc-1", name: "Dr. Ananya" };
  // 01/12/2026 was Tuesday. Doctor works Tue-Fri 9 AM-5 PM in Dec.
  const decRules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 2, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 3, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 4, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
    { providerId: "doc-1", dayOfWeek: 5, startTime: "09:00", endTime: "17:00", breakStartTime: "12:00", breakEndTime: "14:00", effectiveFrom: "2000-01-01" },
  ];

  // From Jan 1 2027, works Mon-Fri 8 AM-4 PM, and Saturday 8 AM-1 PM
  const janRules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 1, startTime: "08:00", endTime: "16:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2027-01-01" },
    { providerId: "doc-1", dayOfWeek: 2, startTime: "08:00", endTime: "16:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2027-01-01" },
    { providerId: "doc-1", dayOfWeek: 3, startTime: "08:00", endTime: "16:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2027-01-01" },
    { providerId: "doc-1", dayOfWeek: 4, startTime: "08:00", endTime: "16:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2027-01-01" },
    { providerId: "doc-1", dayOfWeek: 5, startTime: "08:00", endTime: "16:00", breakStartTime: "13:00", breakEndTime: "14:00", effectiveFrom: "2027-01-01" },
    { providerId: "doc-1", dayOfWeek: 6, startTime: "08:00", endTime: "13:00", breakStartTime: "", breakEndTime: "", effectiveFrom: "2027-01-01" },
  ];

  const report = buildCustomScheduleReport(doctor, "2026-12-01", "2027-01-15", [...decRules, ...janRules]);
  assert.equal(report.fromToLabel, "From Date : 01/12/2026 to 15/01/2027");
  const rows = report.sections[0].rows;

  // Row 1 is Sunday, Row 2 is Monday (anchoring leading weekdays)
  assert.equal(rows[0].sno, 1);
  assert.equal(rows[0].day, "Sunday");
  assert.equal(rows[0].date, "");

  assert.equal(rows[1].sno, 2);
  assert.equal(rows[1].day, "Monday");
  assert.equal(rows[1].date, "");

  // Row 3 is 01/12/2026 Tuesday
  assert.equal(rows[2].sno, 3);
  assert.equal(rows[2].date, "01/12/2026");
  assert.equal(rows[2].day, "Tuesday");
  assert.equal(rows[2].fromTime, "9 AM");
  assert.equal(rows[2].toTime, "5 PM");

  // In 2027, Saturday 02/01/2027 shows 8 AM to 1 PM
  const satRow = rows.find((r) => r.date === "02/01/2027");
  assert.ok(satRow);
  assert.equal(satRow.day, "Saturday");
  assert.equal(satRow.fromTime, "8 AM");
  assert.equal(satRow.toTime, "1 PM");
});

test("exportScheduleReportToCsv produces valid CSV string", () => {
  const doctor = { id: "doc-1", name: "Dr. Ananya" };
  const rules: ScheduleRuleItem[] = [
    { providerId: "doc-1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00", breakStartTime: "13:00", breakEndTime: "14:00" },
  ];
  const report = buildWeekScheduleReport(doctor, "2026-10-18", rules);
  const csv = exportScheduleReportToCsv([report]);

  assert.ok(csv.includes("Dr. Ananya"));
  assert.ok(csv.includes("Sno,Date,Day,From time,To Time,Break Time From,Break Time to"));
  assert.ok(csv.includes("Monday"));
});
