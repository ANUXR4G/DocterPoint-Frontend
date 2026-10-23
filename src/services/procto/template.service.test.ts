import { test, describe } from "node:test";
import assert from "node:assert";
import {
  TemplateService,
  MASTER_DOCTOR_NOTE_TEMPLATES,
  type DoctorNoteTemplate,
} from "./template.service.js";

describe("TemplateService Hierarchical Scoping Model", () => {
  const mockTemplates: DoctorNoteTemplate[] = [
    {
      id: "t_clinic_1",
      name: "CLINIC-GENERAL",
      title: "Clinic General Health",
      category: "general",
      scope: "clinic",
      content: "Clinic global note",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "t_spec_cardio",
      name: "SPEC-CARDIOLOGY",
      title: "Cardiology Review",
      category: "condition",
      scope: "specialty",
      scopeValue: "Cardiology",
      content: "Cardiology specific note",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "t_spec_general",
      name: "SPEC-GEN-MED",
      title: "General Medicine Review",
      category: "condition",
      scope: "specialty",
      scopeValue: "General Medicine",
      content: "General medicine note",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "t_doc_alice",
      name: "DOC-ALICE-PRIVATE",
      title: "Dr. Alice Private Note",
      category: "general",
      scope: "doctor",
      createdById: "user_alice_123",
      createdByName: "Dr. Alice",
      content: "Alice's private note",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
    {
      id: "t_doc_bob",
      name: "DOC-BOB-PRIVATE",
      title: "Dr. Bob Private Note",
      category: "general",
      scope: "doctor",
      createdById: "user_bob_456",
      createdByName: "Dr. Bob",
      content: "Bob's private note",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
    },
  ];

  test("Clinic-level templates are globally visible to all doctors", () => {
    const forAlice = TemplateService.filterTemplatesByScope(mockTemplates, {
      doctorUserId: "user_alice_123",
      specialty: "General Medicine",
    });
    assert.ok(forAlice.some((t) => t.id === "t_clinic_1"));

    const forBob = TemplateService.filterTemplatesByScope(mockTemplates, {
      doctorUserId: "user_bob_456",
      specialty: "Cardiology",
    });
    assert.ok(forBob.some((t) => t.id === "t_clinic_1"));
  });

  test("Specialty-level templates are accessible to clinicians within that specialty", () => {
    const forCardio = TemplateService.filterTemplatesByScope(mockTemplates, {
      doctorUserId: "user_bob_456",
      specialty: "Cardiology",
    });
    assert.ok(
      forCardio.some((t) => t.id === "t_spec_cardio"),
      "Cardiology clinician should see cardiology template",
    );

    const forOrtho = TemplateService.filterTemplatesByScope(mockTemplates, {
      doctorUserId: "user_ortho_789",
      specialty: "Orthopedics",
    });
    assert.strictEqual(
      forOrtho.some((t) => t.id === "t_spec_cardio"),
      false,
      "Orthopedics clinician should NOT see cardiology template",
    );
  });

  test("Doctor-level templates are strictly private to the individual practitioner", () => {
    const forAlice = TemplateService.filterTemplatesByScope(mockTemplates, {
      doctorUserId: "user_alice_123",
      specialty: "General Medicine",
    });
    // Alice sees her own doctor-level template
    assert.ok(
      forAlice.some((t) => t.id === "t_doc_alice"),
      "Alice should see her own private template",
    );
    // Alice does NOT see Bob's doctor-level template
    assert.strictEqual(
      forAlice.some((t) => t.id === "t_doc_bob"),
      false,
      "Alice should NOT see Bob's private template",
    );

    const forBob = TemplateService.filterTemplatesByScope(mockTemplates, {
      doctorUserId: "user_bob_456",
      specialty: "Cardiology",
    });
    assert.ok(forBob.some((t) => t.id === "t_doc_bob"), "Bob sees his own private template");
    assert.strictEqual(
      forBob.some((t) => t.id === "t_doc_alice"),
      false,
      "Bob should NOT see Alice's private template",
    );
  });

  test("Specialty and Doctor combination rules: All doctors in specialty vs specific doctor", () => {
    const combinedTemplates: DoctorNoteTemplate[] = [
      {
        id: "t_all_all",
        name: "ALL-CLINIC",
        title: "Clinic Wide Template",
        category: "general",
        scope: "clinic",
        content: "Content",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "t_pediatrics_all",
        name: "SPEC-PEDIATRICS-ALL",
        title: "Pediatrics Dept Protocol",
        category: "condition",
        scope: "specialty",
        specialty: "Pediatrics",
        scopeValue: "Pediatrics",
        content: "Pediatrics advice and notes",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "t_pediatrics_doc_charles",
        name: "DOC-CHARLES-PEDIATRIC",
        title: "Dr. Charles Pediatrics Notes",
        category: "condition",
        scope: "doctor",
        specialty: "Pediatrics",
        doctorId: "user_charles",
        createdById: "user_charles",
        content: "Private to Dr. Charles",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    // Dr. Charles (Pediatrics) sees: clinic template, all pediatrics template, and his own doctor template
    const forCharles = TemplateService.filterTemplatesByScope(combinedTemplates, {
      doctorUserId: "user_charles",
      specialty: "Pediatrics",
    });
    assert.equal(forCharles.length, 3);
    assert.ok(forCharles.some((t) => t.id === "t_all_all"));
    assert.ok(forCharles.some((t) => t.id === "t_pediatrics_all"));
    assert.ok(forCharles.some((t) => t.id === "t_pediatrics_doc_charles"));

    // Dr. Dana (also Pediatrics) sees: clinic template, all pediatrics template, but NOT Charles's private template
    const forDana = TemplateService.filterTemplatesByScope(combinedTemplates, {
      doctorUserId: "user_dana",
      specialty: "Pediatrics",
    });
    assert.equal(forDana.length, 2);
    assert.ok(forDana.some((t) => t.id === "t_all_all"));
    assert.ok(forDana.some((t) => t.id === "t_pediatrics_all"));
    assert.strictEqual(forDana.some((t) => t.id === "t_pediatrics_doc_charles"), false);

    // Dr. Eric (Cardiology) sees: only clinic template
    const forEric = TemplateService.filterTemplatesByScope(combinedTemplates, {
      doctorUserId: "user_eric",
      specialty: "Cardiology",
    });
    assert.equal(forEric.length, 1);
    assert.equal(forEric[0].id, "t_all_all");
  });

  test("Master template catalog has valid clinic and specialty templates with unique names", () => {
    const names = new Set<string>();
    for (const t of MASTER_DOCTOR_NOTE_TEMPLATES) {
      assert.ok(t.name, "Template must have a unique Name");
      assert.ok(!names.has(t.name), `Duplicate template name found: ${t.name}`);
      names.add(t.name);
      assert.ok(
        t.scope === "clinic" || t.scope === "specialty" || t.scope === "doctor",
        "Must have valid scope",
      );
      assert.ok(t.content.length > 20, "Template must have non-empty Doctor Notes content");
    }
  });
});

