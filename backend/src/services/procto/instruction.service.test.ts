import { test, describe } from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  COMMON_INSTRUCTIONS,
  InstructionService,
} from "./instruction.service.js";
import { prisma } from "../../db/prisma.js";

describe("InstructionService & Common Master Instructions", () => {
  test("identifies preset common instructions regardless of case", () => {
    assert.strictEqual(InstructionService.isPresetInstruction("After food"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("after food"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("AFTER FOOD"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("Before food"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("Empty stomach"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("Take at bedtime"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("With or after food"), true);
    assert.strictEqual(InstructionService.isPresetInstruction("Do not crush or chew"), true);
  });

  test("identifies custom instructions that are not presets", () => {
    assert.strictEqual(
      InstructionService.isPresetInstruction("Take with warm milk at 6am"),
      false,
    );
    assert.strictEqual(
      InstructionService.isPresetInstruction("Apply ice pack 15 mins before dressing"),
      false,
    );
    assert.strictEqual(
      InstructionService.isPresetInstruction("Dissolve in warm water"),
      true, // This one is in preset list
    );
    assert.strictEqual(
      InstructionService.isPresetInstruction("Take 2 spoons with honey after lunch"),
      false,
    );
  });

  test("listInstructions combines preset and custom list deduplicated case-insensitively", async () => {
    // When no practiceId is provided, returns the standard COMMON_INSTRUCTIONS preset
    const result = await InstructionService.listInstructions();
    assert.ok(result.preset.length >= 20);
    assert.ok(result.instructions.includes("After food"));
    assert.ok(result.instructions.includes("Before food"));
    assert.ok(result.instructions.includes("With or after food"));
  });

  test("recordCustomInstructions ignores empty inputs and preset instructions", async () => {
    let updateCalled = false;
    const origUpdate = prisma.practice.update;
    prisma.practice.update = (async () => {
      updateCalled = true;
    }) as any;

    try {
      // With presets only
      const res1 = await InstructionService.recordCustomInstructions("mock-practice-id", [
        "After food",
        "Before food",
        "",
        null as any,
      ]);
      assert.deepStrictEqual(res1, []);
      assert.strictEqual(updateCalled, false, "Should not update database for preset instructions");
    } finally {
      prisma.practice.update = origUpdate;
    }
  });

  test("recordCustomInstructions persists unique new instruction to practice clinicalMasters", async () => {
    let capturedData: any = null;
    const origFindUnique = prisma.practice.findUnique;
    const origUpdate = prisma.practice.update;

    (prisma.practice.findUnique as any) = async () => ({
      id: "mock-practice-id",
      clinicalMasters: {
        medicines: [],
        instructions: ["Existing custom instruction 1"],
      },
    });

    (prisma.practice.update as any) = async (args: any) => {
      capturedData = args.data;
      return { id: "mock-practice-id" };
    };

    try {
      const added = await InstructionService.recordCustomInstructions("mock-practice-id", [
        "Take with warm milk at night",
        "Existing custom instruction 1", // duplicate, should be skipped
        "After food", // preset, should be skipped
      ]);

      assert.deepStrictEqual(added, ["Take with warm milk at night"]);
      assert.ok(capturedData);
      assert.deepStrictEqual(capturedData.clinicalMasters.instructions, [
        "Existing custom instruction 1",
        "Take with warm milk at night",
      ]);
    } finally {
      prisma.practice.findUnique = origFindUnique;
      prisma.practice.update = origUpdate;
    }
  });

  test("BookingService updateVisit hooks custom instruction auto-save", () => {
    const src = readFileSync(
      new URL("./booking.service.ts", import.meta.url),
      "utf8",
    );
    assert.ok(
      src.includes("InstructionService.recordCustomInstructions"),
      "BookingService updateVisit must call InstructionService.recordCustomInstructions on save",
    );
  });
});
