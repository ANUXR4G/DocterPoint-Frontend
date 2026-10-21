import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";

export function slugifySpecialty(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const publicSelect = { id: true, name: true, slug: true } as const;

export async function listSpecialties(opts?: { hasDoctors?: boolean }) {
  if (!opts?.hasDoctors) {
    return prisma.specialty.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: publicSelect,
    });
  }
  return prisma.specialty.findMany({
    where: {
      isActive: true,
      doctors: {
        some: {
          doctor: {
            user: {
              practiceMembers: {
                some: {
                  isActive: true,
                  OR: [
                    { role: "DOCTOR" },
                    {
                      role: "PRACTICE_OWNER",
                      user: { doctor: { isNot: null } },
                    },
                  ],
                  practice: { isActive: true, isDirectoryListed: true },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { name: "asc" },
    select: publicSelect,
  });
}

/** Clinic owner or admin adds a catalog row. Same name or slug returns the existing row. */
export async function createSpecialty(name: string, actorUserId: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new AppError(400, "Specialty name must be 2–80 characters.");
  }
  const admin = await prisma.practiceMember.findFirst({
    where: {
      userId: actorUserId,
      isActive: true,
      role: { in: ["PRACTICE_OWNER", "PRACTICE_ADMIN"] },
    },
    select: { id: true },
  });
  if (!admin) {
    throw new AppError(403, "Only a clinic owner or admin can add a specialty.");
  }
  const slug = slugifySpecialty(trimmed);
  if (!slug) throw new AppError(400, "Specialty name needs letters or numbers.");

  const existing = await prisma.specialty.findFirst({
    where: {
      OR: [{ slug }, { name: { equals: trimmed, mode: "insensitive" } }],
    },
  });
  if (existing) {
    if (!existing.isActive) {
      return prisma.specialty.update({
        where: { id: existing.id },
        data: { isActive: true },
        select: publicSelect,
      });
    }
    return { id: existing.id, name: existing.name, slug: existing.slug };
  }
  return prisma.specialty.create({
    data: { name: trimmed, slug, isActive: true },
    select: publicSelect,
  });
}

/** Ids must already exist. A legacy specialty string is accepted only when it matches the catalog. */
export async function resolveSpecialtyIds(input: {
  specialtyIds?: string[];
  specialty?: string;
}): Promise<string[]> {
  const ids = [
    ...new Set((input.specialtyIds ?? []).map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (ids.length) {
    const rows = await prisma.specialty.findMany({
      where: { id: { in: ids }, isActive: true },
      select: { id: true },
    });
    if (rows.length !== ids.length) {
      throw new AppError(400, "Pick specialties from the list, or add the missing one first.");
    }
    return ids;
  }
  const name = input.specialty?.trim();
  if (!name) return [];
  const slug = slugifySpecialty(name);
  const found = await prisma.specialty.findFirst({
    where: {
      isActive: true,
      OR: [
        { name: { equals: name, mode: "insensitive" } },
        ...(slug ? [{ slug }] : []),
      ],
    },
    select: { id: true },
  });
  if (!found) {
    throw new AppError(
      400,
      `"${name}" is not on the specialty list. Add it first, then select it.`,
    );
  }
  return [found.id];
}

/** Replace a doctor's specialty links and keep the description prefix WhatsApp already reads. */
export async function assignDoctorSpecialties(doctorId: string, specialtyIds: string[]) {
  const rows = await prisma.specialty.findMany({
    where: { id: { in: specialtyIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  await prisma.doctorSpecialty.deleteMany({ where: { doctorId } });
  if (rows.length) {
    await prisma.doctorSpecialty.createMany({
      data: rows.map((s) => ({ doctorId, specialtyId: s.id })),
    });
    await prisma.doctor.update({
      where: { id: doctorId },
      data: { description: `${rows.map((s) => s.name).join(", ")} — clinic staff doctor.` },
    });
  }
  return rows;
}
