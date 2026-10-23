import { prisma } from "../../db/prisma.js";
import { Prisma } from "@prisma/client";
import { AppError } from "../../core/response.js";
import { formatLocalDate } from "./slotEngine.js";

export type TemplateScope = "clinic" | "specialty" | "doctor";

export type DoctorNoteTemplate = {
  id: string;
  name: string;
  title: string;
  category: "condition" | "medication" | "general";
  scope: TemplateScope;
  scopeValue?: string; // Specialty name if specialty-scoped; doctor userId if doctor-scoped
  specialty?: string;
  doctorId?: string;
  doctorName?: string;
  practiceId?: string;
  createdById?: string;
  createdByName?: string;
  content: string; // Doctor Notes template text
  advice?: string; // Optional patient advice text
  effectiveDate?: string; // YYYY-MM-DD
  effectiveFrom?: string; // YYYY-MM-DD alias
  isCustom?: boolean;
  createdAt: string;
  updatedAt: string;
};

export const MASTER_DOCTOR_NOTE_TEMPLATES: DoctorNoteTemplate[] = [
  // ==========================================
  // CLINIC LEVEL (Globally visible to all doctors)
  // ==========================================
  {
    id: "clinic_gen_health",
    name: "CLINIC-GENERAL-HEALTH",
    title: "Clinic General Health Review",
    category: "general",
    scope: "clinic",
    content:
      "Routine clinical review. General condition stable, vital signs within normal limits. Reviewed current medications, compliance satisfactory. No acute distress or red-flag complaints. Advised standard preventive lifestyle care and routine follow-up as scheduled.",
    advice:
      "Maintain a balanced diet, adequate hydration, and moderate daily exercise. Take all prescribed medications regularly. Seek medical consultation promptly if new or concerning symptoms develop.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "clinic_physical_exam",
    name: "CLINIC-PHYSICAL-EXAM",
    title: "Comprehensive Physical Checkup",
    category: "general",
    scope: "clinic",
    content:
      "Comprehensive physical evaluation. Cardiovascular: S1/S2 heard, no murmurs. Respiratory: Bilateral vesicular breath sounds, no added sounds. Abdomen: Soft, non-tender, no organomegaly. Neurological: Alert, oriented, cranial nerves grossly intact. Preventive screening updated.",
    advice:
      "Continue routine daily physical activities. Maintain low-salt, balanced nutrition. Schedule annual preventive lab screening including lipid profile, fasting sugar, and renal parameters.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "clinic_emergency_triage",
    name: "CLINIC-EMERGENCY-TRIAGE",
    title: "Emergency Walk-in Triage Assessment",
    category: "general",
    scope: "clinic",
    content:
      "Walk-in acute evaluation. Airway patent, breathing spontaneous, hemodynamic status stabilized. Primary assessment conducted; immediate life threats ruled out. Symptomatic treatment administered on-site. Patient monitored until stable for outpatient management.",
    advice:
      "Strict rest for next 24-48 hours. Follow prescribed discharge medications accurately. Return to emergency department immediately if chest pain, shortness of breath, severe dizziness, or uncontrolled fever occurs.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "clinic_med_refill",
    name: "CLINIC-MED-REFILL",
    title: "Routine Medication Refill Review",
    category: "medication",
    scope: "clinic",
    content:
      "Prescription refill visit for chronic stable medical conditions. Tolerating current pharmacological regimen well with no adverse drug reactions reported. Chronic disease parameters stable. Prescriptions renewed for 30-60 days with routine monitoring scheduled.",
    advice:
      "Continue all chronic maintenance medications as prescribed without skipping doses. Maintain logbook of vitals/symptoms and bring current medicines along to each follow-up review.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "clinic_post_procedure",
    name: "CLINIC-POST-PROCEDURE",
    title: "Post-Procedure Follow-Up",
    category: "general",
    scope: "clinic",
    content:
      "Post-procedure wound and recovery assessment. Surgical/procedure site clean, dry, and intact with no erythema, purulent discharge, or hematoma. Healing progressing satisfactorily. Sutures/dressing inspected. No systemic signs of infection.",
    advice:
      "Keep the dressing clean and dry. Avoid soaking in baths or strenuous activities until clearance. Take prescribed pain relievers and antibiotics as directed. Report immediately if redness, increasing pain, foul odor, or fever develops.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },

  // ==========================================
  // SPECIALTY LEVEL (Accessible within specialty)
  // ==========================================
  {
    id: "spec_dm2_mgmt",
    name: "SPEC-DM2-MGMT",
    title: "Type 2 Diabetes Mellitus Protocol",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    specialty: "Diabetology & Endocrinology",
    content:
      "Physical Assessment: Foot examination performed - sensation intact bilaterally, pedal pulses palpable. Target HbA1c < 7.0%. Clinical Remarks: Type 2 DM assessment; reviewed glycemic trends and medication compliance. Follow-up Plan: Advised annual dilated retinal exam and urine ACR. Next review in 4-6 weeks with home blood glucose log.",
    advice:
      "Lifestyle & Dietary Precautions: Follow low glycemic index diabetic diet. Avoid refined sugars, sweets, and sweetened beverages. Engage in moderate aerobic exercise (brisk walking) 30 min daily. Monitor fasting and 2-hr postprandial blood sugar weekly. Warning Signs: Keep simple carbohydrates (glucose tabs/fruit juice) accessible for hypoglycemia (sweating, dizziness, trembling). Report foot lesions or numbness promptly.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_htn_review",
    name: "SPEC-HTN-REVIEW",
    title: "Essential Hypertension Assessment",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Essential hypertension review. BP monitored today; evaluated cardiovascular risk factors. No orthostatic hypotension, chest discomfort, or visual symptoms. Target BP < 130/80 mmHg. Counseled on sodium restriction and weight management. Follow-up scheduled with home BP chart.",
    advice:
      "Follow low-sodium DASH diet (< 2g sodium/day). Restrict intake of pickles, papad, processed meats, and added salt. Walk briskly for 30-40 minutes 5 days a week. Record resting BP in a logbook twice weekly at home. Do not miss doses or discontinue antihypertensives abruptly.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_urti_protocol",
    name: "SPEC-URTI-PROTOCOL",
    title: "Upper Respiratory Tract Infection Protocol",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Acute upper respiratory tract infection. Throat mildly congested, bilateral chest clear on auscultation, no wheeze or crepitations. SpO2 normal on room air. Prescribed symptomatic decongestants and antipyretics. Advised urgent review if fever persists > 3 days or dyspnea develops.",
    advice:
      "Drink plenty of warm fluids throughout the day. Perform steam inhalation twice daily and warm saline gargles 3-4 times daily. Avoid chilled items, air pollution, and passive smoking. Use face mask in public to protect others. Seek emergency care if breathing difficulty develops.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_fever_viral",
    name: "SPEC-FEVER-VIRAL",
    title: "Acute Viral Illness & Febrile Episode",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Acute febrile illness consistent with viral syndrome. Systemic examination unremarkable with no localized bacterial focus. Hydration adequate, vitals stable. Prescribed symptomatic antipyretics. Advised complete blood count & dengue serology if fever persists beyond 72 hours.",
    advice:
      "Maintain complete bed rest and drink abundant fluids (ORS, coconut water, lemon water, clear soups) to prevent dehydration. Take prescribed paracetamol every 6 hours only if temperature exceeds 100°F. Apply lukewarm water sponge if temperature is high. Avoid self-medicating with combination pain tablets.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_gerd_gastritis",
    name: "SPEC-GERD-GASTRITIS",
    title: "GERD & Acid Peptic Disorder Evaluation",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "GERD / acute gastritis exacerbation. Epigastric tenderness without rebound or guarding. No dysphagia, unexplained weight loss, or melena. Commenced on acid suppression (PPI/H2RA) and mucosal protectant. Reviewed dietary triggers.",
    advice:
      "Consume small, frequent, bland meals. Avoid spicy, oily, acidic foods, deep-fried snacks, and citrus fruits. Refrain from lying down within 2 hours after meals. Elevate head of bed by 6 inches. Minimize coffee, tea, alcohol, and carbonated beverages.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_msk_strain",
    name: "SPEC-MSK-STRAIN",
    title: "Musculoskeletal Strain & Mechanical Back Pain",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Acute musculoskeletal strain / mechanical low back pain. Paraspinal muscle spasm noted; straight leg raise test negative bilaterally, deep tendon reflexes intact with no neurological compromise. Short-course analgesics and muscle relaxants prescribed. Advised core strengthening exercises post-recovery.",
    advice:
      "Apply local cold compress for first 48 hours, followed by warm moist compress for 15-20 minutes twice daily. Avoid heavy lifting, forward bending, and sudden twisting movements. Sleep on a firm mattress with pillow under knees. Maintain ergonomic posture with lumbar support.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_med_metformin",
    name: "SPEC-MED-METFORMIN",
    title: "Metformin / Oral Antidiabetics Protocol",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Metformin therapy reviewed/initiated. Titration schedule explained to mitigate GI side effects. Baseline eGFR and renal parameters checked (within safe margin). Patient educated on early hypoglycemia symptoms.",
    advice:
      "Take strictly with or immediately after main meals to minimize stomach upset, bloating, or nausea. Do not skip meals while taking antidiabetic medication. Avoid heavy alcohol intake. Keep emergency sweets/sugar packets with you at all times.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_med_antibiotic",
    name: "SPEC-MED-ANTIBIOTIC",
    title: "Antibiotic Regimen Compliance Note",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Antibiotic regimen prescribed for active infection. Emphasized strict course compliance to prevent bacterial resistance. Screened for drug allergies (penicillin/cephalosporin). Advised probiotics support.",
    advice:
      "Take doses at evenly spaced intervals with a full glass of water. It is essential to complete the entire course of medication as prescribed, even if you feel completely healthy after a couple of days. Premature stoppage can cause infection relapse and antibiotic resistance.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "spec_med_nsaid",
    name: "SPEC-MED-NSAID",
    title: "NSAID Analgesic Protocol & Gastric Cover",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    content:
      "Short-course NSAID therapy prescribed for acute analgesia. Gastrointestinal and renal risk factors reviewed. PPI gastric protection added. Advised to discontinue once acute pain subsides.",
    advice:
      "Always take strictly after food or with milk to protect your stomach lining. Use only on an as-needed basis for pain and stop once relief is achieved. Drink plenty of water throughout the day. Do not take with other anti-inflammatory drugs or aspirin without checking with doctor.",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

export class TemplateService {
  /** Resolve practice ID for a user. */
  static async getPracticeIdForUser(userId: string): Promise<string | null> {
    const member = await prisma.practiceMember.findFirst({
      where: { userId, isActive: true },
      select: { practiceId: true },
    });
    return member?.practiceId ?? null;
  }

  /**
   * Filter templates based on hierarchical scoping:
   * 1. Clinic level: Globally visible to all doctors within the clinic.
   * 2. Specialty level: Accessible to clinicians in that specific specialty.
   * 3. Doctor level: Strictly private and restricted to the individual practitioner who created them.
   */
  static filterTemplatesByScope(
    templates: DoctorNoteTemplate[],
    opts: {
      doctorUserId?: string | null;
      specialty?: string | null;
    },
  ): DoctorNoteTemplate[] {
    const doctorId = (opts.doctorUserId || "").trim().toLowerCase();
    const spec = (opts.specialty || "").trim().toLowerCase();

    return templates.filter((t) => {
      // 1. Clinic-level templates are globally visible to all doctors in the facility
      if (t.scope === "clinic") {
        return true;
      }

      // 2. Specialty-level templates are accessible to all clinicians in that specialty
      if (t.scope === "specialty") {
        const templateSpec = (t.specialty || t.scopeValue || "").trim().toLowerCase();
        if (!templateSpec) return true;
        if (!spec) return true;
        return (
          templateSpec === spec ||
          spec.includes(templateSpec) ||
          templateSpec.includes(spec) ||
          templateSpec === "general medicine" ||
          spec === "general"
        );
      }

      // 3. Doctor-level templates are strictly private to the creating/target practitioner
      if (t.scope === "doctor") {
        const targetDoc = (t.doctorId || t.createdById || t.scopeValue || "").trim().toLowerCase();
        return Boolean(doctorId && targetDoc === doctorId);
      }

      return false;
    });
  }

  /**
   * List templates for a doctor within a practice applying hierarchical scoping.
   */
  static async listTemplates(opts: {
    practiceId?: string | null;
    doctorUserId?: string | null;
    specialty?: string | null;
  }): Promise<DoctorNoteTemplate[]> {
    let practiceCustomTemplates: DoctorNoteTemplate[] = [];

    let practiceId = opts.practiceId;
    if (!practiceId && opts.doctorUserId) {
      practiceId = (await this.getPracticeIdForUser(opts.doctorUserId)) ?? undefined;
    }

    if (practiceId) {
      const practice = await prisma.practice.findUnique({
        where: { id: practiceId },
        select: { clinicalMasters: true, specialty: true },
      });
      if (practice?.specialty && !opts.specialty) {
        opts.specialty = practice.specialty;
      }
      const rawMasters = practice?.clinicalMasters as Record<string, unknown> | null;
      if (rawMasters && Array.isArray(rawMasters.doctorNoteTemplates)) {
        practiceCustomTemplates = rawMasters.doctorNoteTemplates as DoctorNoteTemplate[];
      }
    }

    // Merge baseline master templates with practice custom templates
    const all = [...MASTER_DOCTOR_NOTE_TEMPLATES, ...practiceCustomTemplates];

    // Filter strictly according to the hierarchical scoping model
    return this.filterTemplatesByScope(all, {
      doctorUserId: opts.doctorUserId,
      specialty: opts.specialty,
    });
  }

  /**
   * Save a new template created by a doctor directly from the consultation UI.
   */
  static async createTemplate(
    practiceId: string,
    doctorUserId: string,
    doctorName: string,
    data: {
      name: string;
      title?: string;
      content: string;
      advice?: string;
      category?: "condition" | "medication" | "general";
      scope: TemplateScope;
      scopeValue?: string;
      specialty?: string;
      doctorId?: string;
      doctorName?: string;
    },
  ): Promise<DoctorNoteTemplate> {
    let name = String(data.name || "").trim();
    if (!name) {
      const prefix = data.scope === "clinic" ? "CLINIC" : data.scope === "specialty" ? "SPEC" : "DOC";
      if (/type\s*2\s*diabetes/i.test(data.title || "")) {
        name = `${prefix}-DM2-MGMT`;
      } else {
        const cleanTitle = (data.title || "TEMPLATE")
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 20);
        name = `${prefix}-${cleanTitle || "PROTOCOL"}-${Math.floor(1000 + Math.random() * 9000)}`;
      }
    }
    const content = String(data.content || "").trim();
    if (!content) {
      throw new AppError(400, "Template content is required.");
    }

    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true, specialty: true },
    });
    if (!practice) {
      throw new AppError(404, "Practice not found.");
    }

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: DoctorNoteTemplate[] = Array.isArray(rawMasters.doctorNoteTemplates)
      ? (rawMasters.doctorNoteTemplates as DoctorNoteTemplate[])
      : [];

    const targetDocId = data.doctorId?.trim() || (data.scope === "doctor" ? doctorUserId : undefined);
    const targetDocName = data.doctorName?.trim() || (data.scope === "doctor" ? doctorName : undefined);
    const targetSpec = data.specialty?.trim() || (data.scope === "specialty" ? data.scopeValue?.trim() : undefined);

    const today = formatLocalDate(new Date());
    const effectiveDate = data.effectiveDate?.trim() || data.effectiveFrom?.trim() || today;

    // Ensure Name is unique within the practice/doctor scope
    let existingName = existingList.find(
      (t) =>
        t.name.trim().toLowerCase() === name.toLowerCase() &&
        (t.scope === data.scope || (data.scope === "doctor" && (t.doctorId === targetDocId || t.createdById === targetDocId))),
    );
    if (existingName) {
      if (!data.name?.trim()) {
        name = `${name}-${Math.floor(1000 + Math.random() * 9000)}`;
      } else {
        throw new AppError(400, `A template with the name "${name}" already exists.`);
      }
    }

    const id = `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newTemplate: DoctorNoteTemplate = {
      id,
      name,
      title: (data.title || name).trim(),
      category: data.category || "general",
      scope: data.scope,
      scopeValue:
        data.scope === "specialty"
          ? (targetSpec || practice.specialty || "General Medicine").trim()
          : data.scope === "doctor"
          ? (targetDocId || doctorUserId)
          : undefined,
      practiceId,
      createdById: targetDocId || doctorUserId,
      createdByName: targetDocName || doctorName,
      specialty: targetSpec,
      doctorId: targetDocId,
      doctorName: targetDocName,
      content,
      advice: data.advice?.trim() || undefined,
      effectiveDate,
      effectiveFrom: effectiveDate,
      isCustom: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const nextList = [...existingList, newTemplate];
    const nextMasters = {
      ...rawMasters,
      doctorNoteTemplates: nextList,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return newTemplate;
  }

  /**
   * Delete a custom template (only author or clinic admin can delete).
   */
  static async deleteTemplate(
    practiceId: string,
    doctorUserId: string,
    templateId: string,
  ): Promise<boolean> {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true },
    });
    if (!practice) return false;

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: DoctorNoteTemplate[] = Array.isArray(rawMasters.doctorNoteTemplates)
      ? (rawMasters.doctorNoteTemplates as DoctorNoteTemplate[])
      : [];

    const target = existingList.find((t) => t.id === templateId);
    if (!target) return false;

    // Standard master templates cannot be deleted to preserve system integrity
    if (!target.isCustom && MASTER_DOCTOR_NOTE_TEMPLATES.some((m) => m.id === templateId)) {
      throw new AppError(403, "Standard master templates cannot be deleted to preserve system integrity.");
    }

    // Doctor can only delete their own templates unless clinic admin
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId, userId: doctorUserId } },
    });
    const isAdmin = member?.role === "PRACTICE_OWNER" || member?.role === "PRACTICE_ADMIN";
    if (target.createdById !== doctorUserId && !isAdmin) {
      throw new AppError(403, "You can only delete templates created by you.");
    }

    const filtered = existingList.filter((t) => t.id !== templateId);
    const nextMasters = {
      ...rawMasters,
      doctorNoteTemplates: filtered,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return true;
  }

  /**
   * Update an existing custom template.
   */
  static async updateTemplate(
    practiceId: string,
    doctorUserId: string,
    templateId: string,
    patch: {
      name?: string;
      title?: string;
      content?: string;
      advice?: string;
      category?: string;
      scope?: TemplateScope;
      scopeValue?: string;
      specialty?: string;
      doctorId?: string;
      doctorName?: string;
    },
  ): Promise<DoctorNoteTemplate> {
    const practice = await prisma.practice.findUnique({
      where: { id: practiceId },
      select: { clinicalMasters: true, specialty: true },
    });
    if (!practice) {
      throw new AppError(404, "Practice not found.");
    }

    const rawMasters = (practice.clinicalMasters as Record<string, unknown> | null) ?? {};
    const existingList: DoctorNoteTemplate[] = Array.isArray(rawMasters.doctorNoteTemplates)
      ? (rawMasters.doctorNoteTemplates as DoctorNoteTemplate[])
      : [];

    const index = existingList.findIndex((t) => t.id === templateId);
    if (index === -1) {
      // If template was from predefined list, add it to custom overrides
      const predefined = MASTER_DOCTOR_NOTE_TEMPLATES.find((t) => t.id === templateId);
      if (!predefined) {
        throw new AppError(404, "Template not found.");
      }
      const overridden: DoctorNoteTemplate = {
        ...predefined,
        ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
        ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
        ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
        ...(patch.advice !== undefined ? { advice: patch.advice.trim() } : {}),
        ...(patch.category !== undefined ? { category: patch.category as any } : {}),
        ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
        ...(patch.scopeValue !== undefined ? { scopeValue: patch.scopeValue } : {}),
        ...(patch.specialty !== undefined ? { specialty: patch.specialty?.trim() || undefined } : {}),
        ...(patch.doctorId !== undefined ? { doctorId: patch.doctorId?.trim() || undefined } : {}),
        ...(patch.doctorName !== undefined ? { doctorName: patch.doctorName?.trim() || undefined } : {}),
        isCustom: true,
        updatedAt: new Date().toISOString(),
      };
      existingList.push(overridden);
      const nextMasters = {
        ...rawMasters,
        doctorNoteTemplates: existingList,
      };
      await prisma.practice.update({
        where: { id: practiceId },
        data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
      });
      return overridden;
    }

    const target = existingList[index];
    const member = await prisma.practiceMember.findUnique({
      where: { practiceId_userId: { practiceId, userId: doctorUserId } },
    });
    const isAdmin = member?.role === "PRACTICE_OWNER" || member?.role === "PRACTICE_ADMIN";
    if (target.createdById && target.createdById !== doctorUserId && !isAdmin) {
      throw new AppError(403, "You can only edit templates created by you or your clinic.");
    }

    const updated: DoctorNoteTemplate = {
      ...target,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.title !== undefined ? { title: patch.title.trim() } : {}),
      ...(patch.content !== undefined ? { content: patch.content.trim() } : {}),
      ...(patch.advice !== undefined ? { advice: patch.advice.trim() } : {}),
      ...(patch.category !== undefined ? { category: patch.category as any } : {}),
      ...(patch.scope !== undefined ? { scope: patch.scope } : {}),
      ...(patch.scopeValue !== undefined ? { scopeValue: patch.scopeValue } : {}),
      ...(patch.specialty !== undefined ? { specialty: patch.specialty?.trim() || undefined } : {}),
      ...(patch.doctorId !== undefined ? { doctorId: patch.doctorId?.trim() || undefined } : {}),
      ...(patch.doctorName !== undefined ? { doctorName: patch.doctorName?.trim() || undefined } : {}),
      updatedAt: new Date().toISOString(),
    };
    if (patch.doctorId && patch.scope === "doctor") {
      updated.createdById = patch.doctorId;
      updated.scopeValue = patch.doctorId;
    }
    if (patch.doctorName) {
      updated.createdByName = patch.doctorName;
    }

    existingList[index] = updated;
    const nextMasters = {
      ...rawMasters,
      doctorNoteTemplates: existingList,
    };

    await prisma.practice.update({
      where: { id: practiceId },
      data: { clinicalMasters: nextMasters as Prisma.InputJsonValue },
    });

    return updated;
  }
}

