"use client"

import { useEffect, useRef, useState } from "react"
import {
  proctoService,
  type DeskPatient,
  type DeskPatientRegistration,
} from "@/lib/services/procto"
import { practiceTodayIso } from "@/lib/practiceTime"

type Props = {
  practiceId: string
  value: DeskPatient | null
  onChange: (patient: DeskPatient | null) => void
  autoFocus?: boolean
}

const GENDERS: Array<[DeskPatientRegistration["gender"], string]> = [
  ["male", "Male"],
  ["female", "Female"],
  ["others", "Other"],
]
const RELATIONSHIPS = ["Spouse", "Child", "Parent", "Sibling", "Other"]

export const deskFieldClass =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[var(--theme-primary)] focus:shadow-[0_0_0_4px_color-mix(in_srgb,var(--theme-primary)_16%,transparent)] dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:placeholder:text-slate-500"
export const deskLabelClass =
  "text-xs font-semibold text-slate-600 dark:text-slate-300"
const fieldClass = deskFieldClass
const labelClass = deskLabelClass

function genderLabel(g: string | null) {
  if (!g) return null
  return g === "male" ? "Male" : g === "female" ? "Female" : "Other"
}

function patientMeta(p: DeskPatient) {
  return [
    p.age != null ? `${p.age} y` : null,
    genderLabel(p.gender),
    p.phone,
    p.relationship,
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Front-desk patient step: find an existing patient (mobile, name or MRN) or register a new one
 * with the mandatory fields, so every visit is tied to a Patient ID (MRN).
 */
export default function DeskPatientPicker({
  practiceId,
  value,
  onChange,
  autoFocus,
}: Props) {
  const [mode, setMode] = useState<"search" | "register">("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<DeskPatient[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState("")
  const [searchError, setSearchError] = useState("")

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [gender, setGender] = useState<DeskPatientRegistration["gender"] | "">(
    "",
  )
  const [dob, setDob] = useState("")
  const [relationship, setRelationship] = useState("")
  const [email, setEmail] = useState("")
  const [needsRelationship, setNeedsRelationship] = useState(false)
  const [saving, setSaving] = useState(false)
  const [registerError, setRegisterError] = useState("")
  const searchRef = useRef<HTMLInputElement>(null)
  const relationRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    const q = query.trim()
    const digits = q.replace(/\D/g, "")
    const long = /^[+\d\s()-]+$/.test(q)
      ? digits.length >= 4
      : q.replace(/\s/g, "").length >= 2
    if (!practiceId || !long) {
      setResults([])
      setSearched("")
      setSearching(false)
      return
    }
    let alive = true
    setSearching(true)
    const t = window.setTimeout(() => {
      void proctoService.searchDeskPatients(practiceId, q).then((res) => {
        if (!alive) return
        setSearching(false)
        setSearched(q)
        if (res.status === "successful" && res.data) {
          setResults(res.data.patients)
          setSearchError("")
        } else {
          setResults([])
          setSearchError(res.message || "Could not search patients.")
        }
      })
    }, 300)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [query, practiceId])

  function startRegister() {
    const q = query.trim()
    const digits = q.replace(/\D/g, "")
    if (/^[+\d\s()-]+$/.test(q) && digits.length >= 10) {
      setPhone(digits.slice(-10))
    } else if (q && !/\d/.test(q)) {
      setName(q)
    }
    setRegisterError("")
    setMode("register")
  }

  async function register() {
    if (name.trim().replace(/[^\p{L}]/gu, "").length < 2)
      return setRegisterError("Enter the patient's full name.")
    const digits = phone.replace(/\D/g, "")
    if (digits.length < 10 || digits.length > 15)
      return setRegisterError("Enter a valid mobile number (10 digits).")
    if (!gender) return setRegisterError("Pick the patient's gender.")
    if (!dob) return setRegisterError("Enter the date of birth.")
    if (dob > practiceTodayIso())
      return setRegisterError("Date of birth can't be in the future.")
    setSaving(true)
    setRegisterError("")
    const res = await proctoService.registerDeskPatient(practiceId, {
      name: name.trim(),
      phone: digits,
      gender,
      dateOfBirth: dob,
      ...(email.trim() ? { email: email.trim() } : {}),
      ...(relationship ? { relationship } : {}),
    })
    setSaving(false)
    if (res.status === "successful" && res.data) {
      onChange(res.data)
      setMode("search")
      setQuery("")
      return
    }
    const msg = res.message || "Could not register the patient."
    setRegisterError(msg)
    if (/choose how this patient is related/i.test(msg)) {
      setNeedsRelationship(true)
      window.setTimeout(() => relationRef.current?.focus(), 0)
    }
  }

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <Avatar name={value.name} tone="emerald" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-900 dark:text-white">
            {value.name}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
            <span className="rounded-md bg-emerald-600 px-1.5 py-px font-mono text-[11px] font-bold text-white">
              {value.mrn ?? "No MRN"}
            </span>
            {patientMeta(value)}
          </p>
          {value.existingPatient ? (
            <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Already registered on GlucoGuide — added to your clinic&apos;s
              patients with their existing MRN
            </p>
          ) : !value.knownHere ? (
            <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              First visit at this clinic
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            window.setTimeout(() => searchRef.current?.focus(), 0)
          }}
          className="shrink-0 rounded-full border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-800 dark:bg-transparent dark:text-emerald-200 dark:hover:bg-emerald-900/40"
        >
          Change
        </button>
      </div>
    )
  }

  if (mode === "register") {
    return (
      <div
        className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-700 dark:bg-slate-800/40"
        role="group"
        aria-label="Register new patient"
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.target as HTMLElement).tagName === "INPUT"
          ) {
            e.preventDefault()
            void register()
          }
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">
              Register new patient
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fields marked * are required
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMode("search")}
            className="text-xs font-semibold text-[var(--theme-primary)] hover:underline"
          >
            ← Back to search
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>Full name *</span>
            <input
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="As on ID"
              autoComplete="off"
              autoFocus
            />
          </label>
          <label className="block">
            <span className={labelClass}>Mobile *</span>
            <input
              className={fieldClass}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                setNeedsRelationship(false)
              }}
              placeholder="10-digit mobile"
              inputMode="tel"
              autoComplete="off"
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <span className={labelClass}>Gender *</span>
            <div
              className="mt-1.5 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800/80"
              role="radiogroup"
              aria-label="Gender"
            >
              {GENDERS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={gender === v}
                  onClick={() => setGender(v)}
                  className={`rounded-lg py-1.5 text-sm font-semibold transition ${
                    gender === v
                      ? "bg-[var(--theme-primary)] text-white shadow-sm"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className={labelClass}>Date of birth *</span>
            <input
              type="date"
              className={`${fieldClass} py-2`}
              value={dob}
              max={practiceTodayIso()}
              onChange={(e) => setDob(e.target.value)}
            />
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelClass}>
              Relationship{" "}
              <span className="font-normal text-slate-400">
                — if a family member&apos;s mobile
              </span>
            </span>
            <select
              ref={relationRef}
              className={`${fieldClass} ${needsRelationship ? "!border-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.2)]" : ""}`}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            >
              <option value="">Patient&apos;s own number</option>
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r} of the number&apos;s owner
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>
              Email <span className="font-normal text-slate-400">— optional</span>
            </span>
            <input
              type="email"
              className={fieldClass}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        {registerError ? (
          <p
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
            role="alert"
          >
            {registerError}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            New patients get an MRN with your clinic prefix; patients already
            on GlucoGuide keep theirs and are added to your clinic.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void register()}
            className="h-10 shrink-0 rounded-full bg-[var(--theme-primary)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? "Registering…" : "Register & select"}
          </button>
        </div>
      </div>
    )
  }

  const q = query.trim()
  return (
    <div className="space-y-2.5">
      <div className="relative">
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          ref={searchRef}
          className={`${fieldClass} !mt-0 pl-10`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by mobile, name or MRN"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Search patient"
        />
        {searching ? (
          <span className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-[var(--theme-primary)]" />
        ) : null}
      </div>
      {searchError ? (
        <p className="text-xs text-red-700 dark:text-red-400">{searchError}</p>
      ) : results.length ? (
        <ul
          className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:divide-slate-800 dark:border-slate-700 dark:bg-slate-800/60"
          aria-label="Matching patients"
        >
          {results.map((p) => (
            <li key={p.patientId}>
              <button
                type="button"
                onClick={() => onChange(p)}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-700/60"
              >
                <Avatar name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-slate-900 dark:text-white">
                      {p.name}
                    </span>
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-px font-mono text-[11px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {p.mrn ?? "—"}
                    </span>
                  </span>
                  <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                    {patientMeta(p)}
                    {p.knownHere ? "" : " · new to this clinic"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : searched && searched === q && !searching ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          No patient found for “{q}”.
          {/\d/.test(q) && q.replace(/\D/g, "").length < 10
            ? " Try the full 10-digit mobile, or register them below."
            : " Register them below."}
        </p>
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Type at least 4 digits of the mobile, 2 letters of the name, or the
          MRN.
        </p>
      )}
      <button
        type="button"
        onClick={startRegister}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-[var(--theme-primary)] hover:bg-[color-mix(in_srgb,var(--theme-primary)_6%,transparent)] hover:text-[var(--theme-primary)] dark:border-slate-600 dark:text-slate-200"
      >
        <span className="text-base leading-none">+</span> Register new patient
      </button>
    </div>
  )
}

function Avatar({
  name,
  tone = "slate",
}: {
  name: string
  tone?: "slate" | "emerald"
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?"
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        tone === "emerald"
          ? "bg-emerald-600 text-white"
          : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-200"
      }`}
      aria-hidden
    >
      {initials}
    </span>
  )
}
