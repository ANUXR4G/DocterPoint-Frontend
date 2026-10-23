"use client"

import { useState, useRef, useEffect, useId } from "react"
import { proctoService } from "../../../lib/services/procto"
import { toast } from "sonner"

export type TemplateScope = "clinic" | "specialty" | "doctor"
export type TemplateCategory = "condition" | "medication" | "general"

export type ClinicalTemplate = {
  id: string
  name: string // Unique Name
  title: string
  category: TemplateCategory
  adviceCategory?: string
  scope: TemplateScope
  scopeValue?: string
  specialty?: string
  doctorId?: string
  doctorName?: string
  advice: string
  doctorNotes: string // Formerly remarks
  remarks?: string // Compatibility alias
  content?: string
  keywords?: string[]
  createdById?: string
  createdByName?: string
  isCustom?: boolean
}

export const CLINICAL_TEMPLATES: ClinicalTemplate[] = [
  // ==========================================
  // CLINIC LEVEL (Globally visible to all doctors within the facility)
  // ==========================================
  {
    id: "clinic_gen_health",
    name: "CLINIC-GENERAL-HEALTH",
    title: "Clinic General Health Review",
    category: "general",
    scope: "clinic",
    keywords: ["general", "routine", "annual", "checkup", "vitals", "clinic"],
    advice:
      "Maintain a balanced diet, adequate hydration, and moderate daily exercise. Take all prescribed medications regularly. Seek medical consultation promptly if new or concerning symptoms develop.",
    doctorNotes:
      "Routine clinical review. General condition stable, vital signs within normal limits. Reviewed current medications, compliance satisfactory. No acute distress or red-flag complaints. Advised standard preventive lifestyle care and routine follow-up as scheduled.",
    remarks:
      "Routine clinical review. General condition stable, vital signs within normal limits. Reviewed current medications, compliance satisfactory. No acute distress or red-flag complaints. Advised standard preventive lifestyle care and routine follow-up as scheduled.",
  },
  {
    id: "clinic_physical_exam",
    name: "CLINIC-PHYSICAL-EXAM",
    title: "Comprehensive Physical Checkup",
    category: "general",
    scope: "clinic",
    keywords: ["physical", "exam", "checkup", "screening", "systemic"],
    advice:
      "Continue routine daily physical activities. Maintain low-salt, balanced nutrition. Schedule annual preventive lab screening including lipid profile, fasting sugar, and renal parameters.",
    doctorNotes:
      "Comprehensive physical evaluation. Cardiovascular: S1/S2 heard, no murmurs. Respiratory: Bilateral vesicular breath sounds, no added sounds. Abdomen: Soft, non-tender, no organomegaly. Neurological: Alert, oriented, cranial nerves intact. Preventive screening updated.",
    remarks:
      "Comprehensive physical evaluation. Cardiovascular: S1/S2 heard, no murmurs. Respiratory: Bilateral vesicular breath sounds, no added sounds. Abdomen: Soft, non-tender, no organomegaly. Neurological: Alert, oriented, cranial nerves intact. Preventive screening updated.",
  },
  {
    id: "clinic_emergency_triage",
    name: "CLINIC-EMERGENCY-TRIAGE",
    title: "Emergency Walk-in Triage Assessment",
    category: "general",
    scope: "clinic",
    keywords: ["emergency", "walk-in", "triage", "acute", "urgent"],
    advice:
      "Strict rest for next 24-48 hours. Follow prescribed discharge medications accurately. Return to emergency department immediately if chest pain, shortness of breath, severe dizziness, or uncontrolled fever occurs.",
    doctorNotes:
      "Walk-in acute evaluation. Airway patent, breathing spontaneous, hemodynamic status stabilized. Primary assessment conducted; immediate life threats ruled out. Symptomatic treatment administered on-site. Patient monitored until stable for outpatient management.",
    remarks:
      "Walk-in acute evaluation. Airway patent, breathing spontaneous, hemodynamic status stabilized. Primary assessment conducted; immediate life threats ruled out. Symptomatic treatment administered on-site. Patient monitored until stable for outpatient management.",
  },
  {
    id: "clinic_med_refill",
    name: "CLINIC-MED-REFILL",
    title: "Routine Medication Refill Review",
    category: "medication",
    scope: "clinic",
    keywords: ["refill", "repeat", "prescription", "chronic", "stable"],
    advice:
      "Continue all chronic maintenance medications as prescribed without skipping doses. Maintain logbook of vitals/symptoms and bring current medicines along to each follow-up review.",
    doctorNotes:
      "Prescription refill visit for chronic stable medical conditions. Tolerating current pharmacological regimen well with no adverse drug reactions reported. Chronic disease parameters stable. Prescriptions renewed for 30-60 days with routine monitoring scheduled.",
    remarks:
      "Prescription refill visit for chronic stable medical conditions. Tolerating current pharmacological regimen well with no adverse drug reactions reported. Chronic disease parameters stable. Prescriptions renewed for 30-60 days with routine monitoring scheduled.",
  },
  {
    id: "clinic_post_procedure",
    name: "CLINIC-POST-PROCEDURE",
    title: "Post-Procedure Follow-Up",
    category: "general",
    scope: "clinic",
    keywords: ["wound", "procedure", "surgical", "healing", "post-op"],
    advice:
      "Keep the dressing clean and dry. Avoid soaking in baths or strenuous activities until clearance. Take prescribed pain relievers and antibiotics as directed. Report immediately if redness, increasing pain, foul odor, or fever develops.",
    doctorNotes:
      "Post-procedure wound and recovery assessment. Surgical/procedure site clean, dry, and intact with no erythema, purulent discharge, or hematoma. Healing progressing satisfactorily. Sutures/dressing inspected. No systemic signs of infection.",
    remarks:
      "Post-procedure wound and recovery assessment. Surgical/procedure site clean, dry, and intact with no erythema, purulent discharge, or hematoma. Healing progressing satisfactorily. Sutures/dressing inspected. No systemic signs of infection.",
  },

  // ==========================================
  // SPECIALTY LEVEL (Accessible within specialty)
  // ==========================================
  {
    id: "dm2",
    name: "SPEC-DM2-REVIEW",
    title: "Type 2 Diabetes Mellitus Comprehensive Review",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["diabetes", "sugar", "glucose", "metformin", "insulin", "dm", "hba1c"],
    advice:
      "Follow low glycemic index diabetic diet. Avoid refined sugars, sweets, and sweetened beverages. Engage in moderate aerobic exercise (brisk walking) 30 min daily. Monitor fasting and 2-hr postprandial blood sugar weekly. Keep simple carbohydrates (glucose tabs/fruit juice) accessible for hypoglycemia (sweating, dizziness, trembling). Report foot lesions or numbness promptly.",
    doctorNotes:
      "Type 2 DM assessment. Reviewed glycemic trends and medication compliance. Foot examination performed - sensation intact, pedal pulses palpable. Target HbA1c < 7.0%. Advised annual dilated retinal exam and urine ACR. Next review in 4-6 weeks with blood glucose log.",
    remarks:
      "Type 2 DM assessment. Reviewed glycemic trends and medication compliance. Foot examination performed - sensation intact, pedal pulses palpable. Target HbA1c < 7.0%. Advised annual dilated retinal exam and urine ACR. Next review in 4-6 weeks with blood glucose log.",
  },
  {
    id: "htn",
    name: "SPEC-HTN-REVIEW",
    title: "Essential Hypertension Assessment",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["blood pressure", "bp", "hypertension", "salt", "cardiac", "stroke"],
    advice:
      "Follow low-sodium DASH diet (< 2g sodium/day). Restrict intake of pickles, papad, processed meats, and added salt. Walk briskly for 30-40 minutes 5 days a week. Record resting BP in a logbook twice weekly at home. Do not miss doses or discontinue antihypertensives abruptly. Seek emergency care for severe headache, blurred vision, or chest pain.",
    doctorNotes:
      "Essential hypertension review. BP monitored today; evaluated cardiovascular risk factors. No orthostatic hypotension, chest discomfort, or visual symptoms. Target BP < 130/80 mmHg. Counseled on sodium restriction and weight management. Follow-up scheduled with home BP chart.",
    remarks:
      "Essential hypertension review. BP monitored today; evaluated cardiovascular risk factors. No orthostatic hypotension, chest discomfort, or visual symptoms. Target BP < 130/80 mmHg. Counseled on sodium restriction and weight management. Follow-up scheduled with home BP chart.",
  },
  {
    id: "urti",
    name: "SPEC-URTI-PROTOCOL",
    title: "Upper Respiratory Tract Infection (URTI)",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["cough", "cold", "sore throat", "runny nose", "congestion", "flu", "respiratory"],
    advice:
      "Drink plenty of warm fluids throughout the day. Perform steam inhalation twice daily and warm saline gargles 3-4 times daily. Avoid chilled items, air pollution, and passive smoking. Use face mask in public to protect others. Seek immediate medical attention if breathing difficulty, persistent high fever (>102°F), or hemoptysis occurs.",
    doctorNotes:
      "Acute upper respiratory tract infection. Throat mildly congested, bilateral chest clear on auscultation, no wheeze or crepitations. SpO2 normal on room air. Prescribed symptomatic decongestants and antipyretics. Advised urgent review if fever persists > 3 days or dyspnea develops.",
    remarks:
      "Acute upper respiratory tract infection. Throat mildly congested, bilateral chest clear on auscultation, no wheeze or crepitations. SpO2 normal on room air. Prescribed symptomatic decongestants and antipyretics. Advised urgent review if fever persists > 3 days or dyspnea develops.",
  },
  {
    id: "fever",
    name: "SPEC-FEVER-VIRAL",
    title: "Acute Viral Illness / Fever Diagnosis",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["fever", "viral", "temperature", "body ache", "flu", "weakness"],
    advice:
      "Maintain complete bed rest and drink abundant fluids (ORS, coconut water, lemon water, clear soups) to prevent dehydration. Take prescribed paracetamol every 6 hours only if temperature exceeds 100°F. Apply lukewarm water sponge if temperature is high. Avoid self-medicating with combination pain tablets. Report persistent vomiting, rash, or extreme lethargy.",
    doctorNotes:
      "Acute febrile illness consistent with viral syndrome. Systemic examination unremarkable with no localized bacterial focus. Hydration adequate, vitals stable. Prescribed symptomatic antipyretics. Advised complete blood count & dengue serology if fever persists beyond 72 hours.",
    remarks:
      "Acute febrile illness consistent with viral syndrome. Systemic examination unremarkable with no localized bacterial focus. Hydration adequate, vitals stable. Prescribed symptomatic antipyretics. Advised complete blood count & dengue serology if fever persists beyond 72 hours.",
  },
  {
    id: "gerd",
    name: "SPEC-GERD-GASTRITIS",
    title: "Acute Gastritis / GERD",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["acid", "reflux", "heartburn", "acidity", "gastric", "stomach", "ulcer"],
    advice:
      "Consume small, frequent, bland meals. Avoid spicy, oily, acidic foods, deep-fried snacks, and citrus fruits. Refrain from lying down within 2 hours after meals. Elevate head of bed by 6 inches. Minimize coffee, tea, alcohol, and carbonated beverages. Do not take non-prescription NSAID pain relievers on an empty stomach.",
    doctorNotes:
      "GERD / acute gastritis exacerbation. Epigastric tenderness without rebound or guarding. No dysphagia, unexplained weight loss, or melena. Commenced on acid suppression (PPI/H2RA) and mucosal protectant. Reviewed dietary triggers.",
    remarks:
      "GERD / acute gastritis exacerbation. Epigastric tenderness without rebound or guarding. No dysphagia, unexplained weight loss, or melena. Commenced on acid suppression (PPI/H2RA) and mucosal protectant. Reviewed dietary triggers.",
  },
  {
    id: "age",
    name: "SPEC-GASTROENTERITIS",
    title: "Acute Gastroenteritis / Diarrhea",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["diarrhea", "loose motions", "vomiting", "stomach infection", "ors", "gut"],
    advice:
      "Drink Oral Rehydration Salt (ORS) solution after every loose stool. Consume a BRAT diet (bananas, rice, applesauce, toast) and curd/buttermilk. Avoid dairy products, raw salads, greasy foods, and sugary drinks. Wash hands thoroughly before eating. Seek immediate care if signs of severe dehydration (sunken eyes, dry mouth, no urination for 6 hours) or blood in stool occur.",
    doctorNotes:
      "Acute gastroenteritis. Abdomen soft, non-tender, active bowel sounds. Hydration status mild dehydration; capillary refill < 2s. Prescribed oral rehydration, zinc, and probiotics. Advised red-flag warning signs.",
    remarks:
      "Acute gastroenteritis. Abdomen soft, non-tender, active bowel sounds. Hydration status mild dehydration; capillary refill < 2s. Prescribed oral rehydration, zinc, and probiotics. Advised red-flag warning signs.",
  },
  {
    id: "msk",
    name: "SPEC-MSK-STRAIN",
    title: "Musculoskeletal Strain / Low Back Pain",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["back pain", "neck pain", "sprain", "strain", "muscle", "joint", "ortho"],
    advice:
      "Apply local cold compress for first 48 hours, followed by warm moist compress for 15-20 minutes twice daily. Avoid heavy lifting, forward bending, and sudden twisting movements. Sleep on a firm mattress with pillow under knees. Maintain ergonomic posture with lumbar support while working. Perform gentle stretching once acute pain eases.",
    doctorNotes:
      "Acute musculoskeletal strain / mechanical low back pain. Paraspinal muscle spasm noted; straight leg raise test negative bilaterally, deep tendon reflexes intact with no neurological compromise. Short-course analgesics and muscle relaxants prescribed. Advised core strengthening exercises post-recovery.",
    remarks:
      "Acute musculoskeletal strain / mechanical low back pain. Paraspinal muscle spasm noted; straight leg raise test negative bilaterally, deep tendon reflexes intact with no neurological compromise. Short-course analgesics and muscle relaxants prescribed. Advised core strengthening exercises post-recovery.",
  },
  {
    id: "dyslip",
    name: "SPEC-DYSLIPIDEMIA",
    title: "Dyslipidemia / Hypercholesterolemia",
    category: "condition",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["cholesterol", "lipid", "triglycerides", "ldl", "hdl", "heart", "statin"],
    advice:
      "Adopt a heart-healthy Mediterranean-style diet. Increase dietary fiber (oats, legumes, vegetables) and reduce intake of saturated fats, hydrogenated oils, red meat, and bakery goods. Exercise moderately for 45 minutes at least 5 days a week. Maintain a healthy body weight and avoid smoking. Repeat fasting lipid panel after 12 weeks.",
    doctorNotes:
      "Dyslipidemia management. Lipid profile analyzed: elevated LDL-C/triglycerides. Initiated statin therapy based on cardiovascular risk stratification. Baseline liver function tests verified. Counseled on dietary fat modification and routine follow-up.",
    remarks:
      "Dyslipidemia management. Lipid profile analyzed: elevated LDL-C/triglycerides. Initiated statin therapy based on cardiovascular risk stratification. Baseline liver function tests verified. Counseled on dietary fat modification and routine follow-up.",
  },

  // --- Medication Classes (Specialty level) ---
  {
    id: "med_metformin",
    name: "SPEC-MED-METFORMIN",
    title: "Metformin / Oral Antidiabetics",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["metformin", "glycomet", "glimepiride", "vildagliptin", "sugar tablets"],
    advice:
      "Take strictly with or immediately after main meals to minimize stomach upset, bloating, or nausea. Do not skip meals while taking antidiabetic medication. Avoid heavy alcohol intake. Keep emergency sweets/sugar packets with you at all times. If persistent diarrhea or nausea occurs, consult doctor.",
    doctorNotes:
      "Metformin therapy reviewed/initiated. Titration schedule explained to mitigate GI side effects. Baseline eGFR and renal parameters checked (within safe margin). Patient educated on early hypoglycemia symptoms.",
    remarks:
      "Metformin therapy reviewed/initiated. Titration schedule explained to mitigate GI side effects. Baseline eGFR and renal parameters checked (within safe margin). Patient educated on early hypoglycemia symptoms.",
  },
  {
    id: "med_insulin",
    name: "SPEC-MED-INSULIN",
    title: "Insulin Therapy (Basal / Bolus)",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["insulin", "glargine", "lispro", "aspart", "novomix", "pen", "injection"],
    advice:
      "Store unopened insulin vials/cartridges in refrigerator at 2-8°C (do not freeze). Current in-use pen/vial can be kept at room temperature away from heat and direct sunlight for up to 28 days. Rotate injection sites across abdomen, thighs, and upper arms. Check blood sugar before administering insulin. Keep glucose ready in case of hypoglycemia.",
    doctorNotes:
      "Insulin regimen prescribed. Injection technique, needle replacement, and site rotation verified. Patient educated on hypoglycemia protocol (Rule of 15). Home blood glucose diary provided for dose titration.",
    remarks:
      "Insulin regimen prescribed. Injection technique, needle replacement, and site rotation verified. Patient educated on hypoglycemia protocol (Rule of 15). Home blood glucose diary provided for dose titration.",
  },
  {
    id: "med_antihtn",
    name: "SPEC-MED-ANTIHTN",
    title: "Antihypertensives (Amlodipine / Telmisartan)",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["amlodipine", "telmisartan", "enalapril", "losartan", "atenolol", "bp medicine"],
    advice:
      "Take once daily at the same time every morning with water. Rise slowly from seated or supine position to avoid postural dizziness or lightheadedness. Continue taking regularly even when blood pressure feels normal; do not stop abruptly. Report persistent dry cough or ankle swelling.",
    doctorNotes:
      "Antihypertensive agent prescribed. Screened for bilateral ankle edema and drug interactions. Baseline serum creatinine and potassium recorded. Advised home BP monitoring twice a week.",
    remarks:
      "Antihypertensive agent prescribed. Screened for bilateral ankle edema and drug interactions. Baseline serum creatinine and potassium recorded. Advised home BP monitoring twice a week.",
  },
  {
    id: "med_antibiotic",
    name: "SPEC-MED-ANTIBIOTIC",
    title: "Antibiotic Regimen (Full Course)",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["antibiotic", "amoxicillin", "azithromycin", "cefixime", "ciprofloxacin", "bacterial"],
    advice:
      "Take doses at evenly spaced intervals with a full glass of water. It is essential to complete the entire course of medication as prescribed, even if you feel completely healthy after a couple of days. Premature stoppage can cause infection relapse and antibiotic resistance. If allergic rash or severe diarrhea develops, contact clinic.",
    doctorNotes:
      "Antibiotic regimen prescribed for active infection. Emphasized strict course compliance to prevent bacterial resistance. Screened for drug allergies (penicillin/cephalosporin). Advised probiotics support.",
    remarks:
      "Antibiotic regimen prescribed for active infection. Emphasized strict course compliance to prevent bacterial resistance. Screened for drug allergies (penicillin/cephalosporin). Advised probiotics support.",
  },
  {
    id: "med_ppi",
    name: "SPEC-MED-PPI",
    title: "Proton Pump Inhibitors (PPIs)",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["pantoprazole", "rabeprazole", "omeprazole", "esomeprazole", "pan", "antacid"],
    advice:
      "Take 30 to 45 minutes before your morning breakfast on an empty stomach with a full glass of water. Swallow the capsule/tablet whole; do not chew, crush, or break. Limit prolonged continuous use without doctor consultation.",
    doctorNotes:
      "PPI therapy initiated for acid-peptic disease. Advised optimal administration timing (empty stomach pre-breakfast) for maximal acid-secretion inhibition. Plan for 2-4 week tapering course.",
    remarks:
      "PPI therapy initiated for acid-peptic disease. Advised optimal administration timing (empty stomach pre-breakfast) for maximal acid-secretion inhibition. Plan for 2-4 week tapering course.",
  },
  {
    id: "med_nsaid",
    name: "SPEC-MED-NSAID",
    title: "NSAIDs & Pain Relievers",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["painkiller", "ibuprofen", "diclofenac", "aceclofenac", "paracetamol", "analgesic"],
    advice:
      "Always take strictly after food or with milk to protect your stomach lining. Use only on an as-needed basis for pain and stop once relief is achieved. Drink plenty of water throughout the day. Do not take with other anti-inflammatory drugs or aspirin without checking with doctor.",
    doctorNotes:
      "Short-course NSAID therapy prescribed for acute analgesia. Gastrointestinal and renal risk factors reviewed. PPI gastric protection added. Advised to discontinue once acute pain subsides.",
    remarks:
      "Short-course NSAID therapy prescribed for acute analgesia. Gastrointestinal and renal risk factors reviewed. PPI gastric protection added. Advised to discontinue once acute pain subsides.",
  },
  {
    id: "med_statin",
    name: "SPEC-MED-STATIN",
    title: "Statins (Lipid Lowering)",
    category: "medication",
    scope: "specialty",
    scopeValue: "General Medicine",
    keywords: ["atorvastatin", "rosuvastatin", "cholesterol medicine", "statin"],
    advice:
      "Take once daily at bedtime with or without food. Avoid drinking large quantities of grapefruit juice. Contact your physician immediately if you experience unexplained muscle aches, persistent fatigue, tenderness, or weakness.",
    doctorNotes:
      "Statin therapy commenced for atherosclerotic cardiovascular prevention. Baseline liver transaminases and lipid profile reviewed. Counseled on myopathy warning signs and scheduled repeat lipid test at 12 weeks.",
    remarks:
      "Statin therapy commenced for atherosclerotic cardiovascular prevention. Baseline liver transaminases and lipid profile reviewed. Counseled on myopathy warning signs and scheduled repeat lipid test at 12 weeks.",
  },
]

export function combineTemplatesText(
  templatesList: ClinicalTemplate[],
  target: "advice" | "doctorNotes" | "remarks",
  currentText: string,
  mode: "append" | "replace" = "append",
): string {
  const isDoctorNotesTarget = target === "doctorNotes" || target === "remarks"
  const pieces = templatesList
    .map((t) => (isDoctorNotesTarget ? t.doctorNotes || t.remarks || "" : t.advice))
    .map((s) => s.trim())
    .filter(Boolean)

  if (pieces.length === 0) return currentText

  const newJoined = pieces.join("\n\n")

  if (mode === "replace" || !currentText.trim()) {
    return newJoined
  }

  return `${currentText.trim()}\n\n${newJoined}`
}

type TemplateSelectorProps = {
  /** Target text box to populate: Advice (patient-facing) or Doctor Notes (formerly Remarks) */
  target: "advice" | "doctorNotes" | "remarks"
  /** Callback invoked when a template is chosen to instantly auto-fill the text box */
  onSelect: (
    content: string,
    mode?: "append" | "replace",
    templates?: ClinicalTemplate[],
  ) => void
  /** Current content in the text box (for saving as a custom template) */
  currentContent?: string
  practiceId?: string
  specialty?: string
  doctorId?: string
  disabled?: boolean
  className?: string
  placeholder?: string
  /** Callback when dropdown open state changes to adapt parent height */
  onOpenChange?: (open: boolean) => void
}

export default function TemplateSelector({
  target,
  onSelect,
  currentContent = "",
  practiceId,
  specialty = "General Medicine",
  doctorId,
  disabled = false,
  className = "",
  placeholder = "Select template...",
  onOpenChange,
}: TemplateSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [scopeFilter, setScopeFilter] = useState<"all" | TemplateScope>("all")
  const [categoryFilter, setCategoryFilter] = useState<"all" | TemplateCategory>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [templates, setTemplates] = useState<ClinicalTemplate[]>(CLINICAL_TEMPLATES)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [insertMode, setInsertMode] = useState<"append" | "replace">("append")
  const [isSavingCustom, setIsSavingCustom] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState("")
  const [newTemplateTitle, setNewTemplateTitle] = useState("")
  const [newTemplateScope, setNewTemplateScope] = useState<TemplateScope>("doctor")
  const [newTemplateContent, setNewTemplateContent] = useState("")
  const [savingLoading, setSavingLoading] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const isDoctorNotesTarget = target === "doctorNotes" || target === "remarks"

  function handleToggleOpen(valOrFn?: boolean | ((prev: boolean) => boolean)) {
    setIsOpen((prev) => {
      const next =
        typeof valOrFn === "function"
          ? valOrFn(prev)
          : typeof valOrFn === "boolean"
          ? valOrFn
          : !prev
      onOpenChange?.(next)
      return next
    })
  }

  // Fetch dynamic templates from backend on mount
  useEffect(() => {
    let active = true
    proctoService
      .listTemplates({ practiceId, specialty, doctorUserId: doctorId })
      .then((res) => {
        if (!active || !res || res.status !== "successful" || !Array.isArray(res.data)) return
        const remote = res.data as ClinicalTemplate[]
        const map = new Map<string, ClinicalTemplate>()
        // Baseline first
        CLINICAL_TEMPLATES.forEach((t) => map.set(t.name.toLowerCase(), t))
        // Remote custom / updated templates
        remote.forEach((t) => {
          map.set(t.name.toLowerCase(), {
            ...t,
            doctorNotes: t.doctorNotes || t.content || t.remarks || "",
            remarks: t.remarks || t.doctorNotes || t.content || "",
          })
        })
        try {
          const localCache = localStorage.getItem("glucoguide_master_templates_custom")
          if (localCache) {
            const list = JSON.parse(localCache) as ClinicalTemplate[]
            if (Array.isArray(list)) {
              list.forEach((t) => map.set(t.name.toLowerCase(), t))
            }
          }
        } catch {
          // ignore
        }
        setTemplates(Array.from(map.values()))
      })
      .catch(() => {
        // Fall back to baseline templates and local cache on network issue
        try {
          const localCache = localStorage.getItem("glucoguide_master_templates_custom")
          if (localCache) {
            const list = JSON.parse(localCache) as ClinicalTemplate[]
            if (Array.isArray(list)) {
              const map = new Map<string, ClinicalTemplate>()
              CLINICAL_TEMPLATES.forEach((t) => map.set(t.name.toLowerCase(), t))
              list.forEach((t) => map.set(t.name.toLowerCase(), t))
              setTemplates(Array.from(map.values()))
            }
          }
        } catch {
          // ignore
        }
      })
    return () => {
      active = false
    }
  }, [practiceId, specialty, doctorId])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleToggleOpen(false)
        setIsSavingCustom(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [isOpen])

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 50)
    } else {
      setSearchQuery("")
      setScopeFilter("all")
      setCategoryFilter("all")
      setSelectedIds(new Set())
      setIsSavingCustom(false)
    }
  }, [isOpen])

  // Filter templates based on Scope, Category, Doctor/Specialty applicability, and Search Query
  const query = searchQuery.trim().toLowerCase()
  const currentDocId = (doctorId || "").trim().toLowerCase()
  const currentSpec = (specialty || "").trim().toLowerCase()

  const filtered = templates.filter((tpl) => {
    // 1. Doctor-level templates: only applicable to the targeted practitioner
    if (tpl.scope === "doctor") {
      const tplDocId = (tpl.doctorId || tpl.createdById || tpl.scopeValue || "").trim().toLowerCase()
      if (currentDocId && tplDocId && tplDocId !== currentDocId) {
        return false
      }
    }

    // 2. Specialty-level templates: only applicable to doctors in that specialty
    if (tpl.scope === "specialty") {
      const tplSpec = (tpl.specialty || tpl.scopeValue || "").trim().toLowerCase()
      if (tplSpec && currentSpec && tplSpec !== "general medicine" && currentSpec !== "general") {
        const matches =
          tplSpec === currentSpec ||
          tplSpec.includes(currentSpec) ||
          currentSpec.includes(tplSpec)
        if (!matches) return false
      }
    }

    // Hierarchical Scope filter (from UI tabs)
    if (scopeFilter !== "all" && tpl.scope !== scopeFilter) {
      return false
    }
    // Category filter
    if (categoryFilter !== "all" && tpl.category !== categoryFilter) {
      return false
    }
    if (!query) return true

    const inName = (tpl.name || "").toLowerCase().includes(query)
    const inTitle = (tpl.title || "").toLowerCase().includes(query)
    const inKeywords = (tpl.keywords || []).some((kw) => kw.toLowerCase().includes(query))
    const inText = isDoctorNotesTarget
      ? (tpl.doctorNotes || tpl.remarks || "").toLowerCase().includes(query)
      : (tpl.advice || "").toLowerCase().includes(query)
    return inName || inTitle || inKeywords || inText
  })

  function toggleSelectTemplate(templateId: string, e?: React.MouseEvent | React.ChangeEvent) {
    e?.stopPropagation()
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(templateId)) {
        next.delete(templateId)
      } else {
        next.add(templateId)
      }
      return next
    })
  }

  function handleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const allSelected = filtered.length > 0 && filtered.every((t) => prev.has(t.id))
      const next = new Set(prev)
      if (allSelected) {
        filtered.forEach((t) => next.delete(t.id))
      } else {
        filtered.forEach((t) => next.add(t.id))
      }
      return next
    })
  }

  function handleApplySelected() {
    const chosen = templates.filter((t) => selectedIds.has(t.id))
    if (chosen.length === 0) return

    const combined = combineTemplatesText(chosen, target, currentContent, insertMode)
    onSelect(combined, insertMode, chosen)
    setSelectedIds(new Set())
    handleToggleOpen(false)
  }

  function handleSingleSelect(template: ClinicalTemplate) {
    const combined = combineTemplatesText([template], target, currentContent, insertMode)
    onSelect(combined, insertMode, [template])
    handleToggleOpen(false)
  }

  async function handleSaveNewTemplate() {
    const cleanName = newTemplateName.trim().toUpperCase().replace(/\s+/g, "-")
    if (!cleanName) {
      toast.error("Template unique name is required (e.g. DOC-FEVER-PROTOCOL)")
      return
    }
    const cleanContent = (newTemplateContent || currentContent || "").trim()
    if (!cleanContent) {
      toast.error("Template content cannot be empty.")
      return
    }

    setSavingLoading(true)
    try {
      const res = await proctoService.saveTemplate({
        name: cleanName,
        title: (newTemplateTitle || newTemplateName).trim(),
        content: cleanContent,
        advice: !isDoctorNotesTarget ? cleanContent : undefined,
        category: "general",
        scope: newTemplateScope,
        scopeValue: newTemplateScope === "specialty" ? specialty : undefined,
        practiceId,
      })

      if (res.status !== "successful" || !res.data) {
        toast.error(res.message || "Could not save custom template.")
        return
      }

      const created = res.data as ClinicalTemplate
      const formatted: ClinicalTemplate = {
        ...created,
        doctorNotes: created.doctorNotes || (created as any).content || "",
        remarks: created.remarks || (created as any).content || "",
      }
      setTemplates((prev) => [formatted, ...prev])
      toast.success(
        `Template "${cleanName}" saved successfully under ${
          newTemplateScope === "doctor" ? "Doctor (Private)" : newTemplateScope.toUpperCase()
        } scope!`,
      )
      setIsSavingCustom(false)
      setNewTemplateName("")
      setNewTemplateTitle("")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error saving template.")
    } finally {
      setSavingLoading(false)
    }
  }

  return (
    <div ref={containerRef} className={`relative inline-block ${className}`}>
      {/* Dropdown trigger button */}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        onClick={() => handleToggleOpen()}
        className={`inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm transition-all hover:bg-neutral-50 hover:border-neutral-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700/80`}
      >
        <svg
          className="size-3.5 text-sky-600 dark:text-sky-400"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12a1.5 1.5 0 01.439 1.061V16.5A1.5 1.5 0 0115.5 18h-7A1.5 1.5 0 017 16.5v-13z" />
          <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-.5H4.5V6z" />
        </svg>
        <span>{placeholder}</span>
        <svg
          className={`size-3 text-neutral-400 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id={listboxId}
          className={`absolute right-0 top-full z-[99999] mt-1.5 w-84 sm:w-96 rounded-xl border border-neutral-200 bg-white p-2.5 shadow-2xl transition-all duration-200 dark:border-neutral-700 dark:bg-neutral-900 ${
            isSavingCustom ? "max-h-[580px]" : "max-h-[480px]"
          } flex flex-col`}
        >
          {/* Header */}
          <div className="border-b border-neutral-100 pb-2 dark:border-neutral-800">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                {isDoctorNotesTarget ? "Doctor Notes Templates" : "Clinical Advice Templates"}
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewTemplateContent(currentContent)
                  setIsSavingCustom((prev) => !prev)
                }}
                className="text-[11px] font-medium text-sky-600 hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300 transition-colors cursor-pointer"
              >
                {isSavingCustom ? "Cancel" : "+ Save Note as Template"}
              </button>
            </div>

            {/* Save Custom Template Panel */}
            {isSavingCustom && (
              <div className="mb-2.5 rounded-lg border border-sky-200 bg-sky-50/70 p-2.5 dark:border-sky-900/60 dark:bg-sky-950/40">
                <div className="text-[11px] font-bold text-sky-900 dark:text-sky-300">
                  Save New Template Directly to Master
                </div>
                <div className="mt-2 space-y-2">
                  <div>
                    <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                      Unique Name (ID):
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. DOC-FEVER-FOLLOWUP"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                      Display Title:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Dr. Private Fever Followup"
                      value={newTemplateTitle}
                      onChange={(e) => setNewTemplateTitle(e.target.value)}
                      className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                      Hierarchical Scope:
                    </label>
                    <select
                      value={newTemplateScope}
                      onChange={(e) => setNewTemplateScope(e.target.value as TemplateScope)}
                      className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    >
                      <option value="doctor">🔒 Doctor-Level (Private to Me)</option>
                      <option value="specialty">🩺 Specialty-Level (Shared with {specialty})</option>
                      <option value="clinic">🏥 Clinic-Level (Globally Visible in Clinic)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium text-neutral-600 dark:text-neutral-400">
                      Template Content:
                    </label>
                    <textarea
                      rows={2}
                      value={newTemplateContent}
                      onChange={(e) => setNewTemplateContent(e.target.value)}
                      className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                    />
                  </div>
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsSavingCustom(false)}
                      className="rounded border border-neutral-300 bg-white px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={savingLoading}
                      onClick={handleSaveNewTemplate}
                      className="rounded bg-sky-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                    >
                      {savingLoading ? "Saving..." : "Save Template"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hierarchical Scope Filter Tabs */}
            <div className="mb-1.5">
              <div className="mb-1 text-[9px] font-bold uppercase tracking-wider text-neutral-400">
                Scope Filter
              </div>
              <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5 text-[11px] dark:bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setScopeFilter("all")}
                  className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                    scopeFilter === "all"
                      ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
                      : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  All Scopes
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter("clinic")}
                  title="Globally visible to all doctors within the facility"
                  className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                    scopeFilter === "clinic"
                      ? "bg-white text-sky-700 shadow-xs dark:bg-neutral-700 dark:text-sky-300"
                      : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  🏥 Clinic
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter("specialty")}
                  title={`Accessible to clinicians in ${specialty}`}
                  className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                    scopeFilter === "specialty"
                      ? "bg-white text-indigo-700 shadow-xs dark:bg-neutral-700 dark:text-indigo-300"
                      : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  🩺 Specialty
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter("doctor")}
                  title="Strictly private to you"
                  className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                    scopeFilter === "doctor"
                      ? "bg-white text-amber-700 shadow-xs dark:bg-neutral-700 dark:text-amber-300"
                      : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                  }`}
                >
                  🔒 Private
                </button>
              </div>
            </div>

            {/* Category Filter Tabs */}
            <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5 text-[11px] dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => setCategoryFilter("all")}
                className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                  categoryFilter === "all"
                    ? "bg-white text-neutral-900 shadow-xs dark:bg-neutral-700 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                All ({templates.length})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter("condition")}
                className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                  categoryFilter === "condition"
                    ? "bg-white text-sky-700 shadow-xs dark:bg-neutral-700 dark:text-sky-300"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                By Condition
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter("medication")}
                className={`flex-1 rounded-md px-1.5 py-0.5 font-medium transition-colors ${
                  categoryFilter === "medication"
                    ? "bg-white text-emerald-700 shadow-xs dark:bg-neutral-700 dark:text-emerald-300"
                    : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
                }`}
              >
                By Medication
              </button>
            </div>

            {/* Quick search input & Select All */}
            <div className="mt-2 flex items-center gap-1.5">
              <div className="relative flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search templates (e.g., diabetes, fever)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:placeholder-neutral-500"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1.5 text-xs text-neutral-400 hover:text-neutral-600"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
              {filtered.length > 0 && (
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="rounded-md border border-neutral-200 bg-neutral-100 px-2 py-1.5 text-[11px] font-medium text-neutral-700 hover:bg-neutral-200/80 active:scale-95 transition-all dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 whitespace-nowrap cursor-pointer"
                  title="Toggle select all filtered templates"
                >
                  {filtered.every((t) => selectedIds.has(t.id)) ? "Deselect All" : "Select All"}
                </button>
              )}
            </div>
          </div>

          {/* Templates list with multi-selection support */}
          <div className="flex-1 overflow-y-auto py-1 text-xs custom-scroll min-h-[140px] max-h-60 sm:max-h-68 space-y-1.5">
            {filtered.length === 0 ? (
              <div className="py-6 text-center text-xs text-neutral-400">
                No templates found matching &ldquo;{searchQuery}&rdquo;.
              </div>
            ) : (
              filtered.map((template) => {
                const isSelected = selectedIds.has(template.id)
                const text = isDoctorNotesTarget
                  ? template.doctorNotes || template.remarks || ""
                  : template.advice

                return (
                  <div
                    key={template.id}
                    onClick={() => {
                      if (selectedIds.size > 0) {
                        toggleSelectTemplate(template.id)
                      } else {
                        handleSingleSelect(template)
                      }
                    }}
                    className={`group relative flex items-start gap-2.5 rounded-lg border p-2 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-sky-400 bg-sky-50/80 shadow-2xs dark:border-sky-600 dark:bg-sky-950/40"
                        : "border-neutral-200/80 bg-white hover:border-sky-300 hover:bg-neutral-50/80 dark:border-neutral-800 dark:bg-neutral-800/40 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {/* Checkbox for selecting multiple */}
                    <div
                      className="pt-0.5 shrink-0"
                      onClick={(e) => toggleSelectTemplate(template.id, e)}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => toggleSelectTemplate(template.id, e)}
                        aria-label={`Select ${template.title}`}
                        className="size-4 rounded border-neutral-300 text-sky-600 focus:ring-sky-500 cursor-pointer dark:border-neutral-600 dark:bg-neutral-700"
                      />
                    </div>

                    {/* Template details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100 truncate text-xs">
                          {template.title}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold shrink-0 ${
                            template.scope === "clinic"
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                              : template.scope === "specialty"
                              ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          }`}
                        >
                          {template.scope === "clinic"
                            ? "🏥 Clinic"
                            : template.scope === "specialty"
                            ? `🩺 ${template.scopeValue || "Specialty"}`
                            : "🔒 Private"}
                        </span>
                      </div>

                      {/* Unique Name Tag */}
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-neutral-400">
                        <span className="font-mono">{template.name}</span>
                        <span>•</span>
                        <span className="capitalize">{template.category}</span>
                      </div>

                      {/* Content Preview */}
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
                        {text}
                      </p>
                    </div>

                    {/* Quick Single Insert pill button */}
                    <div className="shrink-0 self-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSingleSelect(template)
                        }}
                        title="Insert this template now"
                        className="rounded bg-sky-600 px-2 py-1 text-[10px] font-semibold text-white shadow-2xs hover:bg-sky-700 active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                      >
                        + Insert
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* Multi-Selection Action Footer */}
          {selectedIds.size > 0 ? (
            <div className="mt-2 border-t border-neutral-200 bg-neutral-50 -mx-2.5 -mb-2.5 p-2.5 rounded-b-xl dark:border-neutral-800 dark:bg-neutral-800/90 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-sky-900 dark:text-sky-300">
                    {selectedIds.size} {selectedIds.size === 1 ? "template" : "templates"} selected
                  </span>
                  {currentContent?.trim() ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-neutral-600 dark:text-neutral-300 border-l border-neutral-300 pl-2 dark:border-neutral-700">
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`insert-mode-${listboxId}`}
                          value="append"
                          checked={insertMode === "append"}
                          onChange={() => setInsertMode("append")}
                          className="text-sky-600 size-3"
                        />
                        <span>Append</span>
                      </label>
                      <label className="inline-flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name={`insert-mode-${listboxId}`}
                          value="replace"
                          checked={insertMode === "replace"}
                          onChange={() => setInsertMode("replace")}
                          className="text-sky-600 size-3"
                        />
                        <span>Replace</span>
                      </label>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="rounded px-2 py-1 text-[11px] font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-700 cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleApplySelected}
                    className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-sky-700 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>Insert Selected ({selectedIds.size})</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            currentContent?.trim() ? (
              <div className="mt-1.5 pt-1.5 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 px-1">
                <span>Select multiple with checkboxes, or click one to insert.</span>
                <div className="flex items-center gap-1.5">
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name={`insert-mode-${listboxId}`}
                      value="append"
                      checked={insertMode === "append"}
                      onChange={() => setInsertMode("append")}
                      className="text-sky-600 size-3"
                    />
                    <span>Append</span>
                  </label>
                  <label className="inline-flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name={`insert-mode-${listboxId}`}
                      value="replace"
                      checked={insertMode === "replace"}
                      onChange={() => setInsertMode("replace")}
                      className="text-sky-600 size-3"
                    />
                    <span>Replace</span>
                  </label>
                </div>
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  )
}
