"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BookOpen, FileText, Pill, Stethoscope } from "lucide-react"
import DashboardPageHeader from "@/components/dashboard/DashboardPageHeader"
import MasterTemplatesManagement from "./MasterTemplatesManagement"
import ClinicalMastersPanel from "./ClinicalMastersPanel"
import MedicineManagementPage from "./MedicineManagementPage"
import { proctoService } from "@/lib/services/procto"

export type MasterTab = "templates" | "clinical" | "medicines"

type Props = {
  portal: "doctor" | "clinic"
}

export default function MasterPageContent({ portal }: Props) {
  return (
    <Suspense
      fallback={
        <div className="dashboard-page-wide p-6 text-sm opacity-70">
          Loading Master repository…
        </div>
      }
    >
      <MasterPageInner portal={portal} />
    </Suspense>
  )
}

function MasterPageInner({ portal }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") as MasterTab | null
  const [tab, setTab] = useState<MasterTab>(tabParam || "templates")

  // Practice details for ClinicalMastersPanel
  const [practiceId, setPracticeId] = useState<string | null>(null)
  const [clinicalMasters, setClinicalMasters] = useState<unknown>(null)
  const [loadingPractice, setLoadingPractice] = useState(true)

  useEffect(() => {
    if (tabParam === "templates" || tabParam === "clinical" || tabParam === "medicines") {
      setTab(tabParam)
    }
  }, [tabParam])

  useEffect(() => {
    let active = true
    proctoService
      .getMyPractices()
      .then((res) => {
        if (!active) return
        if (res.status === "successful" && Array.isArray(res.data) && res.data.length > 0) {
          const first = res.data[0]
          const pid = proctoService.resolvePracticeId(first)
          setPracticeId(pid || null)
          setClinicalMasters(first.clinicalMasters ?? null)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoadingPractice(false)
      })

    return () => {
      active = false
    }
  }, [])

  function selectTab(next: MasterTab) {
    setTab(next)
    const base = portal === "clinic" ? "/clinic/master" : "/doctor/master"
    router.replace(`${base}?tab=${next}`, { scroll: false })
  }

  const tabs: Array<{
    id: MasterTab
    label: string
    description: string
    icon: typeof FileText
  }> = [
    {
      id: "templates",
      label: "Clinical Templates",
      description: "Advice & Doctor Notes templates with add/edit",
      icon: FileText,
    },
    {
      id: "clinical",
      label: "Vitals & Allergies",
      description: "Vital bands, custom allergies, and pain scales",
      icon: Stethoscope,
    },
    {
      id: "medicines",
      label: "Medicine Master",
      description: "Central medicine inventory and custom drugs",
      icon: Pill,
    },
  ]

  return (
    <div className="w-full space-y-6 pb-12 sm:space-y-7">
      <DashboardPageHeader
        eyebrow="Clinical Management"
        title="Master"
        subtitle="Manage master clinical templates, advice presets, notes, vitals, allergies, and drug databases."
      />

      {/* Top Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-800">
        {tabs.map((t) => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 dark:bg-blue-600"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              <Icon className="size-4" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* Tab Panels */}
      {tab === "templates" ? (
        <div className="w-full">
          <MasterTemplatesManagement />
        </div>
      ) : tab === "clinical" ? (
        <div className="dashboard-panel w-full">
          <div className="mb-4">
            <h2 className="dashboard-section-title text-lg">Clinical Masters</h2>
            <p className="dashboard-section-sub">
              Define standard vital signs reference ranges, critical alerts, custom allergy
              catalogues, and pain assessment scales.
            </p>
          </div>
          {loadingPractice ? (
            <p className="py-8 text-sm text-neutral-500">Loading clinical masters…</p>
          ) : practiceId ? (
            <ClinicalMastersPanel
              practiceId={practiceId}
              clinicalMasters={clinicalMasters}
              onSaved={(updated) => setClinicalMasters(updated)}
            />
          ) : (
            <p className="py-8 text-sm text-neutral-500">
              No active practice found. Please create or link a practice to manage clinical masters.
            </p>
          )}
        </div>
      ) : tab === "medicines" ? (
        <div className="w-full">
          <MedicineManagementPage portal={portal} />
        </div>
      ) : null}
    </div>
  )
}

