import { test, describe } from "node:test"
import assert from "node:assert"
import { CLINICAL_TEMPLATES } from "./TemplateSelector"

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
})
