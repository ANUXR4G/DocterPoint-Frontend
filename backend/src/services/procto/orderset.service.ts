import { prisma } from "../../db/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../core/response.js";
import { formatLocalDate } from "./slotEngine.js";

export type OrderSetItem = {
  name: string;
  strength?: string;
  route?: string;
  dose?: string;
  doseUnit?: string;
  frequency?: string;
  duration?: string;
  durationUnit?: string;
  instruction?: string;
};

export type OrderSet = {
  id: string;
  name: string;
  description?: string;
  category?: string;
  practiceId?: string;
  createdById?: string;
  createdByName?: string;
  medicines: OrderSetItem[];
  effectiveDate?: string;
  effectiveFrom?: string;
  isCustom?: boolean;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_ORDER_SETS: OrderSet[] = [
  {
    id: "os_dm2_starter",
    name: "Type 2 Diabetes Starter Pack",
    category: "Diabetology",
    description: "Standard initial dual therapy with neuro-protective B-Complex for newly diagnosed or uncontrolled T2DM.",
    medicines: [
      {
        name: "Metformin 500mg",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take strictly after food with water",
      },
      {
        name: "Glimepiride 1mg",
        strength: "1mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take 30 minutes before breakfast",
      },
      {
        name: "Methylcobalamin (B12) 1500mcg",
        strength: "1500mcg",
        route: "Oral",
        dose: "1",
        doseUnit: "capsule",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take after lunch or dinner",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "os_htn_dual",
    name: "Essential Hypertension Dual Therapy",
    category: "Cardiology",
    description: "First-line ARB + CCB combination regimen for stage 1-2 hypertension.",
    medicines: [
      {
        name: "Telmisartan 40mg",
        strength: "40mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take in morning after breakfast",
      },
      {
        name: "Amlodipine 5mg",
        strength: "5mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "30",
        durationUnit: "Days",
        instruction: "Take in morning with water",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "os_urti_cough",
    name: "Acute URI & Cough Protocol",
    category: "Respiratory",
    description: "Targeted antimicrobial, antihistamine-bronchodilator, and antipyretic protocol for acute respiratory infection.",
    medicines: [
      {
        name: "Azithromycin 500mg",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "3",
        durationUnit: "Days",
        instruction: "Strictly after food, complete full 3-day course",
      },
      {
        name: "Montelukast 10mg + Levocetirizine 5mg",
        strength: "10mg/5mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take at bedtime with water",
      },
      {
        name: "Paracetamol 650mg",
        strength: "650mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Thrice daily",
        duration: "3",
        durationUnit: "Days",
        instruction: "Take after food as needed for body ache or fever",
      },
      {
        name: "Dextromethorphan Cough Syrup",
        strength: "100ml",
        route: "Oral",
        dose: "10",
        doseUnit: "ml",
        frequency: "Thrice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take after meals with lukewarm water",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "os_fever_viral",
    name: "Acute Viral Illness & Fever Care",
    category: "General Medicine",
    description: "Antipyretic, electrolyte rehydration, and immune supportive care for viral febrile illnesses.",
    medicines: [
      {
        name: "Paracetamol 650mg",
        strength: "650mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Every 6 hours",
        duration: "3",
        durationUnit: "Days",
        instruction: "Take after meals for fever > 100°F (minimum 6h gap)",
      },
      {
        name: "Oral Rehydration Salts (ORS)",
        strength: "21.8g",
        route: "Oral",
        dose: "1",
        doseUnit: "sachet",
        frequency: "Twice daily",
        duration: "3",
        durationUnit: "Days",
        instruction: "Dissolve entire sachet in 1 liter clean drinking water",
      },
      {
        name: "Vitamin C 500mg + Zinc",
        strength: "500mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "10",
        durationUnit: "Days",
        instruction: "Chew or take with water after breakfast",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "os_gerd_acid",
    name: "Acute Gastritis & GERD Relief",
    category: "Gastroenterology",
    description: "Rapid mucosal protection and acid suppression bundle for reflux and epigastric burning.",
    medicines: [
      {
        name: "Pantoprazole 40mg",
        strength: "40mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "14",
        durationUnit: "Days",
        instruction: "Take 30 minutes before breakfast on empty stomach",
      },
      {
        name: "Magaldrate + Simethicone Gel",
        strength: "200ml",
        route: "Oral",
        dose: "10",
        doseUnit: "ml",
        frequency: "Thrice daily",
        duration: "7",
        durationUnit: "Days",
        instruction: "Take 1 hour after meals and at bedtime",
      },
      {
        name: "Domperidone 10mg",
        strength: "10mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take 15-30 minutes before meals",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "os_msk_backpain",
    name: "Musculoskeletal Pain & Strain Protocol",
    category: "Orthopedics",
    description: "Short-course analgesia, muscle relaxation, and gastric protection for acute spasm and mechanical strain.",
    medicines: [
      {
        name: "Aceclofenac 100mg + Paracetamol 325mg",
        strength: "100mg/325mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Always take strictly after food with water",
      },
      {
        name: "Thiocolchicoside 4mg",
        strength: "4mg",
        route: "Oral",
        dose: "1",
        doseUnit: "capsule",
        frequency: "Twice daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take after morning and evening meals",
      },
      {
        name: "Pantoprazole 40mg",
        strength: "40mg",
        route: "Oral",
        dose: "1",
        doseUnit: "tablet",
        frequency: "Once daily",
        duration: "5",
        durationUnit: "Days",
        instruction: "Take 30 minutes before breakfast on empty stomach",
      },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export class OrderSetService {
  /** Resolve practice ID for a user. */
  static async getPracticeIdForUser(userId: string): Promise<string | null> {
    const member = await prisma.practiceMember.findFirst({
      where: { userId, isActive: true },
      select: { practiceId: true },
    });
    return member?.practiceId ?? null;
  }

  /**
   * List all order sets available for a practice.
   */
  static async listOrderSets(practiceId?: string | null): Promise<OrderSet[]> {
    let customList: OrderSet[] = [];

    if (practiceId) {
      const practice = await prisma.practice.findUnique({
        where: { id: practiceId },
        select: { clinicalMasters: true },
      });
      const rawMasters = practice?.clinicalMasters as Record<string, unknown> | null;
      if (rawMasters && Array.isArray(rawMasters.orderSets)) {
        customList = rawMasters.orderSets as OrderSet[];
      }
    }

    // Merge defaults + practice custom order sets
    return [...DEFAULT_ORDER_SETS, ...customList];
  }

  /**
   * Create a new custom order set for a clinic.
   */
  static async createOrderSet(
    practiceId: string,
    doctorUserId: string,
    doctorName: string,
    data: {
      name: string;
      description?: string;
      category?: string;
      medicines: OrderSetItem[];
    },
  ): Promise<OrderSet> {
    const name = String(data.name || "").trim();
    if (!name) {
      throw new AppError(400, "Order set name is required.");
    }
    if (!Array.isArray(data.medicines) || data.medicines.length === 0) {
      throw new AppError(400, "An order set must contain at least one medicine.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });
    if (!practice) {
      throw new AppError(404, "Practice not found.");
    }

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: OrderSet[] = Array.isArray(rawMasters.orderSets)
      ? (rawMasters.orderSets as OrderSet[])
      : [];

    const id = `os_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newOrderSet: OrderSet = {
      id,
      name,
      description: data.description?.trim() || undefined,
      category: data.category?.trim() || "General",
      practiceId,
      createdById: doctorUserId,
      createdByName: doctorName,
      medicines: data.medicines.map((m) => ({
        name: String(m.name || "").trim(),
        strength: m.strength ? String(m.strength).trim() : undefined,
        route: m.route ? String(m.route).trim() : "Oral",
        dose: m.dose ? String(m.dose).trim() : "1",
        doseUnit: m.doseUnit ? String(m.doseUnit).trim() : "tablet",
        frequency: m.frequency ? String(m.frequency).trim() : "Once daily",
        duration: m.duration ? String(m.duration).trim() : "5",
        durationUnit: m.durationUnit
          ? String(m.durationUnit).trim() === "Day"
            ? "Days"
            : String(m.durationUnit).trim()
          : "Days",
        instruction: m.instruction ? String(m.instruction).trim() : undefined,
      })),
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextList = [...existingList, newOrderSet];
    const nextMasters = {
      ...rawMasters,
      orderSets: nextList,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return newOrderSet;
  }

  /**
   * Delete a custom order set.
   */
  static async deleteOrderSet(
    practiceId: string,
    orderSetId: string,
  ): Promise<boolean> {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });
    if (!practice) return false;

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: OrderSet[] = Array.isArray(rawMasters.orderSets)
      ? (rawMasters.orderSets as OrderSet[])
      : [];

    const target = existingList.find((item) => item.id === orderSetId);
    if (!target) return false;

    // Historical entries prior to current date must remain immutable!
    const today = formatLocalDate(new Date());
    const orderSetDate = target.effectiveDate || target.effectiveFrom || target.createdAt?.slice(0, 10);
    if (orderSetDate && orderSetDate < today) {
      throw new AppError(
        403,
        "Historical order sets prior to the current date are immutable and cannot be deleted to maintain legal compliance, accurate auditing, and a reliable medical trail.",
      );
    }

    const filtered = existingList.filter((item) => item.id !== orderSetId);
    const nextMasters = {
      ...rawMasters,
      orderSets: filtered,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return true;
  }
}

