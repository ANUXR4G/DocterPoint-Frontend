/**
 * Conflict resolution for a schedule version parked in PENDING_VERIFICATION.
 *
 * For each visit the new schedule no longer offers, the clinic picks one of:
 * reschedule (closest free slot under the schedule that will apply that day),
 * reassign to another doctor free at the same time, cancel with a reason, or
 * keep it as an Override slot. Every write goes through BookingService. Patient
 * alerts are held (ScheduleAlertService) until every clash is resolved.
 */
import { BookingStatus, ScheduleMode, type PracticeBooking, type ProviderSchedule } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { BookingService } from "./booking.service.js";
import { PracticeService } from "./practice.service.js";
import {
  emailConfigured,
  realPatientEmail,
  ScheduleAlertService,
  type AlertChannelStatus,
  type ScheduleAlertKind,
} from "./scheduleAlerts.service.js";
import {
  endOfLocalDay,
  formatPracticeDateTime,
  getTokenSession,
  minutesOf,
  parseLocalDate,
  practiceWeekday,
  resolveProviderBookingMode,
  sameLocalSlot,
  timeSlotsForProviderDay,
} from "./slotEngine.js";
import {
  ACTIVE_VERSION,
  addDaysIso,
  autoMatchSlots,
  dbDate,
  loadSchedulesOn,
  noticeEndsAt,
  practiceMinuteOfDay,
  rankSuggestions,
  todayIso,
  type ScheduleConflict,
  type SlotCandidate,
} from "./scheduleVersions.js";

const SEARCH_DAYS = 7;
const SUGGESTIONS_PER_VISIT = 3;
const MAX_ACTIONS = 200;
const MAX_REASSIGN_DOCTORS = 25;

export type ResolutionActionType = "RESCHEDULE" | "REASSIGN" | "CANCEL" | "KEEP";

export type ResolutionAction = {
  bookingId: string;
  type: ResolutionActionType;
  slotStart?: string;
  sessionDate?: string;
  toProviderId?: string;
  reason?: string;
  note?: string;
  notifyWhatsApp: boolean;
  notifyEmail: boolean;
};

export type ResolutionResult = {
  bookingId: string;
  type: ResolutionActionType;
  ok: boolean;
  message: string;
  whatsapp: AlertChannelStatus;
  email: AlertChannelStatus;
};

const ALERT_KIND: Record<Exclude<ResolutionActionType, "KEEP">, ScheduleAlertKind> = {
  RESCHEDULE: "RESCHEDULED",
  REASSIGN: "REASSIGNED",
  CANCEL: "CANCELLED",
};

type Suggestion = Pick<SlotCandidate, "mode" | "day" | "slotStart" | "sessionDate" | "label">;

const dayFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});

function dayLabel(iso: string): string {
  return dayFmt.format(dbDate(iso));
}

function toSuggestion(c: SlotCandidate): Suggestion {
  return { mode: c.mode, day: c.day, slotStart: c.slotStart, sessionDate: c.sessionDate, label: c.label };
}

function whenOf(b: Pick<PracticeBooking, "mode" | "slotStart" | "tokenNumber">, day: string): string {
  return b.mode === ScheduleMode.TIME_BASED && b.slotStart
    ? formatPracticeDateTime(b.slotStart)
    : `${dayLabel(day)} (token${b.tokenNumber != null ? ` #${b.tokenNumber}` : ""})`;
}

export function parseResolutionActions(raw: unknown): ResolutionAction[] {
  if (!Array.isArray(raw) || !raw.length) throw new AppError(400, "actions must be a non-empty list.");
  if (raw.length > MAX_ACTIONS) throw new AppError(400, `At most ${MAX_ACTIONS} appointments at a time.`);
  const types: ResolutionActionType[] = ["RESCHEDULE", "REASSIGN", "CANCEL", "KEEP"];
  return raw.map((item, i) => {
    const a = (item ?? {}) as Record<string, unknown>;
    const type = String(a.type ?? "").toUpperCase() as ResolutionActionType;
    if (typeof a.bookingId !== "string" || !a.bookingId) {
      throw new AppError(400, `actions[${i}].bookingId is required.`);
    }
    if (!types.includes(type)) {
      throw new AppError(400, `actions[${i}].type must be one of ${types.join(", ")}.`);
    }
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return {
      bookingId: a.bookingId,
      type,
      slotStart: str(a.slotStart),
      sessionDate: str(a.sessionDate),
      toProviderId: str(a.toProviderId),
      reason: str(a.reason)?.slice(0, 250),
      note: str(a.note)?.slice(0, 250),
      notifyWhatsApp: type !== "KEEP" && a.notifyWhatsApp !== false,
      notifyEmail: type !== "KEEP" && a.notifyEmail !== false,
    };
  });
}

const DESK_ROLES = new Set(["PRACTICE_OWNER", "PRACTICE_ADMIN", "RECEPTIONIST"]);

/** Owners, admins and reception resolve for any doctor; a doctor only for their own patients. */
async function assertCanResolve(practiceId: string, actorUserId: string, providerId: string) {
  const member = await PracticeService.assertMember(practiceId, actorUserId);
  if (!DESK_ROLES.has(member.role) && providerId !== actorUserId) {
    throw new AppError(403, "Doctors can only resolve their own appointments. Reception and clinic admins can resolve for any doctor.");
  }
  return member;
}

async function loadContext(practiceId: string, providerId: string, actorUserId: string) {
  const member = await assertCanResolve(practiceId, actorUserId, providerId);
  const [pending, version, noticeHours] = await Promise.all([
    PracticeService.getPendingVerification(practiceId, providerId),
    PracticeService.loadPendingVersion(practiceId, providerId),
    PracticeService.scheduleNoticeHours(practiceId),
  ]);
  if (!pending || !version) throw new AppError(404, "No schedule is waiting for verification.");

  const scope = { practiceId, providerId, locationId: pending.locationId };
  const rowCache = new Map<string, Promise<ProviderSchedule[]>>();
  /** Schedule that will apply on a day once the pending version is active. */
  const rowsOn = (iso: string) => {
    if (iso >= pending.effectiveFrom) return Promise.resolve(version.rows);
    if (!rowCache.has(iso)) rowCache.set(iso, loadSchedulesOn(scope, iso));
    return rowCache.get(iso)!;
  };

  const conflicts = pending.conflicts;
  const bookings = await prisma.practiceBooking.findMany({
    where: { id: { in: conflicts.map((c) => c.bookingId) } },
  });
  const byId = new Map(bookings.map((b) => [b.id, b]));
  const patientIds = [...new Set(bookings.map((b) => b.patientId).filter(Boolean))] as string[];
  const users = patientIds.length
    ? await prisma.user.findMany({ where: { id: { in: patientIds } }, select: { id: true, email: true } })
    : [];
  const emails = new Map(users.map((u) => [u.id, realPatientEmail(u.email)]));

  return {
    member,
    canReassign: DESK_ROLES.has(member.role),
    noticeHours,
    /** New times must give the patient the clinic's notice period too. */
    noticeEndsAt: noticeEndsAt(noticeHours),
    pending,
    scope,
    rowsOn,
    conflicts,
    byId,
    emailOf: (b: PracticeBooking) => (b.patientId ? emails.get(b.patientId) ?? null : null),
  };
}

type Ctx = Awaited<ReturnType<typeof loadContext>>;

function searchWindow(conflicts: ScheduleConflict[]) {
  const today = todayIso();
  const days = conflicts.map((c) => c.day).sort();
  const from = days.length ? addDaysIso(days[0]!, -SEARCH_DAYS) : today;
  return {
    from: from < today ? today : from,
    to: days.length ? addDaysIso(days[days.length - 1]!, SEARCH_DAYS) : today,
  };
}

async function providerDayData(practiceId: string, providerId: string, from: string, to: string) {
  const start = parseLocalDate(from);
  const end = endOfLocalDay(parseLocalDate(to));
  const [bookings, overrides] = await Promise.all([
    prisma.practiceBooking.findMany({
      where: {
        practiceId,
        providerId,
        status: { notIn: [BookingStatus.CANCELED, BookingStatus.NO_SHOW] },
        OR: [{ slotStart: { gte: start, lte: end } }, { sessionDate: { gte: start, lte: end } }],
      },
    }),
    prisma.scheduleOverride.findMany({
      where: { practiceId, providerId, date: { gte: start, lte: end } },
    }),
  ]);
  return { bookings, overrides };
}

async function originalMinute(ctx: Ctx, b: PracticeBooking, day: string): Promise<number> {
  if (b.slotStart) return practiceMinuteOfDay(b.slotStart);
  const current = await loadSchedulesOn(ctx.scope, day);
  const row = current.find((r) => r.dayOfWeek === practiceWeekday(parseLocalDate(day)) && r.sessionStart);
  return row?.sessionStart ? minutesOf(row.sessionStart) : 600;
}

/** Free places for `b` from `from` to `to`, under the schedule each day will have. */
async function candidatesFor(
  ctx: Ctx,
  b: PracticeBooking,
  from: string,
  to: string,
  data: Awaited<ReturnType<typeof providerDayData>>,
): Promise<SlotCandidate[]> {
  const others = data.bookings.filter((x) => x.id !== b.id);
  const noticeMs = ctx.noticeEndsAt.getTime();
  const out: SlotCandidate[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) {
    const rows = await ctx.rowsOn(d);
    const mode = resolveProviderBookingMode(rows);
    if (!mode) continue;
    const date = parseLocalDate(d);
    if (mode === ScheduleMode.TIME_BASED) {
      for (const s of timeSlotsForProviderDay(rows, date, others, data.overrides)) {
        if (!s.available || s.start.getTime() < noticeMs) continue;
        const minute = practiceMinuteOfDay(s.start);
        out.push({
          mode,
          day: d,
          minute,
          slotStart: s.start.toISOString(),
          label: formatPracticeDateTime(s.start),
          key: `T ${d} ${minute}`,
          capacity: 1,
        });
      }
    } else {
      if (date.getTime() < noticeMs) continue;
      const row = rows.find(
        (r) => r.dayOfWeek === practiceWeekday(date) && r.mode === ScheduleMode.TOKEN_BASED,
      );
      const session = row ? getTokenSession(row, date, others, data.overrides) : null;
      if (!session?.available) continue;
      out.push({
        mode,
        day: d,
        minute: minutesOf(session.sessionStart),
        sessionDate: d,
        label: `${dayLabel(d)} · token queue ${session.sessionStart}–${session.sessionEnd}`,
        key: `K ${d}`,
        capacity: Math.max(0, session.capacity - session.issued),
      });
    }
  }
  return out;
}

async function rankedCandidates(ctx: Ctx) {
  const win = searchWindow(ctx.conflicts);
  const data = await providerDayData(ctx.scope.practiceId, ctx.scope.providerId, win.from, win.to);
  const ranked = new Map<string, SlotCandidate[]>();
  for (const c of ctx.conflicts) {
    const b = ctx.byId.get(c.bookingId);
    if (!b) continue;
    const from = addDaysIso(c.day, -SEARCH_DAYS) < win.from ? win.from : addDaysIso(c.day, -SEARCH_DAYS);
    const cands = await candidatesFor(ctx, b, from, addDaysIso(c.day, SEARCH_DAYS), data);
    ranked.set(c.bookingId, rankSuggestions(c.day, await originalMinute(ctx, b, c.day), cands));
  }
  return ranked;
}

/** Other doctors at this location free at exactly the visit's time (or with an open token queue that day). */
async function reassignOptions(ctx: Ctx) {
  const out = new Map<string, Array<{ providerId: string; name: string }>>();
  if (!ctx.canReassign || !ctx.conflicts.length) return out;
  const { practiceId, providerId, locationId } = ctx.scope;
  const schedRows = await prisma.providerSchedule.findMany({
    where: { practiceId, locationId, ...ACTIVE_VERSION, providerId: { not: providerId } },
    select: { providerId: true },
    distinct: ["providerId"],
    take: MAX_REASSIGN_DOCTORS,
  });
  const ids = schedRows.map((r) => r.providerId);
  if (!ids.length) return out;
  const [members, users] = await Promise.all([
    prisma.practiceMember.findMany({
      where: { practiceId, userId: { in: ids }, isActive: true },
      select: { userId: true },
    }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]);
  const active = new Set(members.map((m) => m.userId));
  const names = new Map(users.map((u) => [u.id, u.name || "Doctor"]));
  const win = searchWindow(ctx.conflicts);

  for (const docId of ids.filter((id) => active.has(id))) {
    const data = await providerDayData(practiceId, docId, win.from, win.to);
    const rowCache = new Map<string, ProviderSchedule[]>();
    for (const c of ctx.conflicts) {
      const b = ctx.byId.get(c.bookingId);
      if (!b) continue;
      if (!rowCache.has(c.day)) {
        rowCache.set(c.day, await loadSchedulesOn({ practiceId, providerId: docId, locationId }, c.day));
      }
      const rows = rowCache.get(c.day)!;
      const date = parseLocalDate(c.day);
      let free = false;
      if (b.mode === ScheduleMode.TIME_BASED && b.slotStart) {
        free = Boolean(
          timeSlotsForProviderDay(rows, date, data.bookings, data.overrides).find((s) =>
            sameLocalSlot(s.start, b.slotStart!),
          )?.available,
        );
      } else {
        const row = rows.find(
          (r) => r.dayOfWeek === practiceWeekday(date) && r.mode === ScheduleMode.TOKEN_BASED,
        );
        free = Boolean(row && getTokenSession(row, date, data.bookings, data.overrides)?.available);
      }
      if (free) {
        const list = out.get(c.bookingId) ?? [];
        list.push({ providerId: docId, name: names.get(docId)! });
        out.set(c.bookingId, list);
      }
    }
  }
  return out;
}

export const ScheduleResolutionService = {
  /**
   * Resolution worksheet for the pending version: every clashing visit with
   * auto-matched and alternative slots, doctors free at the same time, and
   * which alerts can reach the patient. Read-only.
   */
  async getPlan(practiceId: string, providerId: string, actorUserId: string) {
    const ctx = await loadContext(practiceId, providerId, actorUserId);
    const [ranked, reassign] = await Promise.all([rankedCandidates(ctx), reassignOptions(ctx)]);
    const matched = autoMatchSlots(
      ctx.conflicts.map((c) => ({ bookingId: c.bookingId, ranked: ranked.get(c.bookingId) ?? [] })),
    );
    const items = ctx.conflicts.map((c) => {
      const b = ctx.byId.get(c.bookingId);
      const list = ranked.get(c.bookingId) ?? [];
      const auto = matched.get(c.bookingId) ?? null;
      const suggestions = [auto, ...list.filter((x) => x !== auto)]
        .filter((x): x is SlotCandidate => x != null)
        .slice(0, SUGGESTIONS_PER_VISIT);
      return {
        ...c,
        mode: b?.mode ?? null,
        autoMatch: auto ? toSuggestion(auto) : null,
        suggestions: suggestions.map(toSuggestion),
        reassignTo: reassign.get(c.bookingId) ?? [],
        hasEmail: b ? ctx.emailOf(b) != null : false,
      };
    });
    return {
      effectiveFrom: ctx.pending.effectiveFrom,
      summary: ctx.pending.summary,
      impact: ctx.pending.impact,
      canReassign: ctx.canReassign,
      emailEnabled: emailConfigured(),
      noticeHours: ctx.noticeHours,
      heldAlerts: ctx.pending.heldAlerts,
      items,
    };
  },

  /** Staff "Send now": release held patient alerts without waiting for the last clash. */
  async sendHeldAlerts(practiceId: string, providerId: string, actorUserId: string) {
    await assertCanResolve(practiceId, actorUserId, providerId);
    const res = await ScheduleAlertService.dispatch({ practiceId, providerId });
    console.log(`[schedule-alert] manual send provider=${providerId} by=${actorUserId} sent=${res.sent}`);
    return {
      sent: res.sent,
      skipped: res.skipped,
      pendingVerification: await PracticeService.getPendingVerification(practiceId, providerId),
    };
  },

  /**
   * Apply (or with `dryRun`, only check) one action per clashing visit. Each
   * visit is handled on its own, so one failure doesn't block the rest.
   */
  async resolve(
    practiceId: string,
    providerId: string,
    actorUserId: string,
    rawActions: unknown,
    dryRun = false,
  ) {
    const actions = parseResolutionActions(rawActions);
    const ctx = await loadContext(practiceId, providerId, actorUserId);
    const needsTargets = actions.some((a) => a.type === "RESCHEDULE" || a.type === "REASSIGN");
    const [ranked, reassign] = needsTargets
      ? await Promise.all([rankedCandidates(ctx), reassignOptions(ctx)])
      : [new Map<string, SlotCandidate[]>(), new Map<string, Array<{ providerId: string; name: string }>>()];
    const provider = await prisma.user.findUnique({ where: { id: providerId }, select: { name: true } });
    const conflictById = new Map(ctx.conflicts.map((c) => [c.bookingId, c]));
    const seen = new Set<string>();
    const claimed = new Map<string, number>();
    const results: ResolutionResult[] = [];

    for (const a of actions) {
      const fail = (message: string): void => {
        results.push({ bookingId: a.bookingId, type: a.type, ok: false, message, whatsapp: "n/a", email: "n/a" });
      };
      const conflict = conflictById.get(a.bookingId);
      const b = ctx.byId.get(a.bookingId);
      if (seen.has(a.bookingId)) {
        fail("This appointment appears twice in the request.");
        continue;
      }
      seen.add(a.bookingId);
      if (!conflict || !b) {
        fail("No longer clashes with the new schedule (already resolved or changed).");
        continue;
      }
      const emailStatus: AlertChannelStatus = !a.notifyEmail
        ? "off"
        : !emailConfigured()
          ? "not_configured"
          : ctx.emailOf(b)
            ? "held"
            : "no_email";
      const waStatus: AlertChannelStatus = a.notifyWhatsApp ? "held" : "off";
      const oldWhen = whenOf(b, conflict.day);
      const who = b.patientName || "Patient";
      const holdAlert = async (kind: ScheduleAlertKind, previous: string, reason?: string) => {
        if (!a.notifyWhatsApp && !a.notifyEmail) return;
        await ScheduleAlertService.hold({
          practiceId,
          providerId,
          bookingId: b.id,
          kind,
          notifyWhatsApp: a.notifyWhatsApp,
          notifyEmail: a.notifyEmail,
          oldWhen: previous,
          reason,
          createdById: actorUserId,
        });
      };

      try {
        if (a.type === "RESCHEDULE") {
          const target = (ranked.get(b.id) ?? []).find((c) =>
            a.slotStart
              ? c.slotStart != null && sameLocalSlot(new Date(c.slotStart), new Date(a.slotStart))
              : a.sessionDate != null && c.sessionDate === a.sessionDate,
          );
          if (!target) {
            fail("That slot is not free under the new schedule any more — pick another.");
            continue;
          }
          const used = claimed.get(target.key) ?? 0;
          if (used >= target.capacity) {
            fail(`${target.label} is already given to another patient in this batch.`);
            continue;
          }
          claimed.set(target.key, used + 1);
          if (!dryRun) {
            await BookingService.reschedule(
              b.id,
              {
                slotStart: target.slotStart,
                sessionDate: target.sessionDate,
                skipPatientNotification: true,
              },
              { schedulesOn: ctx.rowsOn, mode: target.mode },
            );
            await holdAlert(ALERT_KIND.RESCHEDULE, oldWhen);
          }
          results.push({
            bookingId: b.id,
            type: a.type,
            ok: true,
            message: `${dryRun ? "Will move" : "Moved"} ${who} to ${target.label}.`,
            whatsapp: waStatus,
            email: emailStatus,
          });
        } else if (a.type === "REASSIGN") {
          if (!ctx.canReassign) {
            fail("Only reception and clinic admins can move appointments to another doctor.");
            continue;
          }
          const doc = (reassign.get(b.id) ?? []).find((d) => d.providerId === a.toProviderId);
          if (!doc) {
            fail("That doctor isn't free at this time — pick another option.");
            continue;
          }
          const key = `R ${doc.providerId} ${oldWhen}`;
          if (claimed.has(key)) {
            fail(`${doc.name} is already given this time for another patient in this batch.`);
            continue;
          }
          claimed.set(key, 1);
          if (!dryRun) {
            await BookingService.reassignProvider(b.id, doc.providerId, {
              skipPatientNotification: true,
            });
            await holdAlert(
              ALERT_KIND.REASSIGN,
              `${oldWhen}${provider?.name ? ` with ${provider.name}` : ""}`,
            );
          }
          results.push({
            bookingId: b.id,
            type: a.type,
            ok: true,
            message: `${dryRun ? "Will move" : "Moved"} ${who} to ${doc.name} at the same time.`,
            whatsapp: waStatus,
            email: emailStatus,
          });
        } else if (a.type === "CANCEL") {
          if (!a.reason || a.reason.length < 3) {
            fail("A cancellation reason is required.");
            continue;
          }
          if (!dryRun) {
            await BookingService.updateStatus(b.id, BookingStatus.CANCELED, undefined, {
              skipPatientNotification: true,
              cancelReason: a.reason,
            });
            await holdAlert(ALERT_KIND.CANCEL, oldWhen, a.reason);
          }
          results.push({
            bookingId: b.id,
            type: a.type,
            ok: true,
            message: `${dryRun ? "Will cancel" : "Cancelled"} ${who}'s visit (${oldWhen}).`,
            whatsapp: waStatus,
            email: emailStatus,
          });
        } else {
          if (!dryRun) {
            await BookingService.keepAsOverride(
              b.id,
              a.note || `Kept for the schedule change from ${ctx.pending.effectiveFrom}`,
            );
          }
          results.push({
            bookingId: b.id,
            type: a.type,
            ok: true,
            message: `${dryRun ? "Will keep" : "Kept"} ${who} at ${oldWhen} as an override slot.`,
            whatsapp: "n/a",
            email: "n/a",
          });
        }
      } catch (err) {
        fail(err instanceof AppError ? err.message : "Could not update this appointment.");
      }
    }

    const ok = results.filter((r) => r.ok).length;
    const markSent = (ids: Set<string>) => {
      for (const r of results) {
        if (!r.ok || !ids.has(r.bookingId)) continue;
        if (r.whatsapp === "held") r.whatsapp = "queued";
        if (r.email === "held") r.email = "queued";
      }
    };

    if (dryRun) {
      // Alerts go out with this batch only if it settles every clash.
      if (ctx.conflicts.length - ok <= 0) markSent(new Set(results.map((r) => r.bookingId)));
      return { dryRun, results, ok, failed: results.length - ok, alertsReleased: 0, pendingVerification: null };
    }

    console.log(
      `[schedule-resolve] provider=${providerId} by=${actorUserId} ok=${ok} failed=${results.length - ok} ` +
        results.map((r) => `${r.bookingId}:${r.type}:${r.ok ? "ok" : "fail"}`).join(","),
    );
    let pendingVerification = await PracticeService.getPendingVerification(practiceId, providerId);
    const settled = !pendingVerification || pendingVerification.conflicts.length === 0;
    const released = settled
      ? await ScheduleAlertService.dispatch({ practiceId, providerId })
      : await ScheduleAlertService.dispatchDue({ practiceId, providerId });
    markSent(new Set(released.sentBookingIds));
    if (released.sent && pendingVerification) {
      pendingVerification = { ...pendingVerification, heldAlerts: await ScheduleAlertService.countHeld(practiceId, providerId) };
    }
    return {
      dryRun,
      results,
      ok,
      failed: results.length - ok,
      alertsReleased: released.sent,
      pendingVerification,
    };
  },
};
