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

const fieldClass =
  "mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-900"

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
      <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/40">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-bold text-neutral-900 dark:text-white">
              {value.name}
            </p>
            <p className="text-xs text-neutral-700 dark:text-neutral-300">
              <span className="mr-1 rounded bg-emerald-600 px-1.5 py-px font-mono text-[11px] font-bold text-white">
                {value.mrn ?? "No MRN"}
              </span>
              {patientMeta(value)}
            </p>
            {!value.knownHere ? (
              <p className="mt-0.5 text-xs text-emerald-800 dark:text-emerald-200">
                First visit at this clinic.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null)
              window.setTimeout(() => searchRef.current?.focus(), 0)
            }}
            className="shrink-0 rounded-lg border border-emerald-400 px-2 py-1 text-xs font-semibold dark:border-emerald-700"
          >
            Change
          </button>
        </div>
      </div>
    )
  }

  if (mode === "register") {
    return (
      <div
        className="space-y-3 rounded-xl border border-neutral-300 p-3 dark:border-neutral-600"
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
        <p className="font-bold">New patient</p>
        <label className="block">
          <span className="font-semibold">Full name *</span>
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
          <span className="font-semibold">Mobile *</span>
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
        <div className="flex flex-wrap gap-3">
          <div>
            <span className="font-semibold">Gender *</span>
            <div
              className="mt-1 flex gap-1.5"
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
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                    gender === v
                      ? "border-[var(--theme-primary)] bg-[var(--theme-primary)] text-white"
                      : "border-neutral-300 dark:border-neutral-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="block min-w-[150px] flex-1">
            <span className="font-semibold">Date of birth *</span>
            <input
              type="date"
              className={fieldClass}
              value={dob}
              max={practiceTodayIso()}
              onChange={(e) => setDob(e.target.value)}
            />
          </label>
        </div>
        <label className="block">
          <span className="font-semibold">
            Relationship{" "}
            <span className="font-normal opacity-70">
              (only if this mobile belongs to a family member)
            </span>
          </span>
          <select
            ref={relationRef}
            className={`${fieldClass} ${needsRelationship ? "border-amber-500 ring-2 ring-amber-300" : ""}`}
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
          <span className="font-semibold">
            Email <span className="font-normal opacity-70">(optional)</span>
          </span>
          <input
            type="email"
            className={fieldClass}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="off"
          />
        </label>
        {registerError ? (
          <p className="text-red-700 dark:text-red-400" role="alert">
            {registerError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setMode("search")}
            className="rounded-xl border border-neutral-300 px-3 py-2 text-sm font-semibold dark:border-neutral-600"
          >
            Back to search
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void register()}
            className="rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? "Registering…" : "Register & select"}
          </button>
        </div>
        <p className="text-xs opacity-60">
          Creates a Patient ID (MRN) with your clinic prefix. The patient can
          later sign in with this mobile number.
        </p>
      </div>
    )
  }

  const q = query.trim()
  return (
    <div className="space-y-2">
      <label className="block">
        <span className="font-semibold">Patient</span>
        <input
          ref={searchRef}
          className={fieldClass}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by mobile, name or MRN"
          autoComplete="off"
          autoFocus={autoFocus}
          aria-label="Search patient"
        />
      </label>
      {searching ? (
        <p className="text-xs opacity-60">Searching…</p>
      ) : searchError ? (
        <p className="text-xs text-red-700 dark:text-red-400">{searchError}</p>
      ) : results.length ? (
        <ul
          className="max-h-56 divide-y divide-neutral-200 overflow-y-auto rounded-xl border border-neutral-200 dark:divide-neutral-700 dark:border-neutral-700"
          aria-label="Matching patients"
        >
          {results.map((p) => (
            <li key={p.patientId}>
              <button
                type="button"
                onClick={() => onChange(p)}
                className="w-full px-3 py-2 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold">{p.name}</span>
                  <span className="shrink-0 font-mono text-[11px] opacity-70">
                    {p.mrn ?? "—"}
                  </span>
                </span>
                <span className="block text-xs opacity-70">
                  {patientMeta(p)}
                  {p.knownHere ? "" : " · new to this clinic"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : searched && searched === q ? (
        <p className="text-xs opacity-70">
          No patient found for “{q}”.
          {/\d/.test(q) && q.replace(/\D/g, "").length < 10
            ? " Try the full 10-digit mobile."
            : ""}
        </p>
      ) : (
        <p className="text-xs opacity-60">
          Type the mobile number, name or MRN.
        </p>
      )}
      <button
        type="button"
        onClick={startRegister}
        className="w-full rounded-xl border border-dashed border-[var(--theme-primary)]/60 px-3 py-2 text-sm font-semibold text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/10"
      >
        + Register new patient
      </button>
    </div>
  )
}
