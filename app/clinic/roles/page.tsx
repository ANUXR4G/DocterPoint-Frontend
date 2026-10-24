"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { usePracticeDashboard } from "@/contexts/PracticeDashboardContext"
import { proctoService } from "@/lib/services/procto"

type PermKey = string

type RoleRow = {
  id: string
  name: string
  baseRole: string
  system: boolean
  description?: string
  permissions: Record<PermKey, boolean | string>
}

type CatalogItem = {
  key: string
  label: string
  group: string
  description: string
}

const BASE_ROLE_OPTIONS = [
  { value: "PRACTICE_ADMIN", label: "Clinic Admin (membership)" },
  { value: "DOCTOR", label: "Doctor (membership)" },
  { value: "NURSE", label: "Nurse (membership)" },
  { value: "RECEPTIONIST", label: "Receptionist (membership)" },
] as const

function newRoleId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `role-${crypto.randomUUID()}`
  }
  return `role-${Date.now()}`
}

function emptyPermissions(catalog: CatalogItem[]): Record<string, boolean> {
  return Object.fromEntries(catalog.map((c) => [c.key, false]))
}

export default function RolePermissionsMasterPage() {
  const router = useRouter()
  const { memberships, ready, isClinicAdmin } = usePracticeDashboard()
  const practice = memberships[0]?.practice
  const practiceId = practice?.id ?? ""

  const [roles, setRoles] = useState<RoleRow[]>([])
  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? null,
    [roles, selectedId],
  )

  const groups = useMemo(() => {
    const map = new Map<string, CatalogItem[]>()
    for (const item of catalog) {
      const list = map.get(item.group) || []
      list.push(item)
      map.set(item.group, list)
    }
    return Array.from(map.entries())
  }, [catalog])

  const load = useCallback(async () => {
    if (!practiceId) return
    setLoading(true)
    setError("")
    try {
      const res = await proctoService.getRoleAccessMaster(practiceId)
      if (res.status !== "successful" || !res.data) {
        setError(res.message || "Could not load roles.")
        return
      }
      const nextRoles = (res.data.master?.roles || []) as RoleRow[]
      setRoles(nextRoles)
      setCatalog(res.data.permissionCatalog || [])
      setSelectedId((prev) =>
        prev && nextRoles.some((r) => r.id === prev)
          ? prev
          : nextRoles[0]?.id ?? null,
      )
    } catch {
      setError("Could not load roles.")
    } finally {
      setLoading(false)
    }
  }, [practiceId])

  useEffect(() => {
    if (ready && practiceId && isClinicAdmin) void load()
  }, [ready, practiceId, isClinicAdmin, load])

  function patchSelected(patch: Partial<RoleRow>) {
    if (!selectedId) return
    setRoles((prev) =>
      prev.map((r) => (r.id === selectedId ? { ...r, ...patch } : r)),
    )
  }

  function togglePermission(key: string, on: boolean) {
    if (!selected) return
    patchSelected({
      permissions: { ...selected.permissions, [key]: on },
    })
  }

  function addRole() {
    const id = newRoleId()
    const role: RoleRow = {
      id,
      name: "New role",
      baseRole: "NURSE",
      system: false,
      description: "Custom clinic role — set permissions below.",
      permissions: emptyPermissions(catalog),
    }
    setRoles((prev) => [...prev, role])
    setSelectedId(id)
    setMessage("")
    setError("")
  }

  function removeRole(id: string) {
    const target = roles.find((r) => r.id === id)
    if (!target || target.system) {
      setError("System roles cannot be deleted. Adjust their permissions instead.")
      return
    }
    const next = roles.filter((r) => r.id !== id)
    setRoles(next)
    setSelectedId(next[0]?.id ?? null)
  }

  async function save() {
    if (!practiceId) return
    for (const r of roles) {
      if (!r.name.trim()) {
        setError("Every role needs a name.")
        return
      }
    }
    setBusy(true)
    setError("")
    setMessage("")
    try {
      const res = await proctoService.saveRoleAccessMaster(practiceId, {
        roles: roles.map((r) => ({
          id: r.id,
          name: r.name.trim(),
          baseRole: r.baseRole,
          system: r.system,
          description: r.description,
          permissions: Object.fromEntries(
            catalog.map((c) => [
              c.key,
              Boolean(r.permissions[c.key] && r.permissions[c.key] !== false),
            ]),
          ),
        })),
      })
      if (res.status !== "successful") {
        setError(res.message || "Could not save roles.")
        return
      }
      setMessage("Roles and permissions saved. Assign them when adding users.")
      await load()
    } catch {
      setError("Could not save roles.")
    } finally {
      setBusy(false)
    }
  }

  if (!ready || loading) {
    return (
      <div className="dashboard-page-wide">
        <p className="text-sm text-slate-500">Loading roles & permissions…</p>
      </div>
    )
  }

  if (!isClinicAdmin) {
    return (
      <div className="dashboard-page-wide">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Only the clinic owner or a clinic admin can manage roles and permissions.
        </p>
      </div>
    )
  }

  return (
    <div className="dashboard-page-wide">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => router.push("/clinic/dashboard")}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            ← Dashboard
          </button>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            Roles & permissions
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Step 1 of 2 — define organisational roles and their rights first. Then{" "}
            <Link
              href="/clinic/access"
              className="font-semibold text-[var(--theme-primary)] hover:underline"
            >
              add users
            </Link>{" "}
            and assign a role from this list.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <Link href="/clinic/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span className="mx-1">›</span>
            <span>Roles & permissions</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/clinic/access"
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
          >
            Step 2 · Users →
          </Link>
          <button
            type="button"
            onClick={addRole}
            className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
          >
            + Add role
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save roles"}
          </button>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
          {message}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_1fr]">
        <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[var(--solune-surface)]">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-white/10">
            Roles
          </div>
          <ul className="max-h-[70vh] overflow-y-auto py-1">
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm ${
                    selectedId === r.id
                      ? "bg-[color-mix(in_srgb,var(--theme-primary)_12%,transparent)] font-semibold text-slate-900 dark:text-white"
                      : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="truncate">{r.name}</span>
                  {r.system ? (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                      System
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <section className="rounded-2xl border border-slate-200 bg-[#f7fbfb] p-4 dark:border-white/10 dark:bg-[var(--solune-surface)] sm:p-6">
          {!selected ? (
            <p className="text-sm text-slate-500">Select a role to edit permissions.</p>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Role name *
                  </span>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--theme-primary)] dark:border-white/15 dark:bg-white/[0.04]"
                    value={selected.name}
                    onChange={(e) => patchSelected({ name: e.target.value })}
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Description
                  </span>
                  <input
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--theme-primary)] dark:border-white/15 dark:bg-white/[0.04]"
                    value={selected.description || ""}
                    onChange={(e) =>
                      patchSelected({ description: e.target.value })
                    }
                  />
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Base membership type
                  </span>
                  <select
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--theme-primary)] dark:border-white/15 dark:bg-white/[0.04]"
                    value={selected.baseRole}
                    disabled={selected.system && selected.id !== "sys-PHARMACIST"}
                    onChange={(e) => patchSelected({ baseRole: e.target.value })}
                  >
                    {BASE_ROLE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Controls login membership (doctor vs staff). Granular rights
                    are the checkboxes below.
                  </p>
                </label>
              </div>

              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Permissions
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Tick what this role may do in the clinic.
                </p>
                <div className="mt-3 space-y-4">
                  {groups.map(([group, items]) => (
                    <div
                      key={group}
                      className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/[0.03]"
                    >
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {group}
                      </h3>
                      <ul className="mt-2 space-y-2">
                        {items.map((item) => {
                          const on = Boolean(
                            selected.permissions[item.key] &&
                              selected.permissions[item.key] !== false,
                          )
                          return (
                            <li key={item.key}>
                              <label className="flex cursor-pointer items-start gap-3 rounded-lg px-1 py-1 hover:bg-slate-50 dark:hover:bg-white/[0.04]">
                                <input
                                  type="checkbox"
                                  className="mt-1"
                                  checked={on}
                                  onChange={(e) =>
                                    togglePermission(item.key, e.target.checked)
                                  }
                                />
                                <span>
                                  <span className="block text-sm font-medium text-slate-900 dark:text-white">
                                    {item.label}
                                  </span>
                                  <span className="block text-xs text-slate-500">
                                    {item.description}
                                  </span>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {!selected.system ? (
                <button
                  type="button"
                  onClick={() => removeRole(selected.id)}
                  className="text-sm font-semibold text-rose-600 hover:underline"
                >
                  Delete this custom role
                </button>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
