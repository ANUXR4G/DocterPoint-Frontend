"use client"

import { useState, useEffect, useMemo } from "react"
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Copy,
  Check,
  Star,
  Sparkles,
  BookOpen,
  Stethoscope,
  FileText,
  CheckCircle2,
  Filter,
  X,
  Building,
  User,
  Activity,
  Heart,
  Thermometer,
  Wind,
  ShieldAlert,
  Zap,
  Pill,
  Smile,
  Sun,
  Crosshair,
  Clock,
  Layers,
  ArrowRight,
} from "lucide-react"
import { toast } from "sonner"
import { proctoService } from "@/lib/services/procto"
import {
  CLINICAL_TEMPLATES,
  type ClinicalTemplate,
  type TemplateScope,
} from "./TemplateSelector"

export const DEFAULT_SPECIALTIES = [
  "General Medicine",
  "Cardiology",
  "Diabetology & Endocrinology",
  "Pediatrics",
  "Pulmonology & ENT",
  "Gastroenterology",
  "Orthopedics",
  "Dermatology",
  "Obstetrics & Gynecology",
  "Neurology",
  "Psychiatry",
  "Nephrology",
  "General Surgery",
  "Ophthalmology",
]

export interface MasterAdviceCategory {
  id: string
  label: string
  description: string
  keywords: string[]
  badgeColor: string
  iconName: string
}

export const MASTER_ADVICE_CATEGORIES: MasterAdviceCategory[] = [
  {
    id: "diabetes_endocrine",
    label: "Diabetes & Endocrine Care",
    description: "Type 1 & 2 DM, oral antidiabetics, insulin protocols, and thyroid guidance.",
    keywords: ["diabetes", "sugar", "insulin", "metformin", "glycomet", "dm2", "hba1c", "endocrine", "thyroxine"],
    badgeColor: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
    iconName: "Activity",
  },
  {
    id: "cardiovascular_hypertension",
    label: "Cardiovascular & Hypertension",
    description: "BP monitoring, DASH low-sodium diet, statin therapy, and heart health.",
    keywords: ["blood pressure", "bp", "hypertension", "htn", "cardiac", "stroke", "cholesterol", "statin", "dyslipidemia"],
    badgeColor: "bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-200 dark:border-rose-800",
    iconName: "Heart",
  },
  {
    id: "fever_viral",
    label: "Fever & Acute Viral Illness",
    description: "Hydration protocol, paracetamol dosing, fever red flags, and dengue watch.",
    keywords: ["fever", "viral", "temperature", "body ache", "flu", "weakness", "dengue"],
    badgeColor: "bg-orange-100 text-orange-900 border-orange-300 dark:bg-orange-950/60 dark:text-orange-200 dark:border-orange-800",
    iconName: "Thermometer",
  },
  {
    id: "respiratory_ent",
    label: "Respiratory & ENT Care",
    description: "Steam inhalation, decongestants, cough etiquette, and inhaler spacers.",
    keywords: ["cough", "cold", "sore throat", "runny nose", "congestion", "flu", "respiratory", "inhaler", "urti"],
    badgeColor: "bg-cyan-100 text-cyan-900 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-200 dark:border-cyan-800",
    iconName: "Wind",
  },
  {
    id: "gastrointestinal_reflux",
    label: "Gastrointestinal & Acid Reflux",
    description: "Bland diet, PPI timing, ORS hydration, and avoiding late-night meals.",
    keywords: ["acid", "reflux", "heartburn", "acidity", "gastric", "stomach", "ulcer", "gerd", "diarrhea", "loose motions", "vomiting", "ors"],
    badgeColor: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
    iconName: "ShieldAlert",
  },
  {
    id: "musculoskeletal_pain",
    label: "Musculoskeletal & Pain",
    description: "Ergonomic posture, hot/cold compress, and cautious short-term analgesics.",
    keywords: ["back pain", "neck pain", "sprain", "strain", "muscle", "joint", "ortho", "msk", "nsaid"],
    badgeColor: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950/60 dark:text-purple-200 dark:border-purple-800",
    iconName: "Zap",
  },
  {
    id: "infection_antibiotics",
    label: "Infection & Antibiotics",
    description: "Full course completion, allergy warnings, and probiotic gastro-protection.",
    keywords: ["antibiotic", "infection", "bacterial", "compliance", "resistance"],
    badgeColor: "bg-indigo-100 text-indigo-900 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-200 dark:border-indigo-800",
    iconName: "Pill",
  },
  {
    id: "pediatrics_wellness",
    label: "Pediatrics & Child Wellness",
    description: "Weight-based dosing, fever sponging, pediatric rehydration, and immunization.",
    keywords: ["pediatric", "child", "infant", "toddler", "growth"],
    badgeColor: "bg-pink-100 text-pink-900 border-pink-300 dark:bg-pink-950/60 dark:text-pink-200 dark:border-pink-800",
    iconName: "Smile",
  },
  {
    id: "general_lifestyle",
    label: "General Health & Lifestyle",
    description: "Routine physicals, annual preventive labs, sleep hygiene, and daily exercise.",
    keywords: ["general", "routine", "annual", "checkup", "vitals", "clinic", "physical", "exam", "lifestyle"],
    badgeColor: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
    iconName: "Sun",
  },
  {
    id: "post_procedure",
    label: "Post-Procedure & Wound Care",
    description: "Dressing hygiene, suture protection, warning signs of infection, and wound rest.",
    keywords: ["wound", "procedure", "surgical", "healing", "post-op", "suture", "dressing"],
    badgeColor: "bg-teal-100 text-teal-900 border-teal-300 dark:bg-teal-950/60 dark:text-teal-200 dark:border-teal-800",
    iconName: "Crosshair",
  },
  {
    id: "medication_adherence",
    label: "Medication Adherence & Refills",
    description: "Chronic prescription repeats, adherence monitoring, and refill protocols.",
    keywords: ["refill", "repeat", "prescription", "chronic", "stable", "adherence"],
    badgeColor: "bg-slate-100 text-slate-900 border-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
    iconName: "Clock",
  },
]

export function resolveAdviceCategory(tpl: ClinicalTemplate): string {
  // If template explicitly holds an advice category label or ID
  const directCat = (tpl as any).adviceCategory || tpl.category
  if (directCat) {
    const match = MASTER_ADVICE_CATEGORIES.find(
      (c) => c.id === directCat || c.label.toLowerCase() === String(directCat).toLowerCase(),
    )
    if (match) return match.label
  }

  const nameAndTitle = `${tpl.name} ${tpl.title}`.toLowerCase()

  // Primary title / code heuristics
  if (
    nameAndTitle.includes("dm2") ||
    nameAndTitle.includes("diabetes") ||
    nameAndTitle.includes("metformin") ||
    nameAndTitle.includes("insulin") ||
    nameAndTitle.includes("thyroxine")
  ) {
    return "Diabetes & Endocrine Care"
  }
  if (
    nameAndTitle.includes("htn") ||
    nameAndTitle.includes("hypertension") ||
    nameAndTitle.includes("cardiac") ||
    nameAndTitle.includes("dyslipidemia") ||
    nameAndTitle.includes("statin") ||
    nameAndTitle.includes("antihypertensive")
  ) {
    return "Cardiovascular & Hypertension"
  }
  if (
    nameAndTitle.includes("urti") ||
    nameAndTitle.includes("respiratory") ||
    nameAndTitle.includes("cough") ||
    nameAndTitle.includes("inhaler") ||
    nameAndTitle.includes("asthma")
  ) {
    return "Respiratory & ENT Care"
  }
  if (
    nameAndTitle.includes("fever") ||
    nameAndTitle.includes("viral") ||
    nameAndTitle.includes("dengue")
  ) {
    return "Fever & Acute Viral Illness"
  }
  if (
    nameAndTitle.includes("gerd") ||
    nameAndTitle.includes("gastritis") ||
    nameAndTitle.includes("gastroenteritis") ||
    nameAndTitle.includes("acid peptic")
  ) {
    return "Gastrointestinal & Acid Reflux"
  }
  if (
    nameAndTitle.includes("msk") ||
    nameAndTitle.includes("strain") ||
    nameAndTitle.includes("back pain") ||
    nameAndTitle.includes("nsaid")
  ) {
    return "Musculoskeletal & Pain"
  }
  if (
    nameAndTitle.includes("antibiotic") ||
    nameAndTitle.includes("infection")
  ) {
    return "Infection & Antibiotics"
  }
  if (
    nameAndTitle.includes("pediatric") ||
    nameAndTitle.includes("child")
  ) {
    return "Pediatrics & Child Wellness"
  }
  if (
    nameAndTitle.includes("post-procedure") ||
    nameAndTitle.includes("post_procedure") ||
    nameAndTitle.includes("wound")
  ) {
    return "Post-Procedure & Wound Care"
  }
  if (nameAndTitle.includes("refill")) {
    return "Medication Adherence & Refills"
  }

  // Heuristic matching based on all text & keywords
  const text = `${nameAndTitle} ${(tpl.keywords || []).join(" ")}`.toLowerCase()

  for (const cat of MASTER_ADVICE_CATEGORIES) {
    if (cat.keywords.some((kw) => text.includes(kw))) {
      return cat.label
    }
  }

  return "General Health & Lifestyle"
}

function CategoryIcon({ name, className = "h-4 w-4" }: { name: string; className?: string }) {
  switch (name) {
    case "Activity":
      return <Activity className={className} />
    case "Heart":
      return <Heart className={className} />
    case "Thermometer":
      return <Thermometer className={className} />
    case "Wind":
      return <Wind className={className} />
    case "ShieldAlert":
      return <ShieldAlert className={className} />
    case "Zap":
      return <Zap className={className} />
    case "Pill":
      return <Pill className={className} />
    case "Smile":
      return <Smile className={className} />
    case "Sun":
      return <Sun className={className} />
    case "Crosshair":
      return <Crosshair className={className} />
    case "Clock":
      return <Clock className={className} />
    default:
      return <BookOpen className={className} />
  }
}

export default function MasterTemplatesManagement() {
  const [templates, setTemplates] = useState<ClinicalTemplate[]>(CLINICAL_TEMPLATES)
  const [selectedCategory, setSelectedCategory] = useState<string>("all")
  const [selectedScope, setSelectedScope] = useState<"all" | TemplateScope>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [preferredCategories, setPreferredCategories] = useState<string[]>([])
  const [practiceId, setPracticeId] = useState<string | undefined>(undefined)
  const [specialties, setSpecialties] = useState<string[]>(DEFAULT_SPECIALTIES)
  const [doctors, setDoctors] = useState<Array<{ id: string; name: string; specialties?: string[] }>>([])
  const [loading, setLoading] = useState(false)

  // Add / Edit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalMode, setModalMode] = useState<"create" | "edit">("create")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalTitle, setModalTitle] = useState("")
  const [modalName, setModalName] = useState("")
  const [modalAdviceCategory, setModalAdviceCategory] = useState<string>(
    MASTER_ADVICE_CATEGORIES[0].label,
  )
  const [customCategoryInput, setCustomCategoryInput] = useState("")
  const [modalSpecialty, setModalSpecialty] = useState<string>("all")
  const [modalDoctorId, setModalDoctorId] = useState<string>("all")
  const [modalScope, setModalScope] = useState<TemplateScope>("clinic")
  const [modalScopeValue, setModalScopeValue] = useState("")
  const [modalAdvice, setModalAdvice] = useState("")
  const [modalDoctorNotes, setModalDoctorNotes] = useState("")
  const [modalSaving, setModalSaving] = useState(false)

  // Delete modal state
  const [deletingTemplate, setDeletingTemplate] = useState<ClinicalTemplate | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Copy feedback state
  const [copiedAdviceId, setCopiedAdviceId] = useState<string | null>(null)
  const [copiedNotesId, setCopiedNotesId] = useState<string | null>(null)

  // Load preferred categories from local storage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("glucoguide_preferred_advice_categories")
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) setPreferredCategories(parsed)
      }
    } catch {
      // Ignore parse error
    }
  }, [])

  // Resolve practice and load templates from backend
  useEffect(() => {
    let active = true
    async function init() {
      setLoading(true)
      try {
        const practicesRes = await proctoService.getMyPractices()
        let resolvedPid: string | undefined
        if (practicesRes.status === "successful" && Array.isArray(practicesRes.data) && practicesRes.data.length > 0) {
          const first = practicesRes.data[0]
          resolvedPid = proctoService.resolvePracticeId(first) || undefined
          if (active && resolvedPid) {
            setPracticeId(resolvedPid)
          }

          const docMap = new Map<string, { id: string; name: string; specialties?: string[] }>()
          const specSet = new Set<string>(DEFAULT_SPECIALTIES)

          practicesRes.data.forEach((pRow: any) => {
            const pr = pRow.practice || pRow
            if (pr?.specialty) specSet.add(pr.specialty)
            const mems = pr?.members || []
            mems.forEach((m: any) => {
              const isDoc =
                m.role === "DOCTOR" ||
                m.role === "PRACTICE_OWNER" ||
                Boolean(m.doctorId) ||
                Boolean(m.user?.doctor)
              if (isDoc && m.isActive !== false) {
                const id = m.userId || m.doctorId || m.user?.id
                const rawName = m.user?.name || (m.createdByName ? `Dr. ${m.createdByName}` : "Doctor")
                const formattedName = rawName.startsWith("Dr.") ? rawName : `Dr. ${rawName}`
                const docSpecs = (m.user?.doctor?.specialties || [])
                  .map((s: any) => s.specialty?.name)
                  .filter(Boolean)
                docSpecs.forEach((sp: string) => specSet.add(sp))
                if (id && !docMap.has(id)) {
                  docMap.set(id, { id, name: formattedName, specialties: docSpecs })
                }
              }
            })
          })

          if (active) {
            setDoctors(Array.from(docMap.values()))
            setSpecialties(Array.from(specSet).sort())
          }
        }

        proctoService.listSpecialties().then((sRes) => {
          if (active && sRes?.status === "successful" && Array.isArray(sRes.data)) {
            setSpecialties((prev) => {
              const set = new Set(prev)
              sRes.data.forEach((s: any) => {
                if (s?.name) set.add(s.name)
              })
              return Array.from(set).sort()
            })
          }
        }).catch(() => {})

        const res = await proctoService.listTemplates({ practiceId: resolvedPid })
        if (!active) return

        const map = new Map<string, ClinicalTemplate>()
        // Baseline master templates
        CLINICAL_TEMPLATES.forEach((t) => {
          map.set(t.name.toLowerCase(), {
            ...t,
            doctorNotes: t.doctorNotes || t.content || t.remarks || "",
            remarks: t.remarks || t.doctorNotes || t.content || "",
          })
        })

        // Remote templates
        if (res && res.status === "successful" && Array.isArray(res.data)) {
          res.data.forEach((t: ClinicalTemplate) => {
            map.set(t.name.toLowerCase(), {
              ...t,
              doctorNotes: t.doctorNotes || t.content || t.remarks || "",
              remarks: t.remarks || t.doctorNotes || t.content || "",
            })
          })
        }

        // Merge locally cached custom templates if any
        try {
          const localCache = localStorage.getItem("glucoguide_master_templates_custom")
          if (localCache) {
            const list = JSON.parse(localCache) as ClinicalTemplate[]
            if (Array.isArray(list)) {
              list.forEach((t) => map.set(t.name.toLowerCase(), t))
            }
          }
        } catch {
          // Ignore parse errors
        }

        setTemplates(Array.from(map.values()))
      } catch (err) {
        console.warn("Could not fetch remote templates:", err)
      } finally {
        if (active) setLoading(false)
      }
    }

    init()
    return () => {
      active = false
    }
  }, [])

  function togglePreferredCategory(categoryLabel: string, e: React.MouseEvent) {
    e.stopPropagation()
    const updated = preferredCategories.includes(categoryLabel)
      ? preferredCategories.filter((c) => c !== categoryLabel)
      : [...preferredCategories, categoryLabel]

    setPreferredCategories(updated)
    try {
      localStorage.setItem("glucoguide_preferred_advice_categories", JSON.stringify(updated))
      toast.success(
        updated.includes(categoryLabel)
          ? `Added "${categoryLabel}" to your preferred categories.`
          : `Removed "${categoryLabel}" from preferred categories.`,
      )
    } catch {
      // Ignore storage error
    }
  }

  // Calculate counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: templates.length }
    MASTER_ADVICE_CATEGORIES.forEach((cat) => {
      counts[cat.label] = 0
    })

    templates.forEach((t) => {
      const cat = resolveAdviceCategory(t)
      counts[cat] = (counts[cat] || 0) + 1
    })

    return counts
  }, [templates])

  // Filter templates
  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    return templates.filter((tpl) => {
      // Scope filter
      if (selectedScope !== "all" && tpl.scope !== selectedScope) {
        return false
      }

      // Advice Category filter
      const tplCategory = resolveAdviceCategory(tpl)
      if (selectedCategory !== "all" && tplCategory !== selectedCategory) {
        return false
      }

      // Search query
      if (!q) return true

      const inName = (tpl.name || "").toLowerCase().includes(q)
      const inTitle = (tpl.title || "").toLowerCase().includes(q)
      const inAdvice = (tpl.advice || "").toLowerCase().includes(q)
      const inNotes = (tpl.doctorNotes || tpl.remarks || tpl.content || "").toLowerCase().includes(q)
      const inCategory = tplCategory.toLowerCase().includes(q)
      const inKeywords = (tpl.keywords || []).some((kw) => kw.toLowerCase().includes(q))

      return inName || inTitle || inAdvice || inNotes || inCategory || inKeywords
    })
  }, [templates, selectedCategory, selectedScope, searchQuery])

  // Copy helper
  function copyText(type: "advice" | "notes", text: string, id: string) {
    navigator.clipboard.writeText(text)
    if (type === "advice") {
      setCopiedAdviceId(id)
      setTimeout(() => setCopiedAdviceId(null), 2000)
      toast.success("Clinical advice copied to clipboard!")
    } else {
      setCopiedNotesId(id)
      setTimeout(() => setCopiedNotesId(null), 2000)
      toast.success("Doctor notes copied to clipboard!")
    }
  }

  // Open Create Modal
  function handleOpenCreate() {
    setModalMode("create")
    setEditingId(null)
    setModalTitle("")
    setModalName("")
    const defaultCat =
      selectedCategory !== "all" ? selectedCategory : MASTER_ADVICE_CATEGORIES[0].label
    setModalAdviceCategory(defaultCat)
    setCustomCategoryInput("")
    // By default Specialty will be "All" and Doctor Name also will be "All"
    setModalSpecialty("all")
    setModalDoctorId("all")
    setModalScope("clinic")
    setModalScopeValue("")
    setModalAdvice("")
    setModalDoctorNotes("")
    setIsModalOpen(true)
  }

  // Open Edit Modal
  function handleOpenEdit(template: ClinicalTemplate) {
    setModalMode("edit")
    setEditingId(template.id)
    setModalTitle(template.title)
    setModalName(template.name)
    const cat = resolveAdviceCategory(template)
    const isStandard = MASTER_ADVICE_CATEGORIES.some((c) => c.label === cat)
    if (isStandard) {
      setModalAdviceCategory(cat)
      setCustomCategoryInput("")
    } else {
      setModalAdviceCategory("__custom__")
      setCustomCategoryInput(cat)
    }

    const tplSpec = template.specialty || (template.scope === "specialty" ? template.scopeValue : undefined) || "all"
    const tplDocId = template.doctorId || (template.scope === "doctor" ? template.createdById || template.scopeValue : undefined) || "all"

    setModalSpecialty(tplSpec)
    setModalDoctorId(tplDocId)
    setModalScope(template.scope || "clinic")
    setModalScopeValue(template.scopeValue || (tplSpec !== "all" ? tplSpec : tplDocId !== "all" ? tplDocId : ""))
    setModalAdvice(template.advice || "")
    setModalDoctorNotes(template.doctorNotes || template.remarks || template.content || "")
    setIsModalOpen(true)
  }

  function handleSpecialtyChange(newSpec: string) {
    setModalSpecialty(newSpec)
    if (newSpec !== "all") {
      // If user selects specialty and doctor name is all -> applicable for that Specialty doctors
      if (modalDoctorId === "all") {
        setModalScope("specialty")
        setModalScopeValue(newSpec)
      } else {
        setModalScope("doctor")
      }
    } else {
      if (modalDoctorId === "all") {
        setModalScope("clinic")
        setModalScopeValue("")
      } else {
        setModalScope("doctor")
      }
    }
  }

  function handleDoctorChange(newDocId: string) {
    setModalDoctorId(newDocId)
    if (newDocId !== "all") {
      // If user selects a doctor -> applicable only for that doctor
      setModalScope("doctor")
      setModalScopeValue(newDocId)
    } else {
      if (modalSpecialty !== "all") {
        setModalScope("specialty")
        setModalScopeValue(modalSpecialty)
      } else {
        setModalScope("clinic")
        setModalScopeValue("")
      }
    }
  }

  function handleScopeChange(newScope: TemplateScope) {
    setModalScope(newScope)
    if (newScope === "clinic") {
      setModalSpecialty("all")
      setModalDoctorId("all")
      setModalScopeValue("")
    } else if (newScope === "specialty") {
      if (modalSpecialty === "all") {
        const fallback = specialties[0] || "General Medicine"
        setModalSpecialty(fallback)
        setModalScopeValue(fallback)
      } else {
        setModalScopeValue(modalSpecialty)
      }
      setModalDoctorId("all")
    } else if (newScope === "doctor") {
      if (modalDoctorId === "all" && doctors.length > 0) {
        setModalDoctorId(doctors[0].id)
        setModalScopeValue(doctors[0].id)
      }
    }
  }

  // Save / Update Template
  async function handleSaveTemplate(e: React.FormEvent) {
    e.preventDefault()

    const finalTitle = modalTitle.trim()
    const finalAdvice = modalAdvice.trim()
    const finalDoctorNotes = modalDoctorNotes.trim()
    const finalCategory =
      modalAdviceCategory === "__custom__"
        ? customCategoryInput.trim() || "General Health & Lifestyle"
        : modalAdviceCategory

    if (!finalTitle) {
      toast.error("Please enter a template title.")
      return
    }
    if (!finalAdvice && !finalDoctorNotes) {
      toast.error("Please provide either clinical advice or doctor notes.")
      return
    }

    const targetDoc = doctors.find((d) => d.id === modalDoctorId)
    const finalDoctorId = modalDoctorId !== "all" ? modalDoctorId : undefined
    const finalDoctorName = targetDoc?.name || (finalDoctorId ? "Doctor" : undefined)
    const finalSpecialty = modalSpecialty !== "all" ? modalSpecialty : undefined

    let finalScope: TemplateScope = "clinic"
    let finalScopeValue: string | undefined = undefined

    if (finalDoctorId) {
      finalScope = "doctor"
      finalScopeValue = finalDoctorId
    } else if (finalSpecialty) {
      finalScope = "specialty"
      finalScopeValue = finalSpecialty
    } else {
      finalScope = "clinic"
      finalScopeValue = undefined
    }

    let finalName = modalName.trim()
    if (!finalName) {
      // Auto-generate unique identifier
      const prefix = finalScope === "clinic" ? "CLINIC" : finalScope === "specialty" ? "SPEC" : "DOC"
      if (/type\s*2\s*diabetes/i.test(finalTitle)) {
        finalName = `${prefix}-DM2-MGMT`
      } else {
        const cleanTitle = finalTitle
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 20)
        finalName = `${prefix}-${cleanTitle || "PROTOCOL"}-${Math.floor(1000 + Math.random() * 9000)}`
      }
    }

    setModalSaving(true)
    try {
      if (modalMode === "edit" && editingId) {
        // Update existing template
        await proctoService.updateTemplate(editingId, {
          title: finalTitle,
          name: finalName,
          category: finalCategory,
          scope: finalScope,
          scopeValue: finalScopeValue,
          specialty: finalSpecialty,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          advice: finalAdvice,
          content: finalDoctorNotes,
          practiceId,
        })

        setTemplates((prev) =>
          prev.map((t) =>
            t.id === editingId
              ? {
                  ...t,
                  title: finalTitle,
                  name: finalName,
                  category: finalCategory as any,
                  adviceCategory: finalCategory,
                  scope: finalScope,
                  scopeValue: finalScopeValue,
                  specialty: finalSpecialty,
                  doctorId: finalDoctorId,
                  doctorName: finalDoctorName,
                  createdById: finalDoctorId || t.createdById,
                  createdByName: finalDoctorName || t.createdByName,
                  advice: finalAdvice,
                  doctorNotes: finalDoctorNotes,
                  remarks: finalDoctorNotes,
                  content: finalDoctorNotes,
                  isCustom: true,
                }
              : t,
          ),
        )

        toast.success("Master template updated successfully.")
      } else {
        // Create new template
        const newId = `custom_${Date.now()}`
        const createdPayload = {
          title: finalTitle,
          name: finalName,
          category: finalCategory,
          scope: finalScope,
          scopeValue: finalScopeValue,
          specialty: finalSpecialty,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          advice: finalAdvice,
          content: finalDoctorNotes,
          practiceId,
        }

        try {
          await proctoService.createTemplate(createdPayload)
        } catch (apiErr) {
          console.warn("Backend template creation fallback:", apiErr)
        }

        const newTemplate: ClinicalTemplate = {
          id: newId,
          name: finalName,
          title: finalTitle,
          category: finalCategory as any,
          adviceCategory: finalCategory,
          scope: finalScope,
          scopeValue: finalScopeValue,
          specialty: finalSpecialty,
          doctorId: finalDoctorId,
          doctorName: finalDoctorName,
          createdById: finalDoctorId,
          createdByName: finalDoctorName,
          advice: finalAdvice,
          doctorNotes: finalDoctorNotes,
          remarks: finalDoctorNotes,
          content: finalDoctorNotes,
          isCustom: true,
          keywords: [finalTitle.toLowerCase(), finalCategory.toLowerCase()],
        }

        setTemplates((prev) => [newTemplate, ...prev])

        // Save custom to local cache as backup
        try {
          const localCache = localStorage.getItem("glucoguide_master_templates_custom")
          const currentList = localCache ? JSON.parse(localCache) : []
          localStorage.setItem(
            "glucoguide_master_templates_custom",
            JSON.stringify([newTemplate, ...currentList]),
          )
        } catch {
          // ignore
        }

        toast.success("New master template created successfully.")
      }

      setIsModalOpen(false)
    } catch (err: any) {
      toast.error(err?.message || "Failed to save master template.")
    } finally {
      setModalSaving(false)
    }
  }

  // Delete Template
  async function confirmDeleteTemplate() {
    if (!deletingTemplate) return
    setDeleteLoading(true)

    try {
      try {
        await proctoService.deleteTemplate(deletingTemplate.id, practiceId)
      } catch (err) {
        console.warn("Backend template deletion fallback:", err)
      }

      setTemplates((prev) => prev.filter((t) => t.id !== deletingTemplate.id))

      // Update local storage backup
      try {
        const localCache = localStorage.getItem("glucoguide_master_templates_custom")
        if (localCache) {
          const list = (JSON.parse(localCache) as ClinicalTemplate[]).filter(
            (t) => t.id !== deletingTemplate.id,
          )
          localStorage.setItem("glucoguide_master_templates_custom", JSON.stringify(list))
        }
      } catch {
        // ignore
      }

      toast.success(`Template "${deletingTemplate.title}" deleted.`)
      setDeletingTemplate(null)
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete template.")
    } finally {
      setDeleteLoading(false)
    }
  }

  // Active Category details
  const activeCategoryMeta = useMemo(() => {
    if (selectedCategory === "all") return null
    return (
      MASTER_ADVICE_CATEGORIES.find((c) => c.label === selectedCategory) || {
        id: "custom",
        label: selectedCategory,
        description: "Custom advice category defined by your clinic or practice.",
        badgeColor: "bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-950/60 dark:text-blue-200 dark:border-blue-800",
        iconName: "BookOpen",
        keywords: [],
      }
    )
  }, [selectedCategory])

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-blue-50 via-sky-50/50 to-indigo-50/30 p-6 shadow-sm dark:border-white/10 dark:from-sky-950/20 dark:via-blue-950/10 dark:to-indigo-950/20">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                Clinical Masters
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                • {templates.length} Active Templates
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Master Templates & Clinical Advice
            </h1>
            <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300">
              Select which category of advice you want your clinical templates for. Customize standard patient instructions and internal doctor notes across clinic, specialty, and personal scopes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-95"
            >
              <Plus className="h-4 w-4" />
              <span>Add Master Template</span>
            </button>
          </div>
        </div>
      </div>

      {/* Advice Category Selection Section */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-600 dark:text-sky-400" />
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Select Advice Category
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Click a category to focus on specific clinical advice templates, or star your preferred categories for quick access during consultations.
            </p>
          </div>

          {selectedCategory !== "all" && (
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className="self-start text-xs font-semibold text-blue-600 hover:underline dark:text-sky-400 sm:self-auto"
            >
              Show All Categories ({templates.length})
            </button>
          )}
        </div>

        {/* Categories Grid / Pills */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {/* All Categories Pill */}
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all ${
              selectedCategory === "all"
                ? "border-blue-600 bg-blue-50/80 shadow-sm ring-2 ring-blue-600/20 dark:border-sky-500 dark:bg-sky-950/40"
                : "border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-100/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                <BookOpen className="h-4 w-4" />
              </span>
              <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                {categoryCounts.all || 0}
              </span>
            </div>
            <div className="mt-2">
              <div className="text-xs font-bold text-slate-900 dark:text-white">All Categories</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">All master templates</div>
            </div>
          </button>

          {/* Individual Master Advice Categories */}
          {MASTER_ADVICE_CATEGORIES.map((cat) => {
            const count = categoryCounts[cat.label] || 0
            const isSelected = selectedCategory === cat.label
            const isPreferred = preferredCategories.includes(cat.label)

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.label)}
                className={`group relative flex flex-col items-start justify-between rounded-xl border p-3 text-left transition-all ${
                  isSelected
                    ? "border-blue-600 bg-blue-50/80 shadow-sm ring-2 ring-blue-600/20 dark:border-sky-500 dark:bg-sky-950/40"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                }`}
              >
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`flex h-7 w-7 items-center justify-center rounded-lg border ${cat.badgeColor}`}
                  >
                    <CategoryIcon name={cat.iconName} className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span
                      title="Toggle preferred category"
                      onClick={(e) => togglePreferredCategory(cat.label, e)}
                      className={`cursor-pointer rounded p-0.5 transition ${
                        isPreferred
                          ? "text-amber-500 hover:text-amber-600"
                          : "text-slate-300 hover:text-slate-400 dark:text-slate-600 dark:hover:text-slate-400"
                      }`}
                    >
                      <Star className={`h-3.5 w-3.5 ${isPreferred ? "fill-amber-400" : ""}`} />
                    </span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-white/10 dark:text-slate-300">
                      {count}
                    </span>
                  </div>
                </div>
                <div className="mt-2.5">
                  <div className="line-clamp-1 text-xs font-bold text-slate-900 dark:text-white" title={cat.label}>
                    {cat.label}
                  </div>
                  <div className="line-clamp-1 text-[10px] text-slate-500 dark:text-slate-400" title={cat.description}>
                    {cat.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Selected Advice Category Banner */}
        {activeCategoryMeta && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-sky-900/60 dark:bg-sky-950/30 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${activeCategoryMeta.badgeColor}`}>
                <CategoryIcon name={activeCategoryMeta.iconName} className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    {activeCategoryMeta.label}
                  </h3>
                  <span className="rounded-full bg-blue-200/80 px-2 py-0.5 text-xs font-semibold text-blue-900 dark:bg-sky-900/80 dark:text-sky-200">
                    {categoryCounts[activeCategoryMeta.label] || 0} Templates
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                  {activeCategoryMeta.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add in {activeCategoryMeta.label}
              </button>
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Scope Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setSelectedScope("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              selectedScope === "all"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            All Scopes
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("clinic")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              selectedScope === "clinic"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Building className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            Clinic-Level
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("specialty")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              selectedScope === "specialty"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Stethoscope className="h-3 w-3 text-blue-600 dark:text-sky-400" />
            Specialty
          </button>
          <button
            type="button"
            onClick={() => setSelectedScope("doctor")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              selectedScope === "doctor"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <User className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            My Doctor Notes
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[260px] flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search title, advice, notes, code..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-900 dark:text-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Templates List / Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center dark:border-white/10 dark:bg-white/5">
          <BookOpen className="h-10 w-10 text-slate-400" />
          <h3 className="mt-3 text-base font-bold text-slate-800 dark:text-white">
            No templates match the criteria
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {searchQuery
              ? `No templates found matching "${searchQuery}". Try a different search term or category.`
              : "No templates in this category or scope. You can create a new master template."}
          </p>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Master Template
            </button>
            {(searchQuery || selectedCategory !== "all" || selectedScope !== "all") && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("")
                  setSelectedCategory("all")
                  setSelectedScope("all")
                }}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredTemplates.map((tpl) => {
            const categoryLabel = resolveAdviceCategory(tpl)
            const catMeta = MASTER_ADVICE_CATEGORIES.find((c) => c.label === categoryLabel)
            const isCopiedAdvice = copiedAdviceId === tpl.id
            const isCopiedNotes = copiedNotesId === tpl.id
            const doctorNotesText = tpl.doctorNotes || tpl.remarks || tpl.content || ""

            return (
              <div
                key={tpl.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-white/10 dark:bg-slate-900"
              >
                {/* Card Header */}
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Scope Badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            tpl.scope === "clinic"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : tpl.scope === "specialty"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300"
                                : "bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300"
                          }`}
                        >
                          {tpl.scope === "clinic" ? (
                            <>
                              <Building className="h-3 w-3" />
                              <span>All Doctors & Specialties (Clinic)</span>
                            </>
                          ) : tpl.scope === "specialty" ? (
                            <>
                              <Stethoscope className="h-3 w-3" />
                              <span>Specialty: {tpl.specialty || tpl.scopeValue || "Specialty"}</span>
                            </>
                          ) : (
                            <>
                              <User className="h-3 w-3" />
                              <span>{tpl.doctorName || (tpl.createdByName ? `Dr. ${tpl.createdByName}` : "Doctor Private")}</span>
                              {tpl.specialty && <span className="opacity-75">({tpl.specialty})</span>}
                            </>
                          )}
                        </span>

                        {/* Advice Category Badge */}
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                            catMeta?.badgeColor ||
                            "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300"
                          }`}
                        >
                          <CategoryIcon
                            name={catMeta?.iconName || "BookOpen"}
                            className="h-3 w-3"
                          />
                          <span>{categoryLabel}</span>
                        </span>

                        {tpl.isCustom && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                            Custom
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {tpl.title}
                      </h3>
                      <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        Code: {tpl.name}
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(tpl)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                        title="Edit Template"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingTemplate(tpl)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                        title="Delete Template"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Clinical Advice Box */}
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5 dark:border-emerald-950/50 dark:bg-emerald-950/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-300">
                        <FileText className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Clinical Advice (Printed on Prescription)</span>
                      </div>
                      {tpl.advice && (
                        <button
                          type="button"
                          onClick={() => copyText("advice", tpl.advice, tpl.id)}
                          className="flex items-center gap-1 rounded bg-white/80 px-2 py-0.5 text-[11px] font-medium text-emerald-800 shadow-xs hover:bg-white dark:bg-emerald-900/50 dark:text-emerald-200"
                          title="Copy advice text"
                        >
                          {isCopiedAdvice ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {tpl.advice || (
                        <span className="italic text-slate-400">No patient advice defined.</span>
                      )}
                    </p>
                  </div>

                  {/* Doctor Notes Box */}
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/40 p-3.5 dark:border-sky-950/50 dark:bg-sky-950/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-blue-900 dark:text-sky-300">
                        <Stethoscope className="h-3.5 w-3.5 text-blue-600 dark:text-sky-400" />
                        <span>Doctor Notes (Internal Clinical Record)</span>
                      </div>
                      {doctorNotesText && (
                        <button
                          type="button"
                          onClick={() => copyText("notes", doctorNotesText, tpl.id)}
                          className="flex items-center gap-1 rounded bg-white/80 px-2 py-0.5 text-[11px] font-medium text-blue-800 shadow-xs hover:bg-white dark:bg-sky-900/50 dark:text-sky-200"
                          title="Copy doctor notes text"
                        >
                          {isCopiedNotes ? (
                            <>
                              <Check className="h-3 w-3 text-blue-600" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                      {doctorNotesText || (
                        <span className="italic text-slate-400">No doctor notes defined.</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-white/5 dark:text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>{tpl.createdByName ? `By Dr. ${tpl.createdByName}` : "Standard Master"}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(tpl)}
                      className="font-semibold text-blue-600 hover:underline dark:text-sky-400"
                    >
                      Edit Template
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Master Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-white/10">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  <Sparkles className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {modalMode === "create" ? "Create Master Template" : "Edit Master Template"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Define clinical advice for prescriptions and internal doctor notes.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveTemplate} className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Template Title & Code */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Template Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={modalTitle}
                    onChange={(e) => setModalTitle(e.target.value)}
                    placeholder="e.g. Type 2 Diabetes Mellitus Protocol"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Unique Identifier / Code
                  </label>
                  <input
                    type="text"
                    value={modalName}
                    onChange={(e) => setModalName(e.target.value.toUpperCase())}
                    placeholder="e.g. SPEC-DM2-MGMT (Auto-generated if empty)"
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-mono text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Category of Advice & Specialty */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Category of Advice <span className="text-rose-500">*</span>
                  </label>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Select which clinical condition or medication group this advice applies to.
                  </p>
                  <select
                    value={modalAdviceCategory}
                    onChange={(e) => setModalAdviceCategory(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  >
                    {MASTER_ADVICE_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.label}>
                        {c.label}
                      </option>
                    ))}
                    <option value="__custom__">+ Custom Category...</option>
                  </select>

                  {modalAdviceCategory === "__custom__" && (
                    <input
                      type="text"
                      required
                      value={customCategoryInput}
                      onChange={(e) => setCustomCategoryInput(e.target.value)}
                      placeholder="Enter custom category name..."
                      className="mt-2 w-full rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-blue-700 dark:bg-slate-800 dark:text-white"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Specialty
                  </label>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Target specialty or all departments.
                  </p>
                  <select
                    value={modalSpecialty}
                    onChange={(e) => handleSpecialtyChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Specialty</option>
                    {specialties.map((spec) => (
                      <option key={spec} value={spec}>
                        {spec}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Hierarchical Scope & Doctor Name */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Hierarchical Scope
                  </label>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Visibility level within your clinical practice.
                  </p>
                  <select
                    value={modalScope}
                    onChange={(e) => handleScopeChange(e.target.value as TemplateScope)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="clinic">Clinic-Level (Default: All Specialty & All Doctors - Accessible to all doctors across the clinic)</option>
                    <option value="specialty">Specialty-Level (Specific Specialty & All Doctors - Applicable to all doctors within that specific specialty)</option>
                    <option value="doctor">Doctor-Level (Specific Specialty & Specific Doctor - Strictly restricted to selected doctor)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Doctor Name
                  </label>
                  <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Target doctor or all clinic doctors.
                  </p>
                  <select
                    value={modalDoctorId}
                    onChange={(e) => handleDoctorChange(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-white/10 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="all">All Doctors</option>
                    {doctors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.specialties?.length ? `(${d.specialties.join(", ")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Patient Advice Textarea */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400">
                    Patient Clinical Advice (Printed on Prescription)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {modalAdvice.length} characters
                  </span>
                </div>
                <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Lifestyle, dietary precautions, and warning signs (printed on patient prescription).
                </p>
                <textarea
                  rows={3}
                  value={modalAdvice}
                  onChange={(e) => setModalAdvice(e.target.value)}
                  placeholder="e.g. Lifestyle & Dietary Precautions: Follow low glycemic index diet. Avoid refined sugars, sweets, and sweetened beverages. Exercise: 30 mins brisk walking daily. Warning Signs: Carry glucose tablets or fruit juice for hypoglycemia (sweating, trembling). Report foot lesions promptly."
                  className="w-full rounded-xl border border-emerald-300 bg-emerald-50/20 p-3 text-xs text-slate-900 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/20 dark:text-white"
                />
              </div>

              {/* Doctor Notes Textarea */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-sky-400">
                    Doctor Notes (Internal Clinical Records)
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {modalDoctorNotes.length} characters
                  </span>
                </div>
                <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Physical assessment notes, clinical remarks, and follow-up plans (internal clinical records, not printed on prescription).
                </p>
                <textarea
                  rows={3}
                  value={modalDoctorNotes}
                  onChange={(e) => setModalDoctorNotes(e.target.value)}
                  placeholder="e.g. Physical Assessment: Foot exam intact, pedal pulses palpable. Target HbA1c < 7.0%. Clinical Remarks: Glycemic control stable on current regimen. Follow-up Plan: Dilated eye checkup and urine ACR; review in 4 weeks with home blood glucose log."
                  className="w-full rounded-xl border border-blue-300 bg-blue-50/20 p-3 text-xs text-slate-900 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600 dark:border-sky-800 dark:bg-sky-950/20 dark:text-white"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {modalSaving ? "Saving..." : modalMode === "create" ? "Create Template" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-slate-900">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                <Trash2 className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Delete Master Template?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              <div className="font-bold">{deletingTemplate.title}</div>
              <div className="font-mono text-[11px] text-slate-500">
                {deletingTemplate.name} • Scope: {deletingTemplate.scope}
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingTemplate(null)}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteLoading}
                onClick={confirmDeleteTemplate}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete Template"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
