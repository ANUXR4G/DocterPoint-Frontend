import type { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { permissionScope } from "./practicePermissions.js";
import { endOfLocalDay, parseLocalDate, PRACTICE_TIMEZONE } from "./slotEngine.js";

export const AUDIT_ACTIONS = [
  "SLOT_CREATED",
  "SLOT_REMOVED",
  "OVERRIDE_CREATED",
  "OVERRIDE_REMOVED",
  "WALK_IN_ADDED",
  "PATIENT_REGISTERED",
  "BOOKING_MOVED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ROLE_LABEL: Record<string, string> = {
  PRACTICE_OWNER: "Clinic owner",
  PRACTICE_ADMIN: "Clinic admin",
  RECEPTIONIST: "Receptionist",
  DOCTOR: "Doctor",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "29 Sep 2026, 12:40 AM" in clinic time. */
export function auditStamp(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PRACTICE_TIMEZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const h = get("hour") % 24;
  const time = `${h % 12 || 12}:${String(get("minute")).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  return `${get("day")} ${MONTHS[get("month") - 1]} ${get("year")}, ${time}`;
}

/** "Slot created manually by Receptionist Asha Rao on 29 Sep 2026, 12:40 AM — <detail>." */
export function auditSummary(
  headline: string,
  actor: { name: string | null; role: string | null },
  at: Date,
  detail?: string,
): string {
  const role = (actor.role && AUDIT_ROLE_LABEL[actor.role]) || "Staff member";
  const name = actor.name?.trim();
  const who = !name ? role : /^dr\b/i.test(name) ? name : `${role} ${name}`;
  return `${headline} by ${who} on ${auditStamp(at)}${detail ? ` — ${detail}` : ""}.`;
}

export type AuditInput = {
  practiceId: string;
  actorUserId: string;
  action: AuditAction;
  headline: string;
  detail?: string;
  entityType?: string;
  entityId?: string | null;
  providerId?: string | null;
  meta?: Record<string, unknown>;
  at?: Date;
};

/**
 * Append one audit event. Never throws: the staff action already happened and must not be
 * undone or refused because the log write failed — failures go to the server log instead.
 */
export async function recordAudit(e: AuditInput) {
  try {
    const at = e.at ?? new Date();
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId: e.practiceId, userId: e.actorUserId } },
      select: { role: true, user: { select: { name: true, email: true } } },
    });
    const actor = {
      name: member?.user?.name?.trim() || member?.user?.email || null,
      role: member?.role ?? null,
    };
    const row = await prisma.practiceAuditEvent.create({
      data: {
        practiceId: e.practiceId,
        actorUserId: e.actorUserId,
        actorName: actor.name?.slice(0, 160) ?? null,
        actorRole: actor.role,
        action: e.action,
        entityType: e.entityType ?? null,
        entityId: e.entityId ?? null,
        providerId: e.providerId ?? null,
        summary: auditSummary(e.headline, actor, at, e.detail),
        meta: (e.meta ?? undefined) as Prisma.InputJsonValue | undefined,
        createdAt: at,
      },
      select: { id: true },
    });
    console.log(`[audit] ${e.action} id=${row.id} practice=${e.practiceId} by=${e.actorUserId}`);
    return row;
  } catch (err) {
    console.error(`[audit] write failed ${e.action} practice=${e.practiceId} by=${e.actorUserId}`, err);
    return null;
  }
}

const MAX_PAGE = 500;

/**
 * Audit events newest first. Owners / admins see the whole clinic; a doctor sees events on their
 * own calendar or list and their own actions; reception has no access.
 */
export async function listAudit(
  practiceId: string,
  actorUserId: string,
  q: { action?: string; providerId?: string; from?: string; to?: string; before?: string; limit?: number },
) {
  const member = await prisma.practiceMember.findUnique({
    where: { practiceId_userId: { practiceId, userId: actorUserId } },
    select: { role: true, isActive: true },
  });
  if (!member?.isActive) throw new AppError(403, "You are not an active member of this clinic.");
  const scope = permissionScope(member.role, "VIEW_AUDIT_LOG");
  if (!scope) throw new AppError(403, "Only clinic owners, admins and doctors can see the audit log.");

  const action = q.action && (AUDIT_ACTIONS as readonly string[]).includes(q.action) ? q.action : undefined;
  if (q.action && !action) throw new AppError(400, "Unknown audit action.");
  const day = (iso: string | undefined, end: boolean) => {
    if (!iso) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new AppError(400, "Dates must be YYYY-MM-DD.");
    const start = parseLocalDate(iso);
    return end ? endOfLocalDay(start) : start;
  };
  const before = q.before ? new Date(q.before) : undefined;
  if (before && Number.isNaN(before.getTime())) throw new AppError(400, "Invalid cursor.");
  const limit = Math.min(MAX_PAGE, Math.max(1, Math.trunc(Number(q.limit) || 50)));
  const from = day(q.from, false);
  const to = day(q.to, true);

  const where: Prisma.PracticeAuditEventWhereInput = {
    practiceId,
    ...(action ? { action } : {}),
    ...(q.providerId ? { providerId: q.providerId } : {}),
    ...(scope === "OWN" ? { OR: [{ providerId: actorUserId }, { actorUserId }] } : {}),
    ...(from || to || before
      ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}), ...(before ? { lt: before } : {}) } }
      : {}),
  };
  const rows = await prisma.practiceAuditEvent.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    select: {
      id: true,
      action: true,
      actorUserId: true,
      actorName: true,
      actorRole: true,
      entityType: true,
      entityId: true,
      providerId: true,
      summary: true,
      meta: true,
      createdAt: true,
    },
  });
  const events = rows.slice(0, limit);
  return {
    scope,
    events,
    nextBefore: rows.length > limit ? events[events.length - 1].createdAt.toISOString() : null,
  };
}
