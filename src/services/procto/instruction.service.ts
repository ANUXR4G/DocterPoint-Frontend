import { prisma } from "../../db/prisma.js";
import { Prisma } from "@prisma/client";

export const COMMON_INSTRUCTIONS: readonly string[] = [
  "After food",
  "Before food",
  "With or after food",
  "With food",
  "Empty stomach",
  "Empty stomach in morning",
  "Before breakfast",
  "30 min before breakfast",
  "With breakfast",
  "With evening meal",
  "Take at night",
  "Take at bedtime",
  "With or without food",
  "As needed",
  "As needed for pain / fever",
  "Every 6-8 hours as needed",
  "1 hour before or 2 hours after meals",
  "At start of meal",
  "Strictly after meals with water",
  "Complete full course",
  "May cause mild drowsiness",
  "Dissolve in warm water",
  "Do not crush or chew",
] as const;

export class InstructionService {
  /** Resolve practice ID for a user. */
  static async getPracticeIdForUser(userId: string): Promise<string | null> {
    const member = await prisma.practiceMember.findFirst({
      where: { userId, isActive: true },
      select: { practiceId: true },
    });
    return member?.practiceId ?? null;
  }

  /**
   * Check if an instruction is in the standard preset common list (case-insensitive).
   */
  static isPresetInstruction(text: string): boolean {
    const norm = text.trim().toLowerCase();
    return COMMON_INSTRUCTIONS.some((item) => item.toLowerCase() === norm);
  }

  /**
   * List instructions for a practice (or global preset if no practice).
   * Combines preset list with any custom instructions saved in practice.clinicalMasters.instructions.
   */
  static async listInstructions(opts?: {
    practiceId?: string | null;
    userId?: string | null;
  }): Promise<{ preset: string[]; custom: string[]; instructions: string[] }> {
    let practiceId = opts?.practiceId ?? null;
    if (!practiceId && opts?.userId) {
      practiceId = await this.getPracticeIdForUser(opts.userId);
    }

    let custom: string[] = [];

    if (practiceId) {
      const practice = await prisma.practice.findUnique({
        where: { id: practiceId },
        select: { clinicalMasters: true },
      });
      const rawMasters = practice?.clinicalMasters as Record<string, unknown> | null;
      if (rawMasters && Array.isArray(rawMasters.instructions)) {
        custom = rawMasters.instructions
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((item) => item.trim());
      }
    }

    // Merge preset + custom, deduplicating case-insensitively
    const seen = new Set<string>();
    const instructions: string[] = [];

    // Add preset first
    for (const inst of COMMON_INSTRUCTIONS) {
      const lower = inst.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        instructions.push(inst);
      }
    }

    // Append practice custom instructions
    for (const inst of custom) {
      const lower = inst.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        instructions.push(inst);
      }
    }

    return {
      preset: [...COMMON_INSTRUCTIONS],
      custom,
      instructions,
    };
  }

  /**
   * Record a single custom instruction for a practice if it isn't in preset or practice list.
   */
  static async recordCustomInstruction(
    practiceId: string,
    rawText: string | undefined | null,
  ): Promise<string | null> {
    if (!practiceId || !rawText) return null;
    const text = rawText.trim().slice(0, 200);
    if (!text) return null;

    if (this.isPresetInstruction(text)) {
      return text;
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });
    if (!practice) return null;

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingInstructions: string[] = Array.isArray(rawMasters.instructions)
      ? (rawMasters.instructions.filter((i): i is string => typeof i === "string") as string[])
      : [];

    const lower = text.toLowerCase();
    const alreadySaved = existingInstructions.some((i) => i.trim().toLowerCase() === lower);
    if (alreadySaved) {
      return text;
    }

    const nextInstructions = [...existingInstructions, text];
    const nextMasters = {
      ...rawMasters,
      instructions: nextInstructions,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return text;
  }

  /**
   * Record multiple custom instructions for a practice in a single batch.
   */
  static async recordCustomInstructions(
    practiceId: string,
    rawTexts: Array<string | undefined | null>,
  ): Promise<string[]> {
    if (!practiceId || !rawTexts || rawTexts.length === 0) return [];

    const candidates = rawTexts
      .map((t) => (t || "").trim().slice(0, 200))
      .filter((t) => t.length > 0 && !this.isPresetInstruction(t));

    if (candidates.length === 0) return [];

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });
    if (!practice) return [];

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingInstructions: string[] = Array.isArray(rawMasters.instructions)
      ? (rawMasters.instructions.filter((i): i is string => typeof i === "string") as string[])
      : [];

    const existingSet = new Set(existingInstructions.map((i) => i.trim().toLowerCase()));
    const toAdd: string[] = [];

    for (const cand of candidates) {
      const lower = cand.toLowerCase();
      if (!existingSet.has(lower)) {
        existingSet.add(lower);
        toAdd.push(cand);
      }
    }

    if (toAdd.length === 0) {
      return [];
    }

    const nextInstructions = [...existingInstructions, ...toAdd];
    const nextMasters = {
      ...rawMasters,
      instructions: nextInstructions,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return toAdd;
  }
}

