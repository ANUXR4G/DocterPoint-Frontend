import { prisma } from "../../db/prisma.js";
import { AppError } from "../../core/response.js";
import { formatLocalDate } from "./slotEngine.js";
import {
  CENTRAL_MEDICINE_MASTER,
  type MedicineMasterItem,
} from "../../lib/medicineMaster.js";
import { Prisma } from "@prisma/client";

export type MedicineRecord = {
  id: string;
  medicineCode: string;
  countryCode: string;
  brandName: string;
  name?: string;
  strength: string;
  route: string;
  dosageForm: string;
  genericName: string;
  favourite: boolean;
  effectiveDate?: string;
  effectiveFrom?: string;
  createdAt?: string;
  updatedAt?: string;
};

export const ROUTES_LIST = [
  "Oral",
  "Topical",
  "Intravenous",
  "Intramuscular",
  "Subcutaneous",
  "Inhalation",
  "Nasal",
  "Eye",
  "Ear",
  "Sublingual",
  "Rectal",
] as const;

export const DOSAGE_FORMS_LIST = [
  "Tablet",
  "Capsule",
  "Syrup",
  "Injection",
  "Ointment",
  "Drops",
  "Inhaler",
  "Suspension",
  "Gel",
  "Powder",
  "Solution",
  "Lotion",
] as const;

// Convert CENTRAL_MEDICINE_MASTER into initial MedicineRecords
export function getDefaultMedicineRecords(): MedicineRecord[] {
  return CENTRAL_MEDICINE_MASTER.map((m) => ({
    id: m.id,
    medicineCode: m.medicineCode,
    countryCode: m.countryCode,
    brandName: m.brandName || m.name,
    name: m.name || m.brandName,
    strength: m.strength || "",
    route: m.route || "Oral",
    dosageForm: m.dosageForm || (m.doseUnit === "capsule" ? "Capsule" : "Tablet"),
    genericName: m.genericName,
    favourite: Boolean(m.favourite || m.isPopular),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export class MedicineService {
  /** Resolve practice ID for a user. */
  private static async getPracticeIdForUser(userId: string): Promise<string | null> {
    const member = await prisma.practiceMember.findFirst({
      where: { userId, isActive: true },
      select: { practiceId: true },
    });
    return member?.practiceId ?? null;
  }

  /**
   * List medicines for the authenticated user's practice (or defaults if unauthenticated).
   */
  static async listMedicines(opts: {
    userId?: string;
    q?: string;
    favouriteOnly?: boolean;
  }): Promise<MedicineRecord[]> {
    let items: MedicineRecord[] = [];

    if (opts.userId) {
      const practiceId = await this.getPracticeIdForUser(opts.userId);
      if (practiceId) {
        const practice = await prisma.practice.findUnique({
          where: { id: practiceId },
          select: { clinicalMasters: true },
        });

        const rawMasters = practice?.clinicalMasters as Record<string, unknown> | null;
        if (rawMasters && Array.isArray(rawMasters.medicines) && rawMasters.medicines.length > 0) {
          items = rawMasters.medicines as MedicineRecord[];
        } else {
          // Initialize practice with defaults and persist
          items = getDefaultMedicineRecords();
          const nextMasters = {
            ...(rawMasters ?? {}),
            medicines: items,
          };
          await prisma.practice.update({
            where: { id: practiceId },
            data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
          });
        }
      }
    }

    if (items.length === 0) {
      items = getDefaultMedicineRecords();
    }

    // Apply filtering
    const q = (opts.q || "").trim().toLowerCase();
    if (q) {
      items = items.filter(
        (m) =>
          (m.medicineCode || "").toLowerCase().includes(q) ||
          (m.brandName || "").toLowerCase().includes(q) ||
          (m.genericName || "").toLowerCase().includes(q) ||
          (m.countryCode || "").toLowerCase().includes(q),
      );
    }

    if (opts.favouriteOnly) {
      items = items.filter((m) => m.favourite);
    }

    return items;
  }

  /**
   * Create a new medicine record in the practice's database.
   */
  static async createMedicine(
    userId: string,
    data: {
      medicineCode: string;
      countryCode?: string;
      brandName: string;
      strength?: string;
      route?: string;
      dosageForm?: string;
      genericName: string;
      favourite?: boolean;
    },
  ): Promise<MedicineRecord> {
    const medicineCode = (data.medicineCode || "").trim();
    const brandName = (data.brandName || "").trim();
    const genericName = (data.genericName || "").trim();

    if (!medicineCode) {
      throw new AppError(400, "Medicine Code is required.");
    }
    if (!brandName) {
      throw new AppError(400, "Brand Name is required.");
    }
    if (!genericName) {
      throw new AppError(400, "Generic Name is required.");
    }

    const practiceId = await this.getPracticeIdForUser(userId);
    if (!practiceId) {
      throw new AppError(403, "You must be associated with a clinic to add medicines.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });

    const rawMasters = (practice?.clinicalMasters as Record<string, unknown> | null) ?? {};
    let existingList: MedicineRecord[] = Array.isArray(rawMasters.medicines)
      ? (rawMasters.medicines as MedicineRecord[])
      : getDefaultMedicineRecords();

    // Check for duplicate Medicine Code (case-insensitive)
    const duplicate = existingList.find(
      (m) => m.medicineCode.trim().toLowerCase() === medicineCode.toLowerCase(),
    );
    if (duplicate) {
      throw new AppError(400, `Medicine Code "${medicineCode}" already exists.`);
    }

    const newRecord: MedicineRecord = {
      id: `med-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      medicineCode,
      countryCode: (data.countryCode || "").trim(),
      brandName,
      strength: (data.strength || "").trim(),
      route: (data.route || "Oral").trim(),
      dosageForm: (data.dosageForm || "Tablet").trim(),
      genericName,
      favourite: Boolean(data.favourite),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    existingList = [newRecord, ...existingList];

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        clinicalMasters: {
          ...rawMasters,
          medicines: existingList,
        } as Prisma.InputJsonValue,
      },
    });

    return newRecord;
  }

  /**
   * Update an existing medicine record.
   */
  static async updateMedicine(
    userId: string,
    id: string,
    patch: Partial<{
      medicineCode: string;
      countryCode: string;
      brandName: string;
      strength: string;
      route: string;
      dosageForm: string;
      genericName: string;
      favourite: boolean;
    }>,
  ): Promise<MedicineRecord> {
    const practiceId = await this.getPracticeIdForUser(userId);
    if (!practiceId) {
      throw new AppError(403, "You must be associated with a clinic to edit medicines.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });

    const rawMasters = (practice?.clinicalMasters as Record<string, unknown> | null) ?? {};
    let existingList: MedicineRecord[] = Array.isArray(rawMasters.medicines)
      ? (rawMasters.medicines as MedicineRecord[])
      : getDefaultMedicineRecords();

    const index = existingList.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new AppError(404, "Medicine record not found.");
    }

    const current = existingList[index];

    // Check duplicate code if changing
    if (patch.medicineCode && patch.medicineCode.trim().toLowerCase() !== current.medicineCode.toLowerCase()) {
      const codeCheck = patch.medicineCode.trim().toLowerCase();
      const duplicate = existingList.find(
        (m) => m.id !== id && m.medicineCode.trim().toLowerCase() === codeCheck,
      );
      if (duplicate) {
        throw new AppError(400, `Medicine Code "${patch.medicineCode}" already exists.`);
      }
    }

    const updated: MedicineRecord = {
      ...current,
      ...(patch.medicineCode !== undefined ? { medicineCode: patch.medicineCode.trim() } : {}),
      ...(patch.countryCode !== undefined ? { countryCode: patch.countryCode.trim() } : {}),
      ...(patch.brandName !== undefined ? { brandName: patch.brandName.trim() } : {}),
      ...(patch.strength !== undefined ? { strength: patch.strength.trim() } : {}),
      ...(patch.route !== undefined ? { route: patch.route.trim() } : {}),
      ...(patch.dosageForm !== undefined ? { dosageForm: patch.dosageForm.trim() } : {}),
      ...(patch.genericName !== undefined ? { genericName: patch.genericName.trim() } : {}),
      ...(patch.favourite !== undefined ? { favourite: Boolean(patch.favourite) } : {}),
      updatedAt: new Date().toISOString(),
    };

    existingList[index] = updated;

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        clinicalMasters: {
          ...rawMasters,
          medicines: existingList,
        } as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  /**
   * Delete a medicine record.
   */
  static async deleteMedicine(userId: string, id: string): Promise<boolean> {
    const practiceId = await this.getPracticeIdForUser(userId);
    if (!practiceId) {
      throw new AppError(403, "You must be associated with a clinic to delete medicines.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });

    const rawMasters = (practice?.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: MedicineRecord[] = Array.isArray(rawMasters.medicines)
      ? (rawMasters.medicines as MedicineRecord[])
      : getDefaultMedicineRecords();

    const target = existingList.find((m) => m.id === id);
    if (!target) return false;

    // Historical entries prior to current date must remain immutable!
    const today = formatLocalDate(new Date());
    const medicineDate = target.effectiveDate || target.effectiveFrom;
    if (medicineDate && medicineDate < today) {
      throw new AppError(
        403,
        "Historical medicine records prior to the current date are immutable and cannot be deleted to maintain legal compliance, accurate auditing, and a reliable medical trail.",
      );
    }

    const filtered = existingList.filter((m) => m.id !== id);

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        clinicalMasters: {
          ...rawMasters,
          medicines: filtered,
        } as Prisma.InputJsonValue,
      },
    });

    return true;
  }

  /**
   * Toggle favourite flag on a medicine record.
   */
  static async toggleFavourite(userId: string, id: string, forcedValue?: boolean): Promise<MedicineRecord> {
    const practiceId = await this.getPracticeIdForUser(userId);
    if (!practiceId) {
      throw new AppError(403, "You must be associated with a clinic to update favourites.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });

    const rawMasters = (practice?.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: MedicineRecord[] = Array.isArray(rawMasters.medicines)
      ? (rawMasters.medicines as MedicineRecord[])
      : getDefaultMedicineRecords();

    const index = existingList.findIndex((m) => m.id === id);
    if (index === -1) {
      throw new AppError(404, "Medicine record not found.");
    }

    const current = existingList[index];
    const nextFav = forcedValue !== undefined ? Boolean(forcedValue) : !current.favourite;

    const updated: MedicineRecord = {
      ...current,
      favourite: nextFav,
      updatedAt: new Date().toISOString(),
    };

    existingList[index] = updated;

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        clinicalMasters: {
          ...rawMasters,
          medicines: existingList,
        } as Prisma.InputJsonValue,
      },
    });

    return updated;
  }

  /**
   * Bulk upload/import medicines for the user's practice.
   */
  static async bulkUploadMedicines(
    userId: string,
    rawItems: Array<{
      medicineCode?: string;
      countryCode?: string;
      brandName: string;
      genericName?: string;
      strength?: string;
      route?: string;
      dosageForm?: string;
      favourite?: boolean;
    }>,
  ): Promise<{
    importedCount: number;
    updatedCount: number;
    total: number;
    items: MedicineRecord[];
  }> {
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      throw new AppError(400, "No medicine records provided for bulk upload.");
    }

    const practiceId = await this.getPracticeIdForUser(userId);
    if (!practiceId) {
      throw new AppError(403, "You must be associated with a clinic to upload medicines.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });

    const rawMasters = (practice?.clinicalMasters as Record<string, unknown> | null) ?? {};
    let existingList: MedicineRecord[] = Array.isArray(rawMasters.medicines)
      ? (rawMasters.medicines as MedicineRecord[])
      : getDefaultMedicineRecords();

    let importedCount = 0;
    let updatedCount = 0;

    for (const raw of rawItems) {
      const brandName = (raw.brandName || "").trim();
      if (!brandName) continue; // Skip rows without a brand name

      const genericName = (raw.genericName || "").trim() || brandName;
      let medicineCode = (raw.medicineCode || "").trim();
      if (!medicineCode) {
        // Auto-generate unique code based on brand name
        const clean = brandName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 8) || "MED";
        medicineCode = `MED-${clean}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      }

      const countryCode = (raw.countryCode || "").trim();
      const strength = (raw.strength || "").trim();
      const route = (raw.route || "Oral").trim();
      const dosageForm = (raw.dosageForm || "Tablet").trim();
      const favourite = Boolean(raw.favourite);

      const existingIndex = existingList.findIndex(
        (m) => m.medicineCode.trim().toLowerCase() === medicineCode.toLowerCase(),
      );

      if (existingIndex !== -1) {
        // Update existing record
        existingList[existingIndex] = {
          ...existingList[existingIndex],
          brandName,
          genericName,
          countryCode: countryCode || existingList[existingIndex].countryCode,
          strength: strength || existingList[existingIndex].strength,
          route: route || existingList[existingIndex].route,
          dosageForm: dosageForm || existingList[existingIndex].dosageForm,
          favourite: raw.favourite !== undefined ? favourite : existingList[existingIndex].favourite,
          updatedAt: new Date().toISOString(),
        };
        updatedCount++;
      } else {
        // Add new record
        const newRecord: MedicineRecord = {
          id: `med-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          medicineCode,
          countryCode,
          brandName,
          strength,
          route,
          dosageForm,
          genericName,
          favourite,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        existingList = [newRecord, ...existingList];
        importedCount++;
      }
    }

    await prisma.practice.update({
      where: { id: practiceId },
      data: {
        clinicalMasters: {
          ...rawMasters,
          medicines: existingList,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      importedCount,
      updatedCount,
      total: existingList.length,
      items: existingList,
    };
  }
}

