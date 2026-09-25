"use client"

import { useEffect, useMemo, useState, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import PublicShell from "@/components/layout/PublicShell"
import BookAppointmentLink from "@/components/ui/procto/BookAppointmentLink"
import { StarRating } from "@/components/ui/procto/PracticeReviewForm"
import { proctoService, getPracticeProviders } from "@/lib/services/procto"
import {
  applyPracticesRecovery,
  practicesEmptyActions,
  practicesEmptyHint,
  practicesFieldClearAction,
  type PracticesRecoveryAction,
} from "@/lib/practicesEmptyState"

type Practice = {
  id: string
  name: string
  slug: string
  type: string
  specialty: string | null
  consultationFee: number | null
  featured?: boolean
  planName?: string | null
  nextAvailableHint?: string | null
  reviewSummary?: { average: number | null; count: number }
  locations: { id: string; name: string; city: string; address: string }[]
  members?: {
    role: string
    user: { id: string; name: string | null }
  }[]
}

const SPECIALTIES = [
  "All",
  "Dermatologist",
  "Gynecologist",
  "Orthopedist",
  "General Physician",
  "Pediatrician",
  "Dentist",
  "Cardiologist",
  "ENT",
  "Multi-specialty",
] as const

const CITIES = [
  "All cities",
  "Mumbai",
  "Bangalore",
  "Delhi",
  "Dhanmondi",
  "Gulshan",
  "Mirpur",
  "Uttara",
] as const

type SortKey = "relevance" | "fee-asc" | "fee-desc" | "name"

function initials(name: string) {
  const parts = name.replace(/^Dr\.?\s*/i, "").trim().split(/\s+/)
  const a = parts[0]?.[0] ?? "D"
  const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "R"
  return `${a}${b}`.toUpperCase()
}

function avatarTone(seed: string) {
  const tones = [
    "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
    "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash + seed.charCodeAt(i)) % tones.length
  return tones[hash]!
}

function displayDoctorName(practice: Practice) {
  const doctors = getPracticeProviders(practice.members ?? [])
  const primary = doctors[0]?.name
  if (practice.type === "SOLO" && primary) {
    return primary.startsWith("Dr") ? primary : `Dr. ${primary}`
  }
  return practice.name
}

function displaySubtitle(practice: Practice) {
  const doctors = getPracticeProviders(practice.members ?? [])
  if (practice.type !== "SOLO" && doctors.length > 0) {
    return doctors
      .slice(0, 3)
      .map((d) => {
        const n = d.name ?? "Provider"
        return n.startsWith("Dr") ? n : `Dr. ${n}`
      })
      .join(" · ")
  }
  return null
}

export default function PracticesPage() {
  return (
    <Suspense
      fallback={
        <PublicShell active="find">
          <div className="mx-auto w-full max-w-5xl py-12 text-sm text-neutral-500">
            Loading doctors & clinics…
          </div>
        </PublicShell>
      }
    >
      <PracticesPageContent />
    </Suspense>
  )
}

function PracticesPageContent() {
  const searchParams = useSearchParams()
  const [practices, setPractices] = useState<Practice[]>([])
  const [q, setQ] = useState("")
  const [city, setCity] = useState("")
  const [specialty, setSpecialty] = useState<string>("All")
  const [sort, setSort] = useState<SortKey>("relevance")
  const [feeMax, setFeeMax] = useState<"" | "500" | "1000" | "2000">("")
  const [loading, setLoading] = useState(true)
  const viewParam = searchParams.get("view")
  const [view, setView] = useState<"all" | "clinic" | "solo">(() => {
    if (viewParam === "doctors" || viewParam === "solo") return "solo"
    if (viewParam === "clinics" || viewParam === "clinic") return "clinic"
    return "all"
  })

  useEffect(() => {
    if (viewParam === "doctors" || viewParam === "solo") setView("solo")
    else if (viewParam === "clinics" || viewParam === "clinic") setView("clinic")
  }, [viewParam])

  useEffect(() => {
    setLoading(true)
    const specialtyParam =
      specialty !== "All" ? specialty : undefined
    proctoService
      .listPractices({
        q: q || undefined,
        city: city || undefined,
        specialty: specialtyParam,
      })
      .then((res) => {
        if (res.status === "successful") setPractices(res.data as Practice[])
        else setPractices([])
        setLoading(false)
      })
  }, [q, city, specialty])

  const emptyActions = useMemo(
    () =>
      practicesEmptyActions({
        q,
        city,
        specialty,
        view,
        feeMax,
      }),
    [q, city, specialty, view, feeMax],
  )

  function recover(action: PracticesRecoveryAction) {
    const next = applyPracticesRecovery(action, { q, city })
    setQ(next.q)
    setCity(next.city)
    if (action === "browse-all") {
      setSpecialty("All")
      setView("all")
      setFeeMax("")
      setSort("relevance")
    }
  }

  function clearToolbarFilters() {
    setFeeMax("")
    setView("all")
    setSpecialty("All")
  }

  const filtered = useMemo(() => {
    let list = [...practices]
    if (view === "clinic") {
      list = list.filter((p) => p.type === "CLINIC" || p.type === "CENTER")
    } else if (view === "solo") {
      list = list.filter((p) => p.type === "SOLO")
    }
    if (feeMax) {
      const cap = Number(feeMax)
      list = list.filter(
        (p) => p.consultationFee != null && p.consultationFee <= cap,
      )
    }

    if (sort === "fee-asc") {
      list.sort(
        (a, b) => (a.consultationFee ?? 99999) - (b.consultationFee ?? 99999),
      )
    } else if (sort === "fee-desc") {
      list.sort(
        (a, b) => (b.consultationFee ?? 0) - (a.consultationFee ?? 0),
      )
    } else if (sort === "name") {
      list.sort((a, b) =>
        displayDoctorName(a).localeCompare(displayDoctorName(b)),
      )
    }
    return list
  }, [practices, view, sort, feeMax])

  const emptyHint = useMemo(
    () => practicesEmptyHint({ q, city, specialty, view, feeMax }),
    [q, city, specialty, view, feeMax],
  )

  const resultLabel = city
    ? `${filtered.length} ${filtered.length === 1 ? "result" : "results"} in ${city}`
    : `${filtered.length} ${filtered.length === 1 ? "result" : "results"}`

  return (
    <PublicShell active="find">
      <div className="mx-auto w-full min-w-0 max-w-5xl">
        {/* Page intro */}
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">
            Find doctors & clinics
          </p>
          <h1 className="mt-2 text-[clamp(1.75rem,6vw,2.5rem)] font-bold tracking-tight text-slate-900 dark:text-white">
            {city ? `Doctors near ${city}` : "Book appointments near you"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
            Search by specialty, doctor, or clinic — then book a slot or token
            in minutes.
          </p>
        </div>

        {/* Practo-style dual search */}
        <div className="sticky top-20 z-20 mt-6 sm:top-24">
          <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:rounded-full dark:border-white/10 dark:bg-[var(--solune-surface)] dark:shadow-none">
            <div className="flex flex-col sm:flex-row sm:items-stretch">
              <label className="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 border-b border-slate-200/80 px-4 py-3 sm:max-w-[240px] sm:border-b-0 sm:border-r sm:border-slate-200/80 sm:px-5 sm:pl-6 dark:border-white/10">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-300">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z" />
                    <circle cx="12" cy="10" r="2.5" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Location
                  </span>
                  <input
                    type="search"
                    list="practice-cities"
                    placeholder="City or area"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    autoComplete="address-level2"
                    className="gg-bare-input w-full min-w-0 text-sm font-semibold placeholder:font-medium"
                    data-testid="practices-city"
                  />
                  <datalist id="practice-cities">
                    {CITIES.filter((c) => c !== "All cities").map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </label>

              <label className="flex min-h-[3.75rem] min-w-0 flex-[1.6] items-center gap-3 px-4 py-3 sm:px-5 sm:pr-6">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    Search
                  </span>
                  <input
                    type="search"
                    placeholder="Specialty, doctor or clinic"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    autoComplete="off"
                    className="gg-bare-input w-full min-w-0 text-sm font-semibold placeholder:font-medium"
                    data-testid="practices-search"
                  />
                </div>
                {q || city ? (
                  <button
                    type="button"
                    onClick={() =>
                      recover(
                        practicesFieldClearAction({ q, city, specialty, view, feeMax }),
                      )
                    }
                    className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                    data-testid="practices-clear-search-field"
                  >
                    Clear
                  </button>
                ) : null}
              </label>
            </div>
          </div>
        </div>

        {/* Specialty chips */}
        <div className="mt-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
          {SPECIALTIES.map((s) => {
            const active = specialty === s
            return (
              <button
                key={s}
                type="button"
                onClick={() => setSpecialty(s)}
                className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition sm:text-sm ${
                  active
                    ? "bg-blue-600 text-white shadow-sm shadow-blue-600/25"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-white/10 dark:bg-[var(--solune-surface)] dark:text-slate-300 dark:hover:border-white/20"
                }`}
              >
                {s}
              </button>
            )
          })}
        </div>

        {/* Results toolbar */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {loading ? "Searching…" : resultLabel}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {specialty !== "All" ? specialty : "All specialties"}
              {city ? ` · ${city}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 dark:border-white/10 dark:bg-[var(--solune-surface)]">
              {(
                [
                  ["all", "All"],
                  ["solo", "Doctors"],
                  ["clinic", "Clinics"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    view === id
                      ? "bg-blue-600 text-white"
                      : "bg-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-[var(--solune-surface)]">
              <span className="shrink-0 text-slate-400 dark:text-slate-500">Fee</span>
              <select
                value={feeMax}
                onChange={(e) =>
                  setFeeMax(e.target.value as "" | "500" | "1000" | "2000")
                }
                className="gg-bare-select max-w-[7.5rem] text-xs"
                aria-label="Maximum consultation fee"
              >
                <option value="">Any</option>
                <option value="500">≤ ₹500</option>
                <option value="1000">≤ ₹1,000</option>
                <option value="2000">≤ ₹2,000</option>
              </select>
            </label>

            <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-[var(--solune-surface)]">
              <span className="shrink-0 text-slate-400 dark:text-slate-500">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="gg-bare-select max-w-[11rem] text-xs"
                aria-label="Sort results"
              >
                <option value="relevance">Relevance</option>
                <option value="fee-asc">Fee: low to high</option>
                <option value="fee-desc">Fee: high to low</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
        </div>

        {/* Loading skeletons */}
        {loading ? (
          <ul className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <li
                key={i}
                className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-[var(--solune-surface-muted)]"
              />
            ))}
          </ul>
        ) : null}

        {/* Empty */}
        {!loading && filtered.length === 0 ? (
          <div
            className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-white/15 dark:bg-[var(--solune-surface)]"
            data-testid="practices-empty"
          >
            <p className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
              No practices found
              {city ? ` in ${city}` : ""}
              {q.trim() ? ` for “${q.trim()}”` : ""}
              {specialty !== "All" ? ` · ${specialty}` : ""}.
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              {emptyHint}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {emptyActions.showClearSearch ? (
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    emptyActions.primaryAction === "clear-search"
                      ? "bg-blue-600 text-white"
                      : "border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                  }`}
                  onClick={() => recover("clear-search")}
                  data-testid="practices-empty-clear-search"
                >
                  Clear search
                </button>
              ) : null}
              {emptyActions.showClearArea ? (
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    emptyActions.primaryAction === "clear-area"
                      ? "bg-blue-600 text-white"
                      : "border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                  }`}
                  onClick={() => recover("clear-area")}
                  data-testid="practices-empty-clear-area"
                >
                  Clear area
                </button>
              ) : null}
              {emptyActions.showClearToolbar ? (
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    emptyActions.primaryAction === "browse-all"
                      ? "bg-blue-600 text-white"
                      : "border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                  }`}
                  onClick={clearToolbarFilters}
                  data-testid="practices-empty-clear-filters"
                >
                  Clear filters
                </button>
              ) : null}
              {emptyActions.showBrowseAll ? (
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-xs font-semibold ${
                    emptyActions.primaryAction === "browse-all"
                      ? "bg-blue-600 text-white"
                      : "border border-neutral-300 text-neutral-700 dark:border-neutral-600 dark:text-neutral-200"
                  }`}
                  onClick={() => recover("browse-all")}
                  data-testid="practices-empty-browse-all"
                >
                  Browse all
                </button>
              ) : null}
            </div>
            <p className="mt-4 text-xs text-neutral-500">
              <Link href="/doctor/onboard" className="text-blue-600 hover:underline">
                Providers can onboard here
              </Link>
            </p>
          </div>
        ) : null}

        {/* Result cards — Practo-like */}
        {!loading && filtered.length > 0 ? (
          <ul className="mt-5 space-y-3 pb-8">
            {filtered.map((p) => {
              const doctors = getPracticeProviders(p.members ?? [])
              const title = displayDoctorName(p)
              const subtitle = displaySubtitle(p)
              const loc = p.locations[0]
              const isClinic = p.type === "CLINIC" || p.type === "CENTER"

              return (
                <li
                  key={p.id}
                  className="dashboard-panel overflow-hidden transition hover:border-blue-300 hover:shadow-lg hover:shadow-blue-600/10 dark:hover:border-blue-600/35"
                >
                  <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-stretch sm:gap-5 sm:p-5">
                    {/* Avatar */}
                    <div
                      className={`mx-auto flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-bold sm:mx-0 sm:size-[72px] sm:text-xl ${avatarTone(title)}`}
                      aria-hidden
                    >
                      {initials(title)}
                    </div>

                    {/* Main info */}
                    <div className="min-w-0 flex-1 text-center sm:text-left">
                      <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                        <h2 className="break-words text-lg font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-xl">
                          {title}
                        </h2>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500 dark:bg-white/10 dark:text-neutral-400">
                          {isClinic ? "Clinic" : "Doctor"}
                        </span>
                        {p.featured ? (
                          <span className="rounded-full bg-blue-600/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-blue-600">
                            Featured
                            {p.planName ? ` · ${p.planName}` : ""}
                          </span>
                        ) : null}
                        {p.nextAvailableHint ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {p.nextAvailableHint}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-1 text-sm font-medium text-blue-600">
                        {p.specialty ?? "General Physician"}
                        {isClinic ? ` · ${p.type.replace(/_/g, " ")}` : ""}
                      </p>

                      {p.reviewSummary && p.reviewSummary.count > 0 ? (
                        <p className="mt-1">
                          <StarRating
                            average={p.reviewSummary.average}
                            count={p.reviewSummary.count}
                          />
                        </p>
                      ) : null}

                      {subtitle ? (
                        <p className="mt-1 break-words text-sm text-neutral-600 dark:text-neutral-300">
                          {subtitle}
                          {doctors.length > 3 ? ` +${doctors.length - 3} more` : ""}
                        </p>
                      ) : isClinic ? null : (
                        <p className="mt-1 text-sm text-neutral-500">
                          {p.name}
                        </p>
                      )}

                      {loc ? (
                        <p className="mt-2 flex items-start justify-center gap-1.5 text-xs text-neutral-500 sm:justify-start sm:text-sm">
                          <svg
                            viewBox="0 0 24 24"
                            className="mt-0.5 size-3.5 shrink-0 text-neutral-400"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden
                          >
                            <path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11Z" />
                            <circle cx="12" cy="10" r="2.5" />
                          </svg>
                          <span className="min-w-0 break-words">
                            {loc.name}
                            {loc.address ? `, ${loc.address}` : ""} ·{" "}
                            <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                              {loc.city}
                            </span>
                          </span>
                        </p>
                      ) : null}

                      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
                        {p.consultationFee != null ? (
                          <p className="text-sm text-neutral-700 dark:text-neutral-200">
                            <span className="font-semibold text-neutral-900 dark:text-white">
                              ₹{p.consultationFee}
                            </span>{" "}
                            <span className="text-neutral-500">
                              Consultation fee
                            </span>
                          </p>
                        ) : (
                          <p className="text-sm text-neutral-500">
                            Fee on request
                          </p>
                        )}
                        <span className="hidden h-1 w-1 rounded-full bg-neutral-300 sm:inline-block" />
                        <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          Available for booking
                        </p>
                      </div>
                    </div>

                    {/* CTAs */}
                    <div className="flex shrink-0 flex-col items-stretch justify-center gap-2 sm:w-[168px]">
                      <BookAppointmentLink
                        slug={p.slug}
                        className="inline-flex h-11 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-[#0088e6]"
                      >
                        Book Clinic Visit
                      </BookAppointmentLink>
                      <BookAppointmentLink
                        slug={p.slug}
                        className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:border-white/20 dark:hover:bg-white/5"
                      >
                        View Profile
                      </BookAppointmentLink>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}
      </div>
    </PublicShell>
  )
}
