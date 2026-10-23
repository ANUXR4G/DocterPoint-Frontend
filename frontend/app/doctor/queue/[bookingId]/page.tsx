"use client"

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { Icon, ThinkingLoader } from "@/components"
import { firey } from "@/utils"
import { proctoService, type ProctoBooking } from "@/lib/services/procto"
import { practiceTabHref } from "@/lib/doctorPracticeTabs"
import CareChatPanel from "@/components/ui/procto/CareChatPanel"
import { getSessionUserId } from "@/lib/sessionUser"
import {
  BOOKING_DOCUMENT_ACCEPT,
  MAX_BOOKING_DOCUMENTS,
  uploadBookingDocument,
} from "@/lib/uploadBookingDocument"
import {
  bookingStatusClass,
  bookingStatusLabel,
} from "@/lib/bookingStatus"
import {
  chiefComplaintOf,
  formatArrival,
  isEmergencyWalkIn,
} from "@/lib/bookingDisplay"
import EmergencyWalkInBadge from "@/components/ui/procto/EmergencyWalkInBadge"
import PaymentStatusButton from "@/components/ui/procto/PaymentStatusButton"
import PrescriptionActionsMenu from "@/components/ui/procto/PrescriptionActionsMenu"
import PopupModal from "@/components/modals/Modal"
import MedicineEntryTable, {
  editedVisitMedicine,
  emptyMedicineDraft,
  medicineFromDraft,
  visitMedicineSignature,
  isMedicineLocked,
  type VisitMedicine,
} from "@/components/ui/procto/MedicineEntryTable"
import { formatPhoneDisplay } from "@/lib/formatPhone"
import {
  formatPracticeDate,
  formatPracticeTime,
  practiceDateIso,
  practiceTodayIso,
  isBeforeClinicToday,
  isCurrentOrFutureClinicDay,
  isAfterClinicToday,
} from "@/lib/practiceTime"
import { patchBookingFields } from "@/lib/liveBooking"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import PatientAvatar from "@/components/ui/procto/PatientAvatar"
import ClinicalAssessmentPanel from "@/components/ui/procto/ClinicalAssessmentPanel"
import TemplateSelector from "@/components/ui/procto/TemplateSelector"
import SendToCustomerModal from "@/components/ui/procto/SendToCustomerModal"
import type { ClinicalAssessment } from "@/lib/clinicalMasters"
import { toast } from "sonner"

type Medicine = VisitMedicine
type VisitDoc = { name: string; url: string; uploadedAt?: string }

type VisitBooking = {
  id: string
  practiceId?: string
  status: string
  mode: string
  channel: string
  patientPhone?: string
  patientName?: string | null
  notes?: string | null
  consultationType?: string | null
  disease?: string | null
  doctorRemarks?: string | null
  medicines?: Medicine[] | null
  documents?: VisitDoc[] | null
  clinicalAssessment?: ClinicalAssessment | null
  clinicalVersions?: Array<{
    id: string
    savedAt: string
    actorName?: string | null
    snapshot: ClinicalAssessment
  }>
  slotStart?: string | null
  tokenNumber?: number | null
  sessionDate?: string | null
  arrivedAt?: string | null
  paymentStatus?: string | null
  paymentAmount?: number | null
  paidAt?: string | null
  createdAt?: string | null
  created_at?: string | null
  practice?: {
    id?: string
    name: string
    slug: string
    specialty?: string | null
    clinicalMasters?: unknown
  }
  location?: { name: string; address: string; city: string }
  provider?: { id: string; name: string | null; email?: string | null } | null
  patient?: {
    id: string | null
    name: string | null
    email: string | null
    phone: string | null
    gender: string | null
    address: string | null
    imgSrc?: string | null
    dateOfBirth: string | null
    age?: number | null
    contactNumber: string | null
    emergencyNumber?: string | null
    mrn?: string | null
    relationship?: string | null
    profession?: string | null
  } | null
}

/** Auto-generated visit briefs — never load into the doctor's remarks box. */
function isAutoVisitBrief(text?: string | null): boolean {
  const t = text?.trim() || ""
  if (!t) return false
  return (
    /^Chief complaint:/i.test(t) ||
    /^Patient problem:/i.test(t) ||
    /^Patient's description:/i.test(t) ||
    /AI brief for doctor:/i.test(t)
  )
}

function doctorRemarksForEdit(text?: string | null): string {
  if (!text?.trim() || isAutoVisitBrief(text)) return ""
  return text.trim()
}

/** Optional patient fields: empty when we never collected the value. */
function blank(v: string | null | undefined) {
  return v?.trim() ? v.trim() : ""
}

function ageFromDob(dob?: string | null, age?: number | null): string {
  if (typeof age === "number" && age >= 0 && age <= 130) return String(age)
  if (!dob?.trim()) return ""
  const n = firey.calculateAge(dob)
  return n >= 0 && n <= 130 ? String(n) : ""
}

function GeneralDocumentsTab({
  docs,
  linked,
  uploading,
  onUpload,
}: {
  docs: VisitDoc[]
  linked: boolean | null
  uploading: boolean
  onUpload: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  if (linked === false) {
    return (
      <p className="mt-4 text-sm opacity-60">
        This visit isn&apos;t linked to a registered patient, so there is no
        patient record for general documents.
      </p>
    )
  }
  return (
    <>
      <label
        className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/50 px-4 py-6 text-center dark:border-violet-500/40 dark:bg-violet-950/20 ${
          uploading || linked === null
            ? "pointer-events-none opacity-50"
            : "hover:border-violet-500"
        }`}
      >
        <span className="text-sm font-semibold text-violet-700 dark:text-violet-300">
          {uploading ? "Uploading…" : "Upload to patient record"}
        </span>
        <span className="text-xs opacity-70">JPG, PNG, WEBP, PDF · max 10 MB</span>
        <input
          type="file"
          className="hidden"
          accept={BOOKING_DOCUMENT_ACCEPT}
          disabled={uploading || linked === null}
          onChange={onUpload}
        />
      </label>
      {docs.length === 0 ? (
        <p className="mt-4 text-sm opacity-60">
          {linked === null ? "Loading…" : "No general documents yet."}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {docs.map((d, idx) => (
            <li
              key={`${d.url}-${idx}`}
              className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700"
            >
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                  <Icon name="written-page" className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-violet-700 hover:underline dark:text-violet-300">
                    {d.name || "View document"}
                  </span>
                  {d.uploadedAt ? (
                    <span className="block text-xs opacity-60">
                      {formatPracticeDate(d.uploadedAt)}
                    </span>
                  ) : null}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

export default function VisitPage() {
  const params = useParams<{ bookingId: string }>()
  const router = useRouter()
  const bookingId = params.bookingId
  const {
    bookings: sharedBookings,
    ready,
    patchBooking: patchSharedBooking,
  } = usePracticeDashboard()

  const fromShared = useMemo(
    () =>
      sharedBookings.find((b) => b.id === bookingId) as VisitBooking | undefined,
    [sharedBookings, bookingId],
  )

  const [booking, setBooking] = useState<VisitBooking | null>(null)
  const [detailLoaded, setDetailLoaded] = useState(false)
  const [error, setError] = useState("")
  const [loadTick, setLoadTick] = useState(0)
  const [saving, setSaving] = useState(false)
  const [sendingWa, setSendingWa] = useState(false)
  const [sendCustomerModalOpen, setSendCustomerModalOpen] = useState(false)
  const [uploading, setUploading] = useState(false)

  const [remarks, setRemarks] = useState("")
  const [complaint, setComplaint] = useState("")
  const [diagnosis, setDiagnosis] = useState("")
  const [advice, setAdvice] = useState("")
  const complaintRef = useRef("")
  const diagnosisRef = useRef("")
  const adviceRef = useRef("")
  complaintRef.current = complaint
  diagnosisRef.current = diagnosis
  adviceRef.current = advice
  const remarksBox = useRef<HTMLTextAreaElement>(null)
  const adviceBox = useRef<HTMLTextAreaElement>(null)
  const [isAdviceTemplateOpen, setIsAdviceTemplateOpen] = useState(false)
  const [isNotesTemplateOpen, setIsNotesTemplateOpen] = useState(false)
  useEffect(() => {
    const el = remarksBox.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.max(160, el.scrollHeight)}px`
  }, [remarks])
  useEffect(() => {
    const el = adviceBox.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.max(80, el.scrollHeight)}px`
  }, [advice])
  const [medicines, setMedicines] = useState<Medicine[]>([])
  const [documents, setDocuments] = useState<VisitDoc[]>([])
  const [clinicalAssessment, setClinicalAssessment] =
    useState<ClinicalAssessment | null>(null)
  const [clinicalVersions, setClinicalVersions] = useState<
    Array<{
      id: string
      savedAt: string
      actorName?: string | null
      snapshot: ClinicalAssessment
    }>
  >([])
  const clinicalReady = useRef(false)
  const clinicalDirty = useRef(false)
  const formDirty = useRef(false)
  const clinicalRef = useRef<ClinicalAssessment | null>(null)
  const documentsRef = useRef<VisitDoc[]>([])
  const fetchGen = useRef(0)
  const [docTab, setDocTab] = useState<"appointment" | "general">("appointment")
  const [generalDocs, setGeneralDocs] = useState<VisitDoc[]>([])
  const [generalLinked, setGeneralLinked] = useState<boolean | null>(null)
  const [medDraft, setMedDraft] = useState<Medicine>(() => emptyMedicineDraft())
  const medDraftRef = useRef<Medicine>(emptyMedicineDraft())
  medDraftRef.current = medDraft
  const medicinesRef = useRef<Medicine[]>([])
  medicinesRef.current = medicines
  const medicineSaved = useRef<string[]>([])
  const medicineGeneration = useRef(0)
  const visitHeaderRef = useRef<HTMLDivElement>(null)
  const visitPageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const header = visitHeaderRef.current
    const page = visitPageRef.current
    if (!header || !page) return
    const apply = () => {
      page.style.setProperty("--visit-header-h", `${header.offsetHeight}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(header)
    return () => observer.disconnect()
  }, [booking?.id])

  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [pendingNav, setPendingNav] = useState<string | null>(null)

  const hasUnsavedChanges = useCallback((): boolean => {
    if (!bookingId) return false
    const isCompleted =
      String(booking?.status || "").toUpperCase() === "COMPLETED"
    if (isCompleted) return false
    return (
      formDirty.current ||
      clinicalDirty.current ||
      Boolean(medDraftRef.current?.name?.trim())
    )
  }, [booking?.status, bookingId])

  async function handleSaveAndLeave() {
    const success = await save()
    if (!success) return
    formDirty.current = false
    clinicalDirty.current = false
    setShowUnsavedModal(false)
    const dest = pendingNav
    setPendingNav(null)
    if (dest === "BACK") {
      router.back()
    } else if (dest) {
      router.push(dest)
    } else {
      router.push("/doctor/queue")
    }
  }

  function handleDiscardAndLeave() {
    formDirty.current = false
    clinicalDirty.current = false
    const blank = emptyMedicineDraft()
    medDraftRef.current = blank
    setMedDraft(blank)
    setShowUnsavedModal(false)
    const dest = pendingNav
    setPendingNav(null)
    if (dest === "BACK") {
      router.back()
    } else if (dest) {
      router.push(dest)
    } else {
      router.push("/doctor/queue")
    }
  }

  function handleNavigateBack() {
    if (hasUnsavedChanges()) {
      setPendingNav("/doctor/queue")
      setShowUnsavedModal(true)
    } else {
      router.push("/doctor/queue")
    }
  }

  // Intercept navigation clicks across the page (sidebar, top navigation, back links)
  useEffect(() => {
    function handleClickCapture(e: MouseEvent) {
      if (!hasUnsavedChanges()) return

      const target = e.target as HTMLElement | null
      const anchor = target?.closest("a") as HTMLAnchorElement | null
      if (!anchor) return

      const href = anchor.getAttribute("href")
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) return
      if (
        anchor.target === "_blank" ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return

      try {
        const destUrl = new URL(anchor.href, window.location.origin)
        if (
          destUrl.origin === window.location.origin &&
          destUrl.pathname === window.location.pathname &&
          destUrl.search === window.location.search
        ) {
          return
        }
      } catch {
        // Continue
      }

      e.preventDefault()
      e.stopPropagation()
      setPendingNav(href)
      setShowUnsavedModal(true)
    }

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges()) {
        e.preventDefault()
        e.returnValue = ""
        return ""
      }
    }

    function handlePopState() {
      if (hasUnsavedChanges()) {
        window.history.pushState(null, "", window.location.href)
        setPendingNav("BACK")
        setShowUnsavedModal(true)
      }
    }

    document.addEventListener("click", handleClickCapture, true)
    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("popstate", handlePopState)

    return () => {
      document.removeEventListener("click", handleClickCapture, true)
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("popstate", handlePopState)
    }
  }, [hasUnsavedChanges])

  const applyVisitData = useCallback((data: VisitBooking, mode: "hydrate" | "refresh") => {
    setBooking(data)
    if (Array.isArray(data.clinicalVersions)) {
      setClinicalVersions(data.clinicalVersions)
    }
    // Hydrate replaces the form with the stored visit. A later refresh keeps
    // the chart, notes, and files the doctor has changed and not saved.
    if (mode === "hydrate" || (!clinicalDirty.current && !formDirty.current)) {
      setRemarks(doctorRemarksForEdit(data.doctorRemarks))
      setComplaint(String(data.disease || "").trim())
      const storedDiagnosis = String(
        (data.clinicalAssessment as ClinicalAssessment | null)?.diagnosis || "",
      ).trim()
      setDiagnosis(storedDiagnosis)
      diagnosisRef.current = storedDiagnosis
      const storedAdvice = String(
        (data.clinicalAssessment as ClinicalAssessment | null)?.advice || "",
      ).trim()
      setAdvice(storedAdvice)
      adviceRef.current = storedAdvice
      const meds = Array.isArray(data.medicines) ? data.medicines : []
      const docs = Array.isArray(data.documents) ? data.documents : []
      setMedicines(meds)
      medicinesRef.current = meds
      medicineSaved.current = meds.map((row) => visitMedicineSignature(row))
      setDocuments(docs)
      documentsRef.current = docs
      let chart = (data.clinicalAssessment as ClinicalAssessment) ?? null
      const patientAllergies = (data as any)?.patient?.allergies
      const patientNoKnown = Boolean((data as any)?.patient?.noKnownAllergies)
      const hasChartAllergies =
        Boolean(chart?.noKnownAllergies) ||
        (Array.isArray(chart?.allergies) && chart.allergies.some((a) => Boolean(a.name?.trim())))

      if (
        !hasChartAllergies &&
        ((Array.isArray(patientAllergies) && patientAllergies.length > 0) || patientNoKnown)
      ) {
        chart = {
          ...(chart ?? {
            vitals: { breakfast: null, values: {} },
            pain: [],
            allergies: [],
            noKnownAllergies: false,
          }),
          allergies: patientAllergies ?? [],
          noKnownAllergies: patientNoKnown,
        }
      }
      clinicalRef.current = chart
      setClinicalAssessment(chart)
      clinicalDirty.current = false
      formDirty.current = false
      clinicalReady.current = true
    }
    setDetailLoaded(true)
    setError("")
  }, [])

  const load = useCallback(async (mode: "hydrate" | "refresh" = "refresh") => {
    if (!bookingId) return null
    const gen = ++fetchGen.current
    const res = await proctoService.getBooking(bookingId)
    if (gen !== fetchGen.current) return null
    if (res.status !== "successful" || !res.data) return null
    const data = res.data as VisitBooking
    applyVisitData(data, mode)
    return data
  }, [bookingId, applyVisitData])

  useEffect(() => {
    clinicalReady.current = false
    clinicalDirty.current = false
    formDirty.current = false
    clinicalRef.current = null
    setDetailLoaded(false)
    setClinicalAssessment(null)
    setError("")
  }, [bookingId])

  useEffect(() => {
    if (!bookingId || !ready) return
    const gen = ++fetchGen.current
    let cancelled = false
    void (async () => {
      const gaps = [0, 1000, 2500]
      let res: Awaited<ReturnType<typeof proctoService.getBooking>> | null = null
      for (let attempt = 0; attempt < gaps.length; attempt++) {
        if (gaps[attempt]) await new Promise((r) => setTimeout(r, gaps[attempt]))
        if (cancelled || gen !== fetchGen.current) return
        res = await proctoService.getBooking(bookingId)
        if (cancelled || gen !== fetchGen.current) return
        if (res.status === "successful" && res.data) {
          applyVisitData(res.data as VisitBooking, "hydrate")
          return
        }
        const msg = (res.message || "").toLowerCase()
        const missing = /not found|forbidden|unauthorized/.test(msg)
        if (missing) break
      }
      if (cancelled || gen !== fetchGen.current) return
      setError(res?.message || "Visit not found.")
    })()
    return () => {
      cancelled = true
    }
  }, [bookingId, ready, applyVisitData, loadTick])

  useEffect(() => {
    if (!fromShared || !detailLoaded) return
    setBooking((prev) =>
      prev
        ? patchBookingFields(prev, fromShared as Record<string, unknown>)
        : prev,
    )
  }, [fromShared, detailLoaded])

  const loadGeneralDocs = useCallback(async () => {
    if (!bookingId) return
    const res = await proctoService.getGeneralDocuments(bookingId)
    if (res.status !== "successful" || !res.data) return
    const data = res.data as { patientLinked?: boolean; documents?: VisitDoc[] }
    setGeneralLinked(Boolean(data.patientLinked))
    setGeneralDocs(Array.isArray(data.documents) ? data.documents : [])
  }, [bookingId])

  useEffect(() => {
    if (ready) void loadGeneralDocs()
  }, [ready, loadGeneralDocs])

  function chartWithDiagnosis(chart: ClinicalAssessment | null): ClinicalAssessment {
    return {
      ...(chart ?? {
        vitals: { breakfast: null, values: {} },
        pain: [],
        allergies: [],
        noKnownAllergies: false,
      }),
      diagnosis: diagnosisRef.current.trim().slice(0, 500),
      advice: adviceRef.current.trim().slice(0, 3000),
    }
  }

  async function persistVisit(
    nextMedicines: Medicine[],
    nextDocuments: VisitDoc[] = documents,
    opts?: {
      status?: string
      successMessage?: string
      medicineGeneration?: number
    },
  ) {
    if (!bookingId || String(booking?.status || "").toUpperCase() === "COMPLETED")
      return false
    const apptDay = booking?.slotStart
      ? practiceDateIso(booking.slotStart)
      : booking?.sessionDate
        ? practiceDateIso(booking.sessionDate)
        : null
    if (apptDay && apptDay < practiceTodayIso()) {
      return false
    }
    // Ensure WhatsApp / server documents are loaded before any save so we
    // never POST documents:[] and wipe patient attachments.
    let docsToSave = nextDocuments.length ? nextDocuments : documentsRef.current
    if (docsToSave.length === 0) {
      const fresh = await proctoService.getBooking(bookingId)
      const serverDocs = Array.isArray(fresh.data?.documents)
        ? (fresh.data.documents as VisitDoc[])
        : []
      if (serverDocs.length > 0) {
        docsToSave = serverDocs
        documentsRef.current = serverDocs
        setDocuments(serverDocs)
      }
    }
    const disease = complaintRef.current.trim()
    const chart = chartWithDiagnosis(clinicalRef.current)
    const medicinesPayload =
      opts?.status === "COMPLETED"
        ? nextMedicines.map((m) => ({
            ...m,
            isOrdered: true,
            status: m.status || "ordered",
            orderedAt: m.orderedAt || new Date().toISOString(),
          }))
        : nextMedicines
    const res = await proctoService.updateBookingVisit(bookingId, {
      doctorRemarks: remarks,
      ...(disease ? { disease } : {}),
      medicines: medicinesPayload,
      documents: docsToSave,
      ...(clinicalReady.current || chart.diagnosis || chart.advice
        ? { clinicalAssessment: chart }
        : {}),
      ...(opts?.status ? { status: opts.status } : {}),
    })
    if (res.status !== "successful") {
      toast.error(res.message || "Could not save visit.")
      await load("refresh")
      return false
    }
    const saved = res.data as VisitBooking
    const localMeds = medicinesRef.current
    const localSaved = medicineSaved.current
    const dirty = formDirty.current
    applyVisitData(saved, "hydrate")
    const stale =
      opts?.medicineGeneration != null &&
      opts.medicineGeneration !== medicineGeneration.current
    if (stale) {
      medicinesRef.current = localMeds
      setMedicines(localMeds)
      medicineSaved.current = localSaved
      formDirty.current = dirty
    }
    patchSharedBooking(bookingId, saved as Partial<ProctoBooking>)
    if (opts?.successMessage) toast.success(opts.successMessage)
    return true
  }

  function addMedicine() {
    const row = medicineFromDraft(medDraftRef.current)
    if (!row || !bookingId) return
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") return

    const alreadyAdded = medicinesRef.current.some(
      (m) => m.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
    )
    if (alreadyAdded) {
      toast.info(`"${row.name}" is already added to the prescription.`)
      return
    }

    const next = [...medicinesRef.current, row]
    formDirty.current = true
    medicinesRef.current = next
    setMedicines(next)
    toast.success(`Added "${row.name}" to prescription`)
    const blank = emptyMedicineDraft()
    medDraftRef.current = blank
    setMedDraft(blank)
  }

  function removeMedicine(idx: number) {
    if (
      !bookingId ||
      String(booking?.status || "").toUpperCase() === "COMPLETED"
    )
      return
    const target = medicinesRef.current[idx]
    if (target && isMedicineLocked(target, chartLocked)) {
      toast.error(`"${target.name}" has already been ordered and is locked to preserve historical audit trails.`)
      return
    }
    const next = medicines.filter((_, i) => i !== idx)
    formDirty.current = true
    medicinesRef.current = next
    setMedicines(next)
  }

  function addMedicinesBulk(newMeds: VisitMedicine[]) {
    if (!newMeds.length || !bookingId) return
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") return

    const existingNames = new Set(
      medicinesRef.current.map((m) => m.name.trim().toLowerCase()),
    )
    const toAdd: VisitMedicine[] = []
    const alreadyAdded: string[] = []

    for (const med of newMeds) {
      const key = med.name.trim().toLowerCase()
      if (!key) continue
      if (existingNames.has(key)) {
        alreadyAdded.push(med.name.trim())
      } else {
        existingNames.add(key)
        toAdd.push(med)
      }
    }

    if (toAdd.length === 0) {
      if (alreadyAdded.length === 1) {
        toast.info(`"${alreadyAdded[0]}" is already added to the prescription.`)
      } else if (alreadyAdded.length > 1) {
        toast.info(`${alreadyAdded.length} medicines are already added.`)
      }
      return
    }

    const next = [...medicinesRef.current, ...toAdd]
    formDirty.current = true
    medicinesRef.current = next
    setMedicines(next)

    if (toAdd.length === 1) {
      toast.success(`Added "${toAdd[0].name}" to prescription`)
    } else {
      toast.success(`Added ${toAdd.length} medicines to prescription`)
    }

    if (alreadyAdded.length > 0) {
      toast.info(
        `Skipped duplicate: ${alreadyAdded.join(", ")} already in prescription.`,
      )
    }
  }

  function toggleMedicineFavourite(idx: number, fav: boolean) {
    const med = medicinesRef.current[idx]
    if (!med) return
    editMedicine(idx, { favourite: fav }, true)
  }

  function editMedicine(
    idx: number,
    patch: Partial<Medicine>,
    commit: boolean,
  ) {
    if (
      !bookingId ||
      String(booking?.status || "").toUpperCase() === "COMPLETED"
    )
      return
    const current = medicinesRef.current[idx]
    if (!current) return
    if (isMedicineLocked(current, chartLocked)) {
      if (commit) {
        toast.error(`"${current.name}" has already been ordered and cannot be edited.`)
      }
      return
    }
    if (commit && patch.name && patch.name.trim()) {
      const newName = patch.name.trim().toLowerCase()
      const isDuplicate = medicinesRef.current.some(
        (m, i) => i !== idx && m.name.trim().toLowerCase() === newName,
      )
      if (isDuplicate) {
        toast.info(
          `"${patch.name.trim()}" is already added to the prescription.`,
        )
        return
      }
    }
    const edited = editedVisitMedicine(current, patch, commit)
    const next = medicinesRef.current.map((row, i) => (i === idx ? edited : row))
    formDirty.current = true
    medicinesRef.current = next
    setMedicines(next)
  }

  async function onUploadGeneral(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !bookingId) return
    setUploading(true)
    try {
      const uploaded = await uploadBookingDocument(file)
      const res = await proctoService.addGeneralDocument(bookingId, {
        name: uploaded.name,
        url: uploaded.url,
      })
      if (res.status !== "successful") {
        toast.error(res.message || "Could not save to the patient record.")
        return
      }
      const data = res.data as { documents?: VisitDoc[] }
      setGeneralDocs(Array.isArray(data?.documents) ? data.documents : [])
      toast.success("Saved to the patient's general documents.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload document.",
      )
    } finally {
      setUploading(false)
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !bookingId) return
    if (documents.length >= MAX_BOOKING_DOCUMENTS) {
      toast.error(`At most ${MAX_BOOKING_DOCUMENTS} documents per visit.`)
      return
    }
    setUploading(true)
    try {
      const uploaded = await uploadBookingDocument(file)
      const previousDocs = documentsRef.current
      const nextDocs = [...previousDocs, uploaded]
      documentsRef.current = nextDocs
      setDocuments(nextDocs)
      const res = await proctoService.updateBookingVisit(bookingId, {
        documents: nextDocs,
      })
      if (res.status !== "successful") {
        documentsRef.current = previousDocs
        setDocuments(previousDocs)
        toast.error(res.message || "Document uploaded but could not save to visit.")
        return
      }
      setBooking(res.data as VisitBooking)
      toast.success("Document saved.")
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not upload document.",
      )
    } finally {
      setUploading(false)
    }
  }

  function medicinesToSave(): Medicine[] {
    const current = medicinesRef.current
    const row = medicineFromDraft(medDraftRef.current)
    if (!row) return current
    const exists = current.some(
      (m) => m.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
    )
    if (exists) return current
    return [...current, row]
  }

  async function save(nextStatus?: string): Promise<boolean> {
    if (!bookingId) return false
    if (String(booking?.status || "").toUpperCase() === "COMPLETED") return false
    const apptDay = booking?.slotStart
      ? practiceDateIso(booking.slotStart)
      : booking?.sessionDate
        ? practiceDateIso(booking.sessionDate)
        : null
    if (apptDay && apptDay < practiceTodayIso()) {
      toast.error(
        "Historical entries prior to the current date are immutable and cannot be modified or deleted.",
      )
      return false
    }
    const nextMedicines = medicinesToSave()
    medicinesRef.current = nextMedicines
    setMedicines(nextMedicines)
    if (medicineFromDraft(medDraftRef.current)) {
      const blank = emptyMedicineDraft()
      medDraftRef.current = blank
      setMedDraft(blank)
    }
    setSaving(true)
    const disease = complaintRef.current.trim()
    const chart = chartWithDiagnosis(clinicalRef.current)
    const medicinesPayload =
      nextStatus === "COMPLETED"
        ? nextMedicines.map((m) => ({
            ...m,
            isOrdered: true,
            status: m.status || "ordered",
            orderedAt: m.orderedAt || new Date().toISOString(),
          }))
        : nextMedicines
    const res = await proctoService.updateBookingVisit(bookingId, {
      doctorRemarks: remarks,
      ...(disease ? { disease } : {}),
      medicines: medicinesPayload,
      documents: documentsRef.current,
      ...(clinicalReady.current || chart.diagnosis || chart.advice
        ? { clinicalAssessment: chart }
        : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
    })
    setSaving(false)
    if (res.status !== "successful") {
      toast.error(res.message || "Could not save visit.")
      return false
    }
    const saved = res.data as VisitBooking
    applyVisitData(saved, "hydrate")
    patchSharedBooking(bookingId, saved as Partial<ProctoBooking>)
    if (nextStatus === "COMPLETED") {
      toast.success("Visit completed.")
      router.push(practiceTabHref("patients"))
      return true
    }
    toast.success("Visit saved.")
    return true
  }

  async function sendToCustomer() {
    if (!bookingId) return
    const completed = String(booking?.status || "").toUpperCase() === "COMPLETED"
    if (!completed && (formDirty.current || clinicalDirty.current)) {
      const nextMedicines = medicinesToSave()
      medicinesRef.current = nextMedicines
      setMedicines(nextMedicines)
      const saved = await persistVisit(nextMedicines, documentsRef.current)
      if (!saved) return
    }
    setSendCustomerModalOpen(true)
  }

  if (!detailLoaded) {
    return (
      <div className="dashboard-page-wide py-10">
        <p className={error ? "text-sm text-red-600" : "text-sm opacity-70"}>
          {error || "Loading visit…"}
        </p>
        {error ? (
          <div className="mt-4 flex items-center gap-4">
            <button
              type="button"
              className="text-sm font-medium underline"
              onClick={() => {
                setError("")
                setLoadTick((n) => n + 1)
              }}
            >
              Try again
            </button>
            <Link href="/doctor/queue" className="text-sm underline">
              ← Back to queue
            </Link>
          </div>
        ) : null}
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="dashboard-page-wide py-10">
        <p className="text-sm text-red-600">{error || "Visit not found."}</p>
        <Link href="/doctor/queue" className="mt-4 inline-block text-sm underline">
          ← Back to queue
        </Link>
      </div>
    )
  }

  const p = booking.patient
  const patientName = p?.name || booking.patientName || "Patient"
  const phone = formatPhoneDisplay(
    p?.contactNumber || p?.phone || booking.patientPhone,
  )
  const emergencyPhone = formatPhoneDisplay(p?.emergencyNumber)
  const ageLabel = ageFromDob(p?.dateOfBirth, p?.age)
  const dobLabel = blank(p?.dateOfBirth)
    ? formatPracticeDate(p!.dateOfBirth!) || blank(p?.dateOfBirth)
    : ""
  const slotLabel =
    booking.tokenNumber != null
      ? `Token #${booking.tokenNumber}`
      : booking.slotStart
        ? formatPracticeTime(booking.slotStart)
        : "—"
  const appointmentDate = booking.slotStart
    ? formatPracticeDate(booking.slotStart)
    : booking.sessionDate
      ? formatPracticeDate(booking.sessionDate)
      : "—"
  const isCompleted = String(booking.status || "").toUpperCase() === "COMPLETED"
  const appointmentDayIso = booking.slotStart
    ? practiceDateIso(booking.slotStart)
    : booking.sessionDate
      ? practiceDateIso(booking.sessionDate)
      : null
  const todayIso = practiceTodayIso()
  const isHistorical = Boolean(appointmentDayIso && appointmentDayIso < todayIso)
  const chartLocked = isCompleted || isHistorical
  const chiefComplaint = chiefComplaintOf(booking)
  const arrival = formatArrival(booking)
  const arrivalDisplay =
    arrival ||
    (["SCHEDULED", "REQUESTED", "ACCEPTED"].includes(
      String(booking.status || "").toUpperCase(),
    )
      ? "not yet"
      : "—")
  const selfId = getSessionUserId()
  const peerId = booking.patient?.id
  const patientMeta = [
    blank(p?.mrn) ? `MRN ${blank(p?.mrn)}` : "",
    phone !== "—" ? phone : "",
    ageLabel ? `Age ${ageLabel}` : "",
    blank(p?.gender),
    dobLabel ? `DOB ${dobLabel}` : "",
    blank(p?.email),
    emergencyPhone !== "—" ? `Emergency ${emergencyPhone}` : "",
    blank(p?.relationship),
    blank(p?.profession),
    blank(p?.address),
    `Arrival ${arrivalDisplay}`,
  ].filter(Boolean)

  return (
    <div
      ref={visitPageRef}
      className={`dashboard-page-wide !mt-0 space-y-4 [&>*]:shrink-0 ${isCompleted ? "pb-8" : "pb-4"}`}
    >
      {/* Customer identity — scrolls with the visit so the chart stays reachable */}
      <div
        ref={visitHeaderRef}
        className="pb-1.5 pt-0"
      >
        <section
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] dark:shadow-none"
          aria-label={`Patient ${patientName}`}
        >
          <div className="bg-[color-mix(in_srgb,var(--theme-primary)_12%,transparent)] px-3 py-2.5 sm:px-5 sm:py-3 dark:bg-[color-mix(in_srgb,var(--theme-primary)_18%,var(--solune-surface))]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 items-start gap-3">
                <PatientAvatar
                  name={patientName}
                  imgSrc={p?.imgSrc}
                  size="lg"
                />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--theme-primary)] opacity-90 dark:opacity-100">
                    Appointment · {appointmentDate} · {slotLabel}
                  </p>
                  <h1 className="mt-0.5 break-words text-xl font-bold leading-tight tracking-tight text-neutral-900 sm:text-2xl dark:text-white">
                    {patientName}
                  </h1>
                  {patientMeta.length > 0 ? (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-neutral-700 dark:text-slate-300">
                      {patientMeta.map((part, i) => (
                        <Fragment key={`${part}-${i}`}>
                          {i > 0 ? (
                            <span className="opacity-40" aria-hidden>
                              |
                            </span>
                          ) : null}
                          <span
                            className={
                              part.startsWith("Arrival ")
                                ? "font-semibold tabular-nums text-neutral-900 dark:text-white"
                                : undefined
                            }
                          >
                            {part}
                          </span>
                        </Fragment>
                      ))}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${bookingStatusClass(booking.status)}`}
                >
                  {bookingStatusLabel(booking.status)}
                </span>
                {isEmergencyWalkIn(booking) ? <EmergencyWalkInBadge /> : null}
                <PaymentStatusButton
                  bookingId={booking.id}
                  status={booking.paymentStatus}
                  amount={booking.paymentAmount}
                  patientName={booking.patientName}
                  patientPhone={booking.patientPhone}
                  onUpdate={(patch) =>
                    setBooking((prev) => (prev ? { ...prev, ...patch } : prev))
                  }
                />
              </div>
            </div>
          </div>
        </section>

        {isCompleted ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PrescriptionActionsMenu
              bookingId={booking.id}
              enabled
              layout="buttons"
            />
          </div>
        ) : null}
      </div>

      <section className="max-w-full overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-surface)] dark:shadow-none">
        <dl className="grid gap-x-4 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2 lg:grid-cols-3 sm:px-8">
          <Fact label="Doctor" value={blank(booking.provider?.name)} />
          <Fact
            label="Location"
            value={
              booking.location
                ? [booking.location.name, booking.location.city]
                    .filter(Boolean)
                    .join(", ") || ""
                : ""
            }
          />
          <Fact label="Mode" value={booking.mode?.replace(/_/g, " ") || ""} />
          <Fact
            label="Channel"
            value={booking.channel?.replace(/_/g, " ") || ""}
          />
          {booking.tokenNumber != null ? (
            <Fact label="Token" value={`#${booking.tokenNumber}`} />
          ) : null}
          <Fact label="Chief complaint" value={chiefComplaint || "—"} />
          <Fact label="Diagnosis" value={diagnosis || "—"} />
        </dl>
      </section>

      <section className="dashboard-panel !h-auto !min-h-0 !p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Chief complaint
        </h2>
        <p className="mt-1 text-xs opacity-60">
          Enter a new complaint or replace the one saved at booking.
        </p>
        <textarea
          value={complaint}
          onChange={(e) => {
            formDirty.current = true
            setComplaint(e.target.value)
          }}
          readOnly={chartLocked}
          disabled={chartLocked}
          maxLength={500}
          rows={2}
          placeholder="Chief complaint"
          aria-label="Chief complaint"
          className="mt-2 min-h-10 w-full resize-y rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm leading-snug disabled:opacity-80 dark:border-neutral-600"
        />
      </section>

      <section className="dashboard-panel !h-auto !min-h-0 !p-5">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
          Diagnosis
        </h2>
        <p className="mt-1 text-xs opacity-60">
          This is printed on the prescription sent to the patient.
        </p>
        <textarea
          value={diagnosis}
          onChange={(e) => {
            formDirty.current = true
            diagnosisRef.current = e.target.value
            setDiagnosis(e.target.value)
          }}
          readOnly={chartLocked}
          disabled={chartLocked}
          maxLength={500}
          rows={2}
          placeholder="Diagnosis"
          aria-label="Diagnosis"
          className="mt-2 min-h-10 w-full resize-y rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm leading-snug disabled:opacity-80 dark:border-neutral-600"
        />
      </section>

      {isHistorical ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          <Lock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>Historical Entry (Immutable):</strong> This clinical record was scheduled on {appointmentDate} (prior to the current date). In accordance with clinical editing rules, any medication orders or records prior to the current date remain immutable in past medical history to maintain legal compliance, accurate auditing, and a reliable medical trail.
          </span>
        </div>
      ) : null}

      <ClinicalAssessmentPanel
        mastersRaw={booking.practice?.clinicalMasters}
        value={clinicalAssessment}
        versions={clinicalVersions}
        readOnly={chartLocked}
        onChange={(next) => {
          const merged = chartWithDiagnosis(next)
          clinicalDirty.current = true
          clinicalReady.current = true
          clinicalRef.current = merged
          setClinicalAssessment(merged)
        }}
        onSaveAllergies={async (nextAllergies, noKnown) => {
          if (!bookingId) return
          if (isHistorical) {
            toast.error("Historical visit records prior to the current date cannot be modified directly.")
            return
          }
          const res = await proctoService.updatePatientAllergies(bookingId, {
            allergies: nextAllergies,
            noKnownAllergies: noKnown,
          })
          if (res.status === "successful") {
            toast.success("Allergies saved to patient profile & synced across visits")
            clinicalDirty.current = false
            await load("hydrate")
          } else {
            toast.error(res.message || "Failed to save allergies")
          }
        }}
        medicines={
          medicines.length === 0 && chartLocked ? (
            <p className="text-sm opacity-60">No medicines recorded.</p>
          ) : (
            <MedicineEntryTable
              rows={medicines}
              draft={medDraft}
              locked={chartLocked}
              practiceId={booking.practiceId}
              onDraft={(next) => {
                formDirty.current = true
                medDraftRef.current = next
                setMedDraft(next)
              }}
              onAdd={() => addMedicine()}
              onAddMedicines={addMedicinesBulk}
              onRemove={(idx) => removeMedicine(idx)}
              onEdit={(idx, patch, commit) => editMedicine(idx, patch, commit)}
              onToggleFavourite={toggleMedicineFavourite}
            />
          )
        }
        advice={
          <div
            className={`transition-all duration-200 ${
              isAdviceTemplateOpen ? "min-h-[480px] pb-6" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Advice
              </h3>
              <TemplateSelector
                target="advice"
                currentContent={advice}
                practiceId={booking.practiceId}
                specialty={booking.practice?.specialty || "General Medicine"}
                doctorId={booking.provider?.id || undefined}
                disabled={chartLocked}
                onOpenChange={setIsAdviceTemplateOpen}
                onSelect={(templateText) => {
                  clinicalDirty.current = true
                  setAdvice(templateText)
                  adviceRef.current = templateText
                  setTimeout(() => {
                    if (adviceBox.current) {
                      adviceBox.current.style.height = "auto"
                      adviceBox.current.style.height = `${Math.max(80, adviceBox.current.scrollHeight)}px`
                    }
                  }, 0)
                  toast.success("Advice template(s) applied. Text is fully editable.")
                }}
              />
            </div>
            <textarea
              ref={adviceBox}
              value={advice}
              onChange={(e) => {
                clinicalDirty.current = true
                adviceRef.current = e.target.value
                setAdvice(e.target.value)
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${Math.max(80, el.scrollHeight)}px`
              }}
              readOnly={chartLocked}
              disabled={chartLocked}
              maxLength={3000}
              rows={3}
              placeholder="Advice for the patient"
              aria-label="Advice"
              className="mt-1 min-h-[80px] w-full resize-y rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm leading-snug disabled:opacity-80 dark:border-neutral-600"
            />
          </div>
        }
      />

      <section
        className={`dashboard-panel !h-auto !min-h-0 !p-5 !overflow-visible transition-all duration-200 ${
          isNotesTemplateOpen ? "!min-h-[480px] pb-8" : ""
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1.5">
          <div>
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Doctor Notes
            </h2>
            <p className="mt-0.5 text-xs opacity-60">
              Clinical doctor notes for this visit. These are not printed as prescription advice.
            </p>
          </div>
          <TemplateSelector
            target="doctorNotes"
            currentContent={remarks}
            practiceId={booking.practiceId}
            specialty={booking.practice?.specialty || "General Medicine"}
            doctorId={booking.provider?.id || undefined}
            disabled={chartLocked}
            onOpenChange={setIsNotesTemplateOpen}
            onSelect={(templateText) => {
              formDirty.current = true
              setRemarks(templateText)
              setTimeout(() => {
                if (remarksBox.current) {
                  remarksBox.current.style.height = "auto"
                  remarksBox.current.style.height = `${Math.max(160, remarksBox.current.scrollHeight)}px`
                }
              }, 0)
              toast.success("Doctor Notes template(s) applied. Text is fully editable.")
            }}
          />
        </div>
        <textarea
          ref={remarksBox}
          value={remarks}
          onChange={(e) => {
            formDirty.current = true
            setRemarks(e.target.value)
            const el = e.currentTarget
            el.style.height = "auto"
            el.style.height = `${Math.max(160, el.scrollHeight)}px`
          }}
          readOnly={chartLocked}
          disabled={chartLocked}
          rows={6}
          placeholder="Doctor notes..."
          aria-label="Doctor notes"
          className="mt-1 min-h-[160px] w-full resize-y rounded-lg border border-neutral-300 bg-transparent px-3 py-2.5 text-sm leading-relaxed disabled:opacity-80 dark:border-neutral-600"
        />
      </section>

      <section className="dashboard-panel !h-auto !min-h-0 !p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
              Documents
            </h2>
            {docTab === "appointment" ? (
              <span className="text-xs opacity-50">
                {documents.length}/{MAX_BOOKING_DOCUMENTS}
              </span>
            ) : null}
          </div>

          <div
            role="tablist"
            aria-label="Document type"
            className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-neutral-200 p-1 dark:border-neutral-700"
          >
            {(
              [
                ["appointment", "Appointment", documents.length],
                ["general", "General", generalDocs.length],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={docTab === id}
                onClick={() => setDocTab(id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  docTab === id
                    ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                    : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs opacity-60">
            {docTab === "appointment"
              ? "Files for this visit only."
              : "Patient's health record (lab reports, ID, insurance) — not tied to a visit."}
          </p>

          {docTab === "general" ? (
            <GeneralDocumentsTab
              docs={generalDocs}
              linked={generalLinked}
              uploading={uploading}
              onUpload={(e) => void onUploadGeneral(e)}
            />
          ) : (
          <>
          {!chartLocked ? (
            <label
              className={`mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-6 text-center dark:border-blue-500/40 dark:bg-blue-950/20 ${
                uploading || documents.length >= MAX_BOOKING_DOCUMENTS
                  ? "pointer-events-none opacity-50"
                  : "hover:border-blue-500"
              }`}
            >
              <span className="text-sm font-semibold text-blue-700 dark:text-sky-300">
                {uploading
                  ? "Uploading…"
                  : documents.length >= MAX_BOOKING_DOCUMENTS
                    ? "Limit reached"
                    : "Upload image or PDF"}
              </span>
              <span className="text-xs opacity-70">JPG, PNG, WEBP, PDF · max 10 MB</span>
              <input
                type="file"
                className="hidden"
                accept={BOOKING_DOCUMENT_ACCEPT}
                disabled={
                  uploading || documents.length >= MAX_BOOKING_DOCUMENTS
                }
                onChange={(e) => void onUpload(e)}
              />
            </label>
          ) : null}

          {uploading ? (
            <div className="mt-3">
              <ThinkingLoader label="Uploading document" />
            </div>
          ) : null}

          {documents.length === 0 ? (
            <p className="mt-4 text-sm opacity-60">
              {isCompleted ? "No documents attached." : "No documents yet."}
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {documents.map((d, idx) => (
                <li
                  key={`${d.url}-${idx}`}
                  className="flex items-center gap-2 rounded-xl border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                >
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
                      <Icon name="written-page" className="size-4" />
                    </span>
                    <span className="truncate text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-sky-400">
                      {d.name || "View document"}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          </>
          )}
      </section>

      {/* Chat — single panel, no nested card / clipped height */}
      {selfId && peerId ? (
        <CareChatPanel
          className="min-h-[20rem]"
          selfUserId={selfId}
          peerUserId={peerId}
          peerName={patientName}
          subtitle="Patient WhatsApp replies also appear here. Attached documents are sent on WhatsApp and saved to this visit."
          bookingId={bookingId}
          threadSince={booking?.createdAt ?? booking?.created_at ?? null}
          onDocumentShared={() => void load("refresh")}
        />
      ) : (
        <section className="dashboard-panel !p-5">
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">
            Chat
          </h2>
          <p className="mt-2 text-sm opacity-60">
            Chat is available when this visit is linked to a registered patient
            account.
          </p>
        </section>
      )}

      {/* Sticky actions — in page flow, not a portal that fights layouts */}
      {!chartLocked ? (
        <div className="sticky bottom-0 z-30 -mx-2 border-t border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur-md dark:border-[var(--solune-border-strong)] dark:bg-[color-mix(in_srgb,var(--solune-surface)_92%,transparent)]">
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="hidden text-sm text-neutral-600 sm:block dark:text-slate-300">
              <span className="font-medium text-neutral-900 dark:text-white">
                {patientName}
              </span>
              {" · "}
              {slotLabel}
            </p>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleNavigateBack}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-50 dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-elevated)] dark:text-slate-100 dark:hover:bg-[var(--solune-surface-muted)] cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 disabled:opacity-50 dark:border-[var(--solune-border-strong)] dark:bg-[var(--solune-elevated)] dark:text-slate-100 dark:hover:bg-[var(--solune-surface-muted)]"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving || sendingWa}
                onClick={() => void sendToCustomer()}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {sendingWa ? "Sending…" : "Send to customer"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save("COMPLETED")}
                className="rounded-xl border border-green-500/60 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 disabled:opacity-50 dark:border-green-400/30 dark:bg-[color-mix(in_srgb,theme(colors.green.500)_18%,var(--solune-surface))] dark:text-green-200"
              >
                {saving ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="size-4">
                      <Icon
                        name="spinning-loader"
                        className="fill-green-800 dark:fill-green-200"
                      />
                    </span>
                    Saving…
                  </span>
                ) : (
                  "Finish appointment"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Unsaved Changes Confirmation Modal */}
      <PopupModal
        open={showUnsavedModal}
        handler={() => {
          setShowUnsavedModal(false)
          setPendingNav(null)
        }}
        title="Unsaved Changes"
        direction="center"
        className="!max-w-md"
      >
        <div className="space-y-4 p-1">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
              <span className="text-lg">⚠️</span>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-white">
                You have unsaved data
              </p>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">
                You have unsaved changes in this appointment. Do you want to save them before leaving?
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setShowUnsavedModal(false)
                setPendingNav(null)
              }}
              className="rounded-lg border border-neutral-300 px-3.5 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleDiscardAndLeave}
              className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50 transition-colors cursor-pointer"
            >
              Discard &amp; Leave
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveAndLeave}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 active:scale-95 transition-all cursor-pointer"
            >
              {saving ? "Saving…" : "Save & Continue"}
            </button>
          </div>
        </div>
      </PopupModal>

      <SendToCustomerModal
        open={sendCustomerModalOpen}
        bookingId={bookingId}
        patientName={booking?.patientName}
        patientPhone={booking?.patientPhone}
        onClose={() => setSendCustomerModalOpen(false)}
        beforeSend={async () => {
          const completed = String(booking?.status || "").toUpperCase() === "COMPLETED"
          if (!completed && (formDirty.current || clinicalDirty.current)) {
            const nextMedicines = medicinesToSave()
            medicinesRef.current = nextMedicines
            setMedicines(nextMedicines)
            const saved = await persistVisit(nextMedicines, documentsRef.current)
            return Boolean(saved)
          }
          return true
        }}
      />
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  const v = value?.trim()
  if (!v) return null
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 break-words font-medium text-neutral-900 dark:text-slate-100">
        {v}
      </dd>
    </div>
  )
}
