import type { Response } from "express";
import { prisma } from "../db/prisma.js";
import { AppError } from "../core/response.js";
import { getUserToken, setTokenCookies } from "../core/security.js";
import { isChildRelationship, samePatientMobile } from "../core/phoneMatch.js";
import { pickPrimaryPatientUser } from "./patient.js";

export type HouseholdPerson = {
  id: string;
  name: string;
  mrn: string | null;
  /** null on the account holder. */
  relationship: string | null;
  kind: "self" | "child";
  /** Parent name when this profile is a child. */
  withName: string | null;
};

type HouseholdUser = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  password: string | null;
  patient: {
    mrn: string | null;
    contactNumber: string | null;
    relationship: string | null;
  } | null;
};

function displayName(user: HouseholdUser, relationship: string | null): string {
  const raw = (user.name || "").trim();
  if (relationship && raw.toLowerCase().endsWith(` · ${relationship.toLowerCase()}`)) {
    return raw.slice(0, -(` · ${relationship}`.length)).trim() || "Patient";
  }
  return raw || "Patient";
}

async function profilesOnMobile(anchor: string): Promise<HouseholdUser[]> {
  const digits = String(anchor || "").replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (last10.length < 10) return [];
  const rows = await prisma.user.findMany({
    where: {
      role: "user",
      OR: [
        { phone: { endsWith: last10 } },
        { patient: { contactNumber: { endsWith: last10 } } },
      ],
    },
    include: {
      patient: {
        select: { mrn: true, contactNumber: true, relationship: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 20,
  });
  return rows.filter(
    (u) =>
      samePatientMobile(u.phone, anchor) ||
      samePatientMobile(u.patient?.contactNumber, anchor),
  );
}

/** Account holder plus children registered on that exact mobile. Other adults stay private. */
export async function listHousehold(userId: string): Promise<{
  currentId: string;
  people: HouseholdPerson[];
}> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      patient: {
        select: { mrn: true, contactNumber: true, relationship: true },
      },
    },
  });
  if (!me || me.role !== "user" || !me.patient) {
    throw new AppError(403, "Sign in as a patient to see profiles on this number.");
  }

  const anchor = me.patient.contactNumber || me.phone || "";
  const rows = await profilesOnMobile(anchor);
  const owners = rows.filter((u) => !u.patient?.relationship?.trim());
  const owner =
    pickPrimaryPatientUser(owners.filter((u) => samePatientMobile(u.phone, anchor))) ??
    pickPrimaryPatientUser(owners);
  const parentName = owner?.name?.trim() || null;

  const people: HouseholdPerson[] = [];
  if (owner) {
    people.push({
      id: owner.id,
      name: displayName(owner, null),
      mrn: owner.patient?.mrn ?? null,
      relationship: null,
      kind: "self",
      withName: null,
    });
  }
  for (const child of rows) {
    if (!isChildRelationship(child.patient?.relationship)) continue;
    if (people.some((p) => p.id === child.id)) continue;
    people.push({
      id: child.id,
      name: displayName(child, child.patient?.relationship ?? null),
      mrn: child.patient?.mrn ?? null,
      relationship: "Child",
      kind: "child",
      withName: parentName,
    });
  }
  if (!people.some((p) => p.id === me.id)) {
    const child = isChildRelationship(me.patient.relationship);
    people.unshift({
      id: me.id,
      name: displayName(me, me.patient.relationship),
      mrn: me.patient.mrn,
      relationship: child ? "Child" : me.patient.relationship,
      kind: child ? "child" : "self",
      withName: child ? parentName : null,
    });
  }
  return { currentId: me.id, people };
}

export async function switchHousehold(
  actorId: string,
  targetId: string,
  res: Response,
) {
  const { people } = await listHousehold(actorId);
  if (!people.some((p) => p.id === targetId)) {
    throw new AppError(
      403,
      "That profile is not a child on this mobile. Each adult signs in on their own record.",
    );
  }
  const user = await prisma.user.findFirst({
    where: { id: targetId, role: "user" },
    select: { id: true, email: true, role: true, name: true, password: true },
  });
  if (!user) throw new AppError(404, "Profile not found.");
  const tokenResult = getUserToken(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      password: user.password,
    },
    200,
  );
  setTokenCookies(res, tokenResult.cookies);
  return res.status(200).json({
    status: "successful",
    message: "Switched profile.",
    ...tokenResult.responseBody,
  });
}
