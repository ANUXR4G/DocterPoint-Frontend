"use client"

import { useEffect, useMemo, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import PasswordField from "@/components/inputs/PasswordField"

export type SpecialtyOption = { id: string; name: string; slug: string }

export function SpecialtySelect({
  value,
  onChange,
  canAdd = false,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  canAdd?: boolean
}) {
  const [options, setOptions] = useState<SpecialtyOption[]>([])
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState("")

  useEffect(() => {
    let cancelled = false
    void proctoService.listSpecialties().then((res) => {
      if (cancelled || res.status !== "successful" || !Array.isArray(res.data)) return
      setOptions(res.data as SpecialtyOption[])
    })
    return () => {
      cancelled = true
    }
  }, [])

  const selected = options.filter((o) => value.includes(o.id))
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().includes(q))
  }, [options, query])
  const exact = options.some(
    (o) => o.name.toLowerCase() === query.trim().toLowerCase(),
  )

  function toggle(id: string) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id])
    setQuery("")
    setError("")
  }

  async function addNew(nameInput?: string) {
    const name = (nameInput ?? query).trim()
    if (!name || adding) return
    if (name.length < 2) {
      setError("Specialty name must be at least 2 characters.")
      return
    }
    setAdding(true)
    setError("")
    const res = await proctoService.createSpecialty(name)
    setAdding(false)
    const row = res.data as SpecialtyOption | undefined
    if (res.status !== "successful" || !row?.id) {
      setError(res.message || "Could not add that specialty.")
      return
    }
    setOptions((prev) =>
      prev.some((p) => p.id === row.id)
        ? prev
        : [...prev, row].sort((a, b) => a.name.localeCompare(b.name)),
    )
    if (!value.includes(row.id)) onChange([...value, row.id])
    setQuery("")
    setDraft("")
    setCreating(false)
  }

  return (
    <div className="relative">
      {selected.length ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {selected.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-200"
            >
              {s.name} ×
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 150)
          }}
          placeholder="Search specialties"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        />
        {canAdd ? (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setOpen(false)
              setError("")
              setDraft(query.trim())
              setCreating(true)
            }}
            className="shrink-0 rounded-lg border border-blue-600 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
          >
            New specialty
          </button>
        ) : null}
      </div>
      {creating ? (
        <div className="mt-2 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Specialty name"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          />
          <button
            type="button"
            disabled={adding}
            onClick={() => void addNew(draft)}
            className="shrink-0 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {adding ? "Creating…" : "Create"}
          </button>
          <button
            type="button"
            onClick={() => {
              setCreating(false)
              setDraft("")
              setError("")
            }}
            className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold dark:border-neutral-700"
          >
            Cancel
          </button>
        </div>
      ) : null}
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-48 w-full overflow-auto rounded-lg border bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {filtered.length ? (
            filtered.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o.id)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-white/5"
                >
                  {o.name}
                  {value.includes(o.id) ? " ✓" : ""}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2 text-xs text-slate-500">No matching specialty.</li>
          )}
          {canAdd && query.trim().length > 1 && !exact ? (
            <li>
              <button
                type="button"
                disabled={adding}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addNew(query)}
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-slate-50 dark:text-blue-300 dark:hover:bg-white/5"
              >
                {adding ? "Adding…" : `Add “${query.trim()}”`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

const STAFF_ROLES = [
  { value: "RECEPTIONIST", label: "Receptionist" },
  { value: "NURSE", label: "Nurse" },
  { value: "PRACTICE_ADMIN", label: "Clinic admin" },
] as const

export function AddClinicStaff({
  practiceId,
  canManage,
  onCreated,
}: {
  practiceId: string
  canManage: boolean
  onCreated?: () => Promise<void> | void
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [role, setRole] = useState<(typeof STAFF_ROLES)[number]["value"]>("RECEPTIONIST")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  async function submit() {
    setError("")
    setMessage("")
    if (!name.trim() || !email.trim() || password.trim().length < 6) {
      setError("Name, email, and a password of at least 6 characters are required.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }
    setBusy(true)
    const res = await proctoService.addPracticeStaff(practiceId, {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      phone: phone.trim() || undefined,
      role,
    })
    setBusy(false)
    if (res.status !== "successful") {
      setError(res.message || "Could not add that person.")
      return
    }
    const label = STAFF_ROLES.find((r) => r.value === role)?.label ?? "Staff"
    setMessage(
      `${name.trim()} added as ${label}. They sign in at Clinic Login with this email and password.`,
    )
    setName("")
    setEmail("")
    setPassword("")
    setConfirmPassword("")
    setPhone("")
    await onCreated?.()
  }

  if (!canManage) return null

  return (
    <form
      className="mt-6 grid gap-3 border-t pt-4 dark:border-neutral-700 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <div className="sm:col-span-2">
        <h3 className="font-semibold">Add nurse or receptionist</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Same as a doctor login: name, email, and password. They sign in at
          Clinic Login. They are not bookable doctors.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-red-600 sm:col-span-2" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="text-sm text-green-700 sm:col-span-2" role="status">
          {message}
        </p>
      ) : null}
      <label className="block text-sm">
        <span className="text-xs opacity-70">Name *</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs opacity-70">Role *</span>
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as (typeof STAFF_ROLES)[number]["value"])
          }
          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        >
          {STAFF_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="text-xs opacity-70">Login email *</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs opacity-70">Login password * (min 6)</span>
        <PasswordField
          value={password}
          onChange={setPassword}
          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <label className="block text-sm">
        <span className="text-xs opacity-70">Confirm password *</span>
        <PasswordField
          name="confirmPassword"
          value={confirmPassword}
          onChange={setConfirmPassword}
          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <label className="block text-sm sm:col-span-2">
        <span className="text-xs opacity-70">Phone</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          autoComplete="off"
          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg border border-blue-600 py-2.5 text-sm font-medium text-blue-700 disabled:opacity-50 sm:col-span-2 dark:text-blue-300"
      >
        {busy ? "Saving…" : "Create login"}
      </button>
    </form>
  )
}
