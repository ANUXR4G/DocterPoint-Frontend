import { test, describe } from "node:test"
import assert from "node:assert"
import { CLINICAL_TEMPLATES, combineTemplatesText } from "./TemplateSelector"

describe("TemplateSelector & Clinical Templates", () => {
  test("contains templates categorized by condition, medication, and general scopes", () => {
    const conditions = CLINICAL_TEMPLATES.filter((t) => t.category === "condition")
    const medications = CLINICAL_TEMPLATES.filter((t) => t.category === "medication")
    const clinicScoped = CLINICAL_TEMPLATES.filter((t) => t.scope === "clinic")
    const specialtyScoped = CLINICAL_TEMPLATES.filter((t) => t.scope === "specialty")

    assert.ok(conditions.length >= 6, "Must contain at least 6 condition templates")
    assert.ok(medications.length >= 6, "Must contain at least 6 medication templates")
    assert.ok(clinicScoped.length >= 3, "Must contain clinic-level templates")
    assert.ok(specialtyScoped.length >= 6, "Must contain specialty-level templates")
  })

  test("each template has a unique Name and valid hierarchical scope", () => {
    const names = new Set<string>()
    for (const t of CLINICAL_TEMPLATES) {
      assert.ok(t.name, "Template must have a unique Name")
      assert.ok(!names.has(t.name), `Duplicate template name found: ${t.name}`)
      names.add(t.name)
      assert.ok(
        t.scope === "clinic" || t.scope === "specialty" || t.scope === "doctor",
        `Scope must be clinic, specialty, or doctor. Got ${t.scope}`,
      )
    }
  })

  test("condition templates include common clinical conditions", () => {
    const titles = CLINICAL_TEMPLATES.filter((t) => t.category === "condition").map(
      (t) => t.title,
    )
    assert.ok(titles.some((t) => t.includes("Diabetes")), "Should include Diabetes template")
    assert.ok(titles.some((t) => t.includes("Hypertension")), "Should include Hypertension template")
    assert.ok(titles.some((t) => t.includes("Respiratory")), "Should include Respiratory template")
    assert.ok(titles.some((t) => t.includes("Gastritis") || t.includes("GERD")), "Should include Gastritis/GERD template")
    assert.ok(titles.some((t) => t.includes("Fever")), "Should include Fever template")
  })

  test("medication templates include common clinical drug classes", () => {
    const titles = CLINICAL_TEMPLATES.filter((t) => t.category === "medication").map(
      (t) => t.title,
    )
    assert.ok(titles.some((t) => t.includes("Metformin")), "Should include Metformin template")
    assert.ok(titles.some((t) => t.includes("Insulin")), "Should include Insulin template")
    assert.ok(titles.some((t) => t.includes("Antihypertensive")), "Should include Antihypertensive template")
    assert.ok(titles.some((t) => t.includes("Antibiotic")), "Should include Antibiotic template")
    assert.ok(titles.some((t) => t.includes("PPI")), "Should include PPI template")
    assert.ok(titles.some((t) => t.includes("NSAID")), "Should include NSAID template")
    assert.ok(titles.some((t) => t.includes("Statin")), "Should include Statin template")
  })

  test("all templates have non-empty advice and doctorNotes", () => {
    for (const tpl of CLINICAL_TEMPLATES) {
      assert.ok(tpl.id, "Template must have an id")
      assert.ok(tpl.title.trim().length > 0, `Template ${tpl.id} must have a title`)
      assert.ok(
        tpl.advice.trim().length >= 20,
        `Template ${tpl.title} must have comprehensive advice`,
      )
      assert.ok(
        (tpl.doctorNotes || tpl.remarks || "").trim().length >= 20,
        `Template ${tpl.title} must have comprehensive doctor notes`,
      )
    }
  })

  test("search by keyword matches appropriate template", () => {
    const query = "sugar"
    const matched = CLINICAL_TEMPLATES.filter(
      (t) =>
        t.title.toLowerCase().includes(query) ||
        (t.keywords || []).some((kw) => kw.includes(query)),
    )
    assert.ok(matched.length >= 2, "Should match diabetes and metformin templates")
    assert.ok(matched.some((t) => t.id === "dm2"))
    assert.ok(matched.some((t) => t.id === "med_metformin"))
  })

  test("combineTemplatesText allows doctor to select more than one template", () => {
    const t1 = CLINICAL_TEMPLATES.find((t) => t.id === "dm2")!
    const t2 = CLINICAL_TEMPLATES.find((t) => t.id === "htn")!
    assert.ok(t1 && t2, "Templates dm2 and htn must exist")

    // Multiple advice templates combined
    const multiAdvice = combineTemplatesText([t1, t2], "advice", "", "append")
    assert.ok(multiAdvice.includes(t1.advice), "Must contain template 1 advice")
    assert.ok(multiAdvice.includes(t2.advice), "Must contain template 2 advice")
    assert.ok(multiAdvice.includes("\n\n"), "Templates must be separated cleanly by newlines")

    // Appending to existing advice
    const existing = "Patient came for routine evaluation."
    const combinedWithExisting = combineTemplatesText([t1, t2], "advice", existing, "append")
    assert.ok(combinedWithExisting.startsWith(existing), "Must preserve existing advice at the beginning")
    assert.ok(combinedWithExisting.includes(t1.advice), "Must append template 1 advice")
    assert.ok(combinedWithExisting.includes(t2.advice), "Must append template 2 advice")

    // Multiple doctorNotes combined
    const multiNotes = combineTemplatesText([t1, t2], "doctorNotes", "", "append")
    assert.ok(multiNotes.includes(t1.doctorNotes), "Must contain template 1 doctorNotes")
    assert.ok(multiNotes.includes(t2.doctorNotes), "Must contain template 2 doctorNotes")

    // Replace mode replaces existing text
    const replaced = combineTemplatesText([t1, t2], "advice", existing, "replace")
    assert.ok(!replaced.includes(existing), "Replace mode must not contain old text")
    assert.ok(replaced.includes(t1.advice) && replaced.includes(t2.advice), "Must contain both selected templates")
  })
})
