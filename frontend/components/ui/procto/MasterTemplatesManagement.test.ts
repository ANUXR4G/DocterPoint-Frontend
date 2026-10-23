import { test, describe } from "node:test"
import assert from "node:assert"
import {
  MASTER_ADVICE_CATEGORIES,
  resolveAdviceCategory,
} from "./MasterTemplatesManagement"
import { CLINICAL_TEMPLATES, type ClinicalTemplate } from "./TemplateSelector"

describe("MasterTemplatesManagement & Clinical Advice Categories", () => {
  test("defines comprehensive clinical advice categories covering major specialties", () => {
    assert.ok(
      MASTER_ADVICE_CATEGORIES.length >= 8,
      `Must define at least 8 advice categories, got ${MASTER_ADVICE_CATEGORIES.length}`,
    )

    const labels = MASTER_ADVICE_CATEGORIES.map((c) => c.label)
    assert.ok(labels.includes("Diabetes & Endocrine Care"), "Must include Diabetes & Endocrine Care")
    assert.ok(labels.includes("Cardiovascular & Hypertension"), "Must include Cardiovascular & Hypertension")
    assert.ok(labels.includes("Fever & Acute Viral Illness"), "Must include Fever & Acute Viral Illness")
    assert.ok(labels.includes("Respiratory & ENT Care"), "Must include Respiratory & ENT Care")
    assert.ok(labels.includes("Gastrointestinal & Acid Reflux"), "Must include Gastrointestinal & Acid Reflux")
    assert.ok(labels.includes("Musculoskeletal & Pain"), "Must include Musculoskeletal & Pain")
    assert.ok(labels.includes("General Health & Lifestyle"), "Must include General Health & Lifestyle")
  })

  test("each advice category has complete metadata (id, label, description, badgeColor, iconName)", () => {
    const ids = new Set<string>()
    for (const cat of MASTER_ADVICE_CATEGORIES) {
      assert.ok(cat.id, "Category must have id")
      assert.ok(!ids.has(cat.id), `Duplicate category id: ${cat.id}`)
      ids.add(cat.id)
      assert.ok(cat.label.trim().length > 0, "Category must have label")
      assert.ok(cat.description.trim().length > 10, "Category must have description")
      assert.ok(cat.badgeColor.trim().length > 0, "Category must have badgeColor")
      assert.ok(cat.iconName.trim().length > 0, "Category must have iconName")
      assert.ok(Array.isArray(cat.keywords) && cat.keywords.length > 0, "Category must have keywords")
    }
  })

  test("resolveAdviceCategory maps clinical templates to accurate advice categories", () => {
    const dm2 = CLINICAL_TEMPLATES.find((t) => t.id === "dm2")
    assert.ok(dm2, "Must find dm2 template")
    assert.strictEqual(
      resolveAdviceCategory(dm2),
      "Diabetes & Endocrine Care",
      "dm2 template must resolve to Diabetes & Endocrine Care",
    )

    const htn = CLINICAL_TEMPLATES.find((t) => t.id === "htn")
    assert.ok(htn, "Must find htn template")
    assert.strictEqual(
      resolveAdviceCategory(htn),
      "Cardiovascular & Hypertension",
      "htn template must resolve to Cardiovascular & Hypertension",
    )

    const fever = CLINICAL_TEMPLATES.find((t) => t.id === "fever")
    assert.ok(fever, "Must find fever template")
    assert.strictEqual(
      resolveAdviceCategory(fever),
      "Fever & Acute Viral Illness",
      "fever template must resolve to Fever & Acute Viral Illness",
    )

    const urti = CLINICAL_TEMPLATES.find((t) => t.id === "urti")
    assert.ok(urti, "Must find urti template")
    assert.strictEqual(
      resolveAdviceCategory(urti),
      "Respiratory & ENT Care",
      "urti template must resolve to Respiratory & ENT Care",
    )

    const gerd = CLINICAL_TEMPLATES.find((t) => t.id === "gerd")
    assert.ok(gerd, "Must find gerd template")
    assert.strictEqual(
      resolveAdviceCategory(gerd),
      "Gastrointestinal & Acid Reflux",
      "gerd template must resolve to Gastrointestinal & Acid Reflux",
    )

    const msk = CLINICAL_TEMPLATES.find((t) => t.id === "msk")
    assert.ok(msk, "Must find msk template")
    assert.strictEqual(
      resolveAdviceCategory(msk),
      "Musculoskeletal & Pain",
      "msk template must resolve to Musculoskeletal & Pain",
    )
  })

  test("resolveAdviceCategory respects explicit adviceCategory on custom templates", () => {
    const customTemplate: ClinicalTemplate = {
      id: "custom_pedi_asthma",
      name: "DOC-PEDI-ASTHMA",
      title: "Pediatric Asthma Action Plan",
      category: "condition",
      scope: "doctor",
      advice: "Take salbutamol inhaler with spacer as prescribed.",
      doctorNotes: "Wheeze audible bilaterally. Peak flow checked.",
      adviceCategory: "Pediatrics & Child Wellness" as any,
    }

    assert.strictEqual(
      resolveAdviceCategory(customTemplate),
      "Pediatrics & Child Wellness",
      "Must prioritize explicit adviceCategory",
    )
  })

  test("all templates have distinct clinical advice and doctor notes", () => {
    for (const tpl of CLINICAL_TEMPLATES) {
      assert.ok(tpl.advice.trim().length > 0, `Template ${tpl.name} must have advice`)
      assert.ok(
        (tpl.doctorNotes || tpl.remarks || "").trim().length > 0,
        `Template ${tpl.name} must have doctorNotes`,
      )
    }
  })

  test("Specialty and Doctor Name scoping rules for template creation", () => {
    function computeTemplateScope(specialty: string, doctorId: string) {
      const finalDocId = doctorId !== "all" ? doctorId : undefined
      const finalSpec = specialty !== "all" ? specialty : undefined

      if (finalDocId) {
        return {
          scope: "doctor" as const,
          scopeValue: finalDocId,
          doctorId: finalDocId,
          specialty: finalSpec,
        }
      }
      if (finalSpec) {
        return {
          scope: "specialty" as const,
          scopeValue: finalSpec,
          specialty: finalSpec,
          doctorId: undefined,
        }
      }
      return {
        scope: "clinic" as const,
        scopeValue: undefined,
        specialty: undefined,
        doctorId: undefined,
      }
    }

    // Default: Specialty is "all", Doctor is "all" -> clinic wide
    const defaultScope = computeTemplateScope("all", "all")
    assert.equal(defaultScope.scope, "clinic")
    assert.equal(defaultScope.specialty, undefined)
    assert.equal(defaultScope.doctorId, undefined)

    // User selects specialty and doctor name is all -> applicable for that Specialty doctors
    const specAll = computeTemplateScope("Cardiology", "all")
    assert.equal(specAll.scope, "specialty")
    assert.equal(specAll.specialty, "Cardiology")
    assert.equal(specAll.doctorId, undefined)

    // User selects specialty and selects a doctor -> applicable only for that doctor
    const specDoctor = computeTemplateScope("Cardiology", "doc_ananya")
    assert.equal(specDoctor.scope, "doctor")
    assert.equal(specDoctor.doctorId, "doc_ananya")
    assert.equal(specDoctor.specialty, "Cardiology")
  })

  test("SPEC-DM2-MGMT Type 2 Diabetes Mellitus Protocol specification", () => {
    const dm2 = CLINICAL_TEMPLATES.find((t) => t.id === "dm2")
    assert.ok(dm2, "Must find dm2 master template")
    assert.strictEqual(dm2.name, "SPEC-DM2-MGMT", "Must have code SPEC-DM2-MGMT")
    assert.strictEqual(dm2.title, "Type 2 Diabetes Mellitus Protocol", "Must have title Type 2 Diabetes Mellitus Protocol")
    assert.strictEqual(resolveAdviceCategory(dm2), "Diabetes & Endocrine Care")

    // Content sections validation
    assert.ok(dm2.advice.includes("Lifestyle & Dietary Precautions"), "Must include lifestyle and dietary advice")
    assert.ok(dm2.advice.includes("Warning Signs"), "Must include warning signs for hypoglycemia")
    assert.ok(dm2.doctorNotes.includes("Physical Assessment"), "Doctor notes must include physical assessment")
    assert.ok(dm2.doctorNotes.includes("Clinical Remarks"), "Doctor notes must include clinical remarks")
    assert.ok(dm2.doctorNotes.includes("Follow-up Plan"), "Doctor notes must include follow-up plan")

    // Auto-generate identifier logic
    function autoGenerateCode(title: string, scope: "clinic" | "specialty" | "doctor") {
      const prefix = scope === "clinic" ? "CLINIC" : scope === "specialty" ? "SPEC" : "DOC"
      if (/type\s*2\s*diabetes/i.test(title)) {
        return `${prefix}-DM2-MGMT`
      }
      const cleanTitle = title
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 20)
      return `${prefix}-${cleanTitle || "PROTOCOL"}`
    }

    assert.equal(autoGenerateCode("Type 2 Diabetes Mellitus Protocol", "specialty"), "SPEC-DM2-MGMT")
    assert.equal(autoGenerateCode("Type 2 Diabetes Mellitus Protocol", "clinic"), "CLINIC-DM2-MGMT")
    assert.equal(autoGenerateCode("Type 2 Diabetes Mellitus Protocol", "doctor"), "DOC-DM2-MGMT")
  })
})
