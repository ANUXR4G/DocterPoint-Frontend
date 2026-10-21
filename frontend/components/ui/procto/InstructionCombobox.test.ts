import { test, describe } from "node:test"
import assert from "node:assert"
import {
  COMMON_INSTRUCTIONS,
  PREDEFINED_INSTRUCTION_GROUPS,
  registerCustomInstruction,
  getGlobalInstructions,
} from "./InstructionCombobox"

describe("InstructionCombobox Logic & Common Instructions", () => {
  test("contains standard clinical instructions including after food and before food", () => {
    assert.ok(COMMON_INSTRUCTIONS.length >= 15, "Should have rich list of common instructions")
    assert.ok(COMMON_INSTRUCTIONS.includes("After food"), "Should include After food")
    assert.ok(COMMON_INSTRUCTIONS.includes("Before food"), "Should include Before food")
    assert.ok(COMMON_INSTRUCTIONS.includes("With or after food"), "Should include With or after food")
    assert.ok(COMMON_INSTRUCTIONS.includes("Empty stomach"), "Should include Empty stomach")
    assert.ok(COMMON_INSTRUCTIONS.includes("Take at bedtime"), "Should include Take at bedtime")
  })

  test("filtering by 'af' finds 'After food' and 'With or after food'", () => {
    const query = "af"
    const matches = COMMON_INSTRUCTIONS.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase()),
    )
    assert.ok(matches.includes("After food"), "Should find After food")
    assert.ok(matches.includes("With or after food"), "Should find With or after food")
  })

  test("filtering by 'before' finds 'Before food' and 'Before breakfast'", () => {
    const query = "before"
    const matches = COMMON_INSTRUCTIONS.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase()),
    )
    assert.ok(matches.includes("Before food"), "Should find Before food")
    assert.ok(matches.includes("Before breakfast"), "Should find Before breakfast")
    assert.ok(matches.includes("30 min before breakfast"), "Should find 30 min before breakfast")
  })

  test("custom instruction not in list returns empty filter but allows custom text", () => {
    const custom = "Take with warm water and honey at 6am"
    const matches = COMMON_INSTRUCTIONS.filter((item) =>
      item.toLowerCase().includes(custom.toLowerCase()),
    )
    assert.strictEqual(matches.length, 0, "No common instruction matches custom text")
    const hasExact = COMMON_INSTRUCTIONS.some(
      (item) => item.toLowerCase() === custom.toLowerCase(),
    )
    assert.strictEqual(hasExact, false, "Should identify as custom text")
  })

  test("registerCustomInstruction dynamically adds to global instructions and avoids duplicates", () => {
    const custom = "Take with warm water and turmeric at night"
    registerCustomInstruction(custom)
    const list1 = getGlobalInstructions()
    assert.ok(list1.includes(custom), "Global instructions must include registered custom text")

    // Adding duplicate (even with different casing) should not duplicate
    registerCustomInstruction(custom.toUpperCase())
    const list2 = getGlobalInstructions()
    const count = list2.filter((i) => i.toLowerCase() === custom.toLowerCase()).length
    assert.strictEqual(count, 1, "Duplicate custom instruction should not be added twice")
  })

  test("predefined instruction groups contain rich categorized values for the quick-select banner", () => {
    assert.ok(PREDEFINED_INSTRUCTION_GROUPS.length >= 4, "Should have multiple categories")
    const categories = PREDEFINED_INSTRUCTION_GROUPS.map((g) => g.category)
    assert.ok(categories.includes("Meal Timing"))
    assert.ok(categories.includes("Daily Schedule"))
    assert.ok(categories.includes("Administration & Precautions"))
    assert.ok(categories.includes("As Needed (PRN)"))

    // Verify all items are non-empty
    for (const group of PREDEFINED_INSTRUCTION_GROUPS) {
      assert.ok(group.items.length >= 3, `Group ${group.category} should have items`)
      for (const item of group.items) {
        assert.ok(item.trim().length > 0)
      }
    }
  })
})

