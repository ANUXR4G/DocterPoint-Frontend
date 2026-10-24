"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import PasswordField from "@/components/inputs/PasswordField"
import { SpecialtySelect } from "@/components/ui/procto/SpecialtySelect"
import {
  usePracticeDashboard,
  type RoleAccess,
} from "@/contexts/PracticeDashboardContext"
import { proctoService } from "@/lib/services/procto"

const ROLES = [
  { value: "NURSE", label: "Nurse" },
  { value: "RECEPTIONIST", label: "Receptionist" },
  { value: "DOCTOR", label: "Doctor" },
  { value: "PRACTICE_ADMIN", label: "Clinic admin" },
] as const

type MasterRole = {
  id: string
  name: string
  baseRole: string
  system: boolean
  description?: string
}

const DEPARTMENTS = ["Consultation", "Diagnostics", "Front desk", "Pharmacy"]
const SUB_DEPARTMENTS = [
  "In-person consultation",
  "Video consultation",
  "Walk-in",
]

type DeptRow = {
  department: string
  subDepartment: string
  role: string
  primary: boolean
}

type MemberRow = {
  userId: string
  role: string
  access?: RoleAccess | null
  user?: {
    name?: string | null
    email?: string | null
    phone?: string | null
    doctor?: {
      licenseNo?: string | null
      specialties?: Array<{ specialty: { id: string } }>
    } | null
  }
}

const field =
  "h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-[var(--theme-primary)] dark:border-white/15 dark:bg-white/[0.04] dark:text-white"

function splitName(name: string | null | undefined) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length > 2 && /^(dr\.?|doctor)$/i.test(parts[0])) {
    return {
      firstName: `${parts[0]} ${parts[1]}`,
      lastName: parts.slice(2).join(" "),
    }
  }
  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" "),
  }
}

function sameIds(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((id) => set.has(id))
}

function roleLabel(role: string, access?: RoleAccess | null): string {
  const custom = access?.customRole?.trim() || access?.customRoleName?.trim()
  if (custom) return custom
  if (role === "PRACTICE_OWNER") return "Clinic owner"
  return ROLES.find((r) => r.value === role)?.label || role.replace(/_/g, " ") || "Staff"
}

function emptyDept(role: string, customName?: string): DeptRow {
  return {
    department: DEPARTMENTS[0],
    subDepartment: SUB_DEPARTMENTS[0],
    role: customName?.trim() || roleLabel(role === "PRACTICE_OWNER" ? "DOCTOR" : role),
    primary: true,
  }
}

export default function RoleAccessPage() {
  const router = useRouter()
  const { memberships, ready, refresh, isClinicAdmin } = usePracticeDashboard()
  const practice = memberships[0]?.practice
  const practiceId = practice?.id ?? ""
  const members = (practice?.members ?? []) as MemberRow[]

  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<string>("NURSE")
  const [roleMasterId, setRoleMasterId] = useState<string>("")
  const [masterRoles, setMasterRoles] = useState<MasterRole[]>([])
  const [resourceType, setResourceType] = useState("Nurse")
  const [licenseNo, setLicenseNo] = useState("")
  const [licenseExpiry, setLicenseExpiry] = useState("")
  const [licenseProvider, setLicenseProvider] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [restricted, setRestricted] = useState(false)
  const [deviceDraft, setDeviceDraft] = useState("")
  const [deviceIds, setDeviceIds] = useState<string[]>([])
  const [departments, setDepartments] = useState<DeptRow[]>([emptyDept("NURSE")])
  const [specialtyIds, setSpecialtyIds] = useState<string[]>([])
  const [loadedSpecialtyIds, setLoadedSpecialtyIds] = useState<string[]>([])
  const [hasDoctorProfile, setHasDoctorProfile] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const loadMasterRoles = useCallback(async () => {
    if (!practiceId || !isClinicAdmin) return
    try {
      const res = await proctoService.getRoleAccessMaster(practiceId)
      if (res.status === "successful" && res.data?.master?.roles) {
        setMasterRoles(res.data.master.roles as MasterRole[])
      }
    } catch {
      // Fall back to built-in enum labels if master cannot load.
    }
  }, [practiceId, isClinicAdmin])

  useEffect(() => {
    if (ready) void loadMasterRoles()
  }, [ready, loadMasterRoles])

  const people = useMemo(
    () =>
      [...members].sort((a, b) =>
        (a.user?.name || "").localeCompare(b.user?.name || ""),
      ),
    [members],
  )

  function openMember(m: MemberRow) {
    const names = splitName(m.user?.name)
    const access = m.access || {}
    setEditingId(m.userId)
    setFirstName(names.firstName)
    setLastName(names.lastName)
    setPhone(m.user?.phone || "")
    setEmail(m.user?.email || "")
    setRole(m.role === "PRACTICE_OWNER" ? "PRACTICE_OWNER" : m.role)
    const masterId =
      access.roleId ||
      access.roleMasterId ||
      (access.customRole || access.customRoleName
        ? masterRoles.find(
            (r) =>
              r.name.toLowerCase() ===
              String(access.customRole || access.customRoleName)
                .trim()
                .toLowerCase(),
          )?.id
        : undefined) ||
      masterRoles.find((r) => r.baseRole === m.role && r.system)?.id ||
      ""
    setRoleMasterId(masterId)
    setResourceType(access.resourceType || roleLabel(m.role, access))
    setLicenseNo(m.user?.doctor?.licenseNo || "")
    setLicenseExpiry(access.licenseExpiry || "")
    setLicenseProvider(access.licenseProvider || "")
    setPassword("")
    setConfirmPassword("")
    setRestricted(Boolean(access.restricted))
    setDeviceIds(access.deviceIds || [])
    const cr = access.customRole || access.customRoleName
    setDepartments(
      access.departments?.length
        ? access.departments
        : [emptyDept(m.role, cr)],
    )
    const ids =
      m.user?.doctor?.specialties?.map((row) => row.specialty.id).filter(Boolean) ??
      []
    setSpecialtyIds(ids)
    setLoadedSpecialtyIds(ids)
    setHasDoctorProfile(Boolean(m.user?.doctor))
    setError("")
    setMessage("")
  }

  function openNew() {
    setEditingId("new")
    setFirstName("")
    setLastName("")
    setPhone("")
    setEmail("")
    const defaultMaster =
      masterRoles.find((r) => r.id === "sys-NURSE") ||
      masterRoles.find((r) => r.baseRole === "NURSE") ||
      masterRoles[0]
    setRole(defaultMaster?.baseRole || "NURSE")
    setRoleMasterId(defaultMaster?.id || "")
    setResourceType(defaultMaster?.name || "Nurse")
    setLicenseNo("")
    setLicenseExpiry("")
    setLicenseProvider("")
    setPassword("")
    setConfirmPassword("")
    setRestricted(false)
    setDeviceIds([])
    setDepartments([emptyDept("NURSE")])
    setSpecialtyIds([])
    setLoadedSpecialtyIds([])
    setHasDoctorProfile(false)
    setError("")
    setMessage("")
  }

  function accessBody(): RoleAccess {
    const master = masterRoles.find((r) => r.id === roleMasterId)
    const displayName = master?.name || resourceType
    const isCustom = Boolean(master && !master.system)
    return {
      resourceType: displayName,
      roleId: roleMasterId || undefined,
      roleMasterId: roleMasterId || undefined,
      customRole: isCustom ? displayName : undefined,
      customRoleName: isCustom ? displayName : undefined,
      licenseExpiry,
      licenseProvider,
      restricted,
      deviceIds,
      departments,
    }
  }

  async function save() {
    if (!practiceId) return
    setError("")
    setMessage("")
    if (!firstName.trim() || !email.trim()) {
      setError("First name and email are required.")
      return
    }
    if (role !== "PRACTICE_OWNER" && !roleMasterId) {
      setError("Select a role from Roles & permissions (Step 1).")
      return
    }
    const master = masterRoles.find((r) => r.id === roleMasterId)
    const effectiveRole =
      role === "PRACTICE_OWNER"
        ? "PRACTICE_OWNER"
        : master?.baseRole || role
    if (editingId === "new") {
      if (password.trim().length < 6) {
        setError("Password must be at least 6 characters.")
        return
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.")
        return
      }
      if (effectiveRole === "DOCTOR" && !specialtyIds.length) {
        setError("Select a specialty.")
        return
      }
    }
    if (
      editingId &&
      editingId !== "new" &&
      effectiveRole === "DOCTOR" &&
      !specialtyIds.length
    ) {
      setError("Select a specialty.")
      return
    }
    setBusy(true)
    const name = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ")
    try {
      if (editingId === "new") {
        const res =
          effectiveRole === "DOCTOR"
            ? await proctoService.addPracticeDoctor(practiceId, {
                name,
                email: email.trim(),
                phone: phone.trim() || undefined,
                password: password.trim(),
                licenseNo: licenseNo.trim() || undefined,
                specialtyIds,
              })
            : await proctoService.addPracticeStaff(practiceId, {
                name,
                email: email.trim(),
                phone: phone.trim() || undefined,
                password: password.trim(),
                role: effectiveRole,
                access: accessBody(),
              })
        if (res.status !== "successful") {
          setError(res.message || "Could not create that login.")
          setBusy(false)
          return
        }
        const createdId = (
          res.data as { user?: { id?: string } } | undefined
        )?.user?.id
        if (createdId && effectiveRole === "DOCTOR") {
          await proctoService.updateRoleAccess(practiceId, createdId, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone,
            licenseNo,
            access: accessBody(),
          })
        }
        setMessage("User saved.")
      } else if (editingId) {
        const specialtiesChanged = !sameIds(specialtyIds, loadedSpecialtyIds)
        const res = await proctoService.updateRoleAccess(practiceId, editingId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          role: effectiveRole === "PRACTICE_OWNER" ? undefined : effectiveRole,
          licenseNo,
          access: accessBody(),
          ...(specialtiesChanged || (effectiveRole === "DOCTOR" && !hasDoctorProfile)
            ? { specialtyIds }
            : {}),
        })
        if (res.status !== "successful") {
          setError(res.message || "Could not update user.")
          setBusy(false)
          return
        }
        setMessage("User updated.")
      }
      await refresh()
    } catch {
      setError("Could not save user.")
    } finally {
      setBusy(false)
    }
  }

  function addDevice() {
    const id = deviceDraft.trim()
    if (!id || deviceIds.includes(id)) {
      setDeviceDraft("")
      return
    }
    setDeviceIds((ids) => [...ids, id])
    setDeviceDraft("")
  }

  if (!ready) {
    return (
      <div className="dashboard-page-wide">
        <p className="text-sm text-slate-500">Loading users…</p>
      </div>
    )
  }

  if (!isClinicAdmin) {
    return (
      <div className="dashboard-page-wide">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Only the clinic owner or a clinic admin can manage users.
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
            onClick={() => {
              if (editingId) {
                setEditingId(null)
                setError("")
                setMessage("")
                return
              }
              router.push("/clinic/dashboard")
            }}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            ← {editingId ? "Users list" : "Dashboard"}
          </button>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-white">
            {editingId === "new"
              ? "Add user"
              : editingId
                ? "Update user"
                : "Users"}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Step 2 of 2 — create staff profiles and assign a role defined in{" "}
            <Link
              href="/clinic/roles"
              className="font-semibold text-[var(--theme-primary)] hover:underline"
            >
              Roles & permissions
            </Link>
            .
          </p>
          <p className="mt-1 text-xs text-slate-500">
            <Link href="/clinic/dashboard" className="hover:underline">
              Dashboard
            </Link>
            <span className="mx-1">›</span>
            <Link href="/clinic/roles" className="hover:underline">
              Roles & permissions
            </Link>
            <span className="mx-1">›</span>
            <button
              type="button"
              className="hover:underline"
              onClick={() => {
                setEditingId(null)
                setError("")
                setMessage("")
              }}
            >
              Users list
            </button>
            {editingId ? (
              <>
                <span className="mx-1">›</span>
                <span>{editingId === "new" ? "Add" : "Edit"}</span>
              </>
            ) : null}
          </p>
        </div>
        {!editingId ? (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/clinic/roles"
              className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:bg-white/[0.04] dark:text-white"
            >
              ← Step 1 · Roles
            </Link>
            <button
              type="button"
              onClick={openNew}
              className="inline-flex h-10 items-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-semibold text-white"
            >
              Add user
            </button>
          </div>
        ) : null}
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

      {!editingId ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/10 dark:bg-[var(--solune-surface)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-white/[0.04]">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
                <th className="px-4 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {people.map((m) => (
                <tr
                  key={m.userId}
                  className="border-t border-slate-100 dark:border-white/10"
                >
                  <td className="px-4 py-3 font-medium">
                    {m.user?.name || "Unnamed"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{m.user?.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5">
                      <span>{roleLabel(m.role, m.access)}</span>
                      {m.access?.customRole || m.access?.customRoleName ? (
                        <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                          Custom
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openMember(m)}
                      className="text-sm font-semibold text-[var(--theme-primary)]"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-[#f7fbfb] p-4 dark:border-white/10 dark:bg-[var(--solune-surface)] sm:p-6">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                First Name *
              </span>
              <input
                className={field}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Last Name *
              </span>
              <input
                className={field}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Phone *
              </span>
              <input
                className={field}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Email *
              </span>
              <input
                className={field}
                type="email"
                value={email}
                disabled={editingId !== "new"}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500">
                <span>Select Role *</span>
                {role !== "PRACTICE_OWNER" ? (
                  <Link
                    href="/clinic/roles"
                    className="font-semibold text-blue-600 hover:underline dark:text-sky-400"
                  >
                    Manage roles & rights
                  </Link>
                ) : null}
              </div>
              {role === "PRACTICE_OWNER" ? (
                <input className={field} value="Clinic owner" disabled />
              ) : (
                <div className="space-y-1.5">
                  <select
                    className={field}
                    value={roleMasterId}
                    onChange={(e) => {
                      const id = e.target.value
                      setRoleMasterId(id)
                      const master = masterRoles.find((r) => r.id === id)
                      if (!master) return
                      setRole(master.baseRole)
                      setResourceType(master.name)
                      setDepartments((rows) =>
                        rows.map((row, i) =>
                          i === 0 ? { ...row, role: master.name } : row,
                        ),
                      )
                    }}
                  >
                    <option value="">Select a configured role…</option>
                    {masterRoles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.system ? "" : " (custom)"}
                      </option>
                    ))}
                  </select>
                  {masterRoles.length === 0 ? (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                      No roles loaded.{" "}
                      <Link href="/clinic/roles" className="font-semibold underline">
                        Open Roles & permissions
                      </Link>{" "}
                      (Step 1) first.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Roles and rights are configured in Step 1. This assigns one
                      predefined role to the user.
                    </p>
                  )}
                </div>
              )}
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Resource Type
              </span>
              <select
                className={field}
                value={resourceType}
                onChange={(e) => setResourceType(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.label}>
                    {r.label}
                  </option>
                ))}
                {ROLES.some((r) => r.label === resourceType) ? null : (
                  <option value={resourceType}>{resourceType}</option>
                )}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                License ID *
              </span>
              <input
                className={field}
                value={licenseNo}
                onChange={(e) => setLicenseNo(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                License Expiry Date
              </span>
              <input
                className={field}
                type="date"
                value={licenseExpiry}
                onChange={(e) => setLicenseExpiry(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                License Provider
              </span>
              <input
                className={field}
                value={licenseProvider}
                onChange={(e) => setLicenseProvider(e.target.value)}
              />
            </label>
            {role === "DOCTOR" || hasDoctorProfile ? (
              <div className="md:col-span-3">
                <span className="mb-1 block text-xs font-medium text-slate-500">
                  Specialties{role === "DOCTOR" ? " *" : ""}
                </span>
                <SpecialtySelect
                  value={specialtyIds}
                  onChange={setSpecialtyIds}
                  canAdd
                />
              </div>
            ) : null}
            {editingId === "new" ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Password *
                  </span>
                  <PasswordField
                    value={password}
                    onChange={setPassword}
                    placeholder="Password"
                    className={field}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">
                    Confirm password *
                  </span>
                  <PasswordField
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Confirm password"
                    className={field}
                  />
                </label>
              </>
            ) : null}
          </div>

          <h2 className="mb-3 mt-8 text-base font-semibold">Update restrictions</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={restricted}
              onChange={(e) => setRestricted(e.target.checked)}
            />
            Enable restricted access
          </label>
          <label className="mt-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Device IDs
            </span>
            <input
              className={field}
              value={deviceDraft}
              placeholder="Type a device id and press Enter"
              onChange={(e) => setDeviceDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  addDevice()
                }
              }}
            />
          </label>
          {deviceIds.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {deviceIds.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    className="rounded-full bg-white px-2 py-1 text-xs dark:bg-white/10"
                    onClick={() =>
                      setDeviceIds((ids) => ids.filter((x) => x !== id))
                    }
                  >
                    {id} ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <h2 className="mb-3 mt-8 text-base font-semibold">Departments</h2>
          {departments.map((row, index) => (
            <div
              key={index}
              className="mb-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-transparent"
            >
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Department {index + 1}</p>
                {departments.length > 1 ? (
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-600"
                    onClick={() =>
                      setDepartments((rows) => rows.filter((_, i) => i !== index))
                    }
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-500">
                    Select Department *
                  </span>
                  <select
                    className={field}
                    value={row.department}
                    onChange={(e) =>
                      setDepartments((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, department: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    {DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-500">
                    Select Sub Department *
                  </span>
                  <select
                    className={field}
                    value={row.subDepartment}
                    onChange={(e) =>
                      setDepartments((rows) =>
                        rows.map((r, i) =>
                          i === index
                            ? { ...r, subDepartment: e.target.value }
                            : r,
                        ),
                      )
                    }
                  >
                    {SUB_DEPARTMENTS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs text-slate-500">
                    Role in Department *
                  </span>
                  <select
                    className={field}
                    value={row.role}
                    onChange={(e) =>
                      setDepartments((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, role: e.target.value } : r,
                        ),
                      )
                    }
                  >
                    {masterRoles.length ? (
                      <optgroup label="Configured roles">
                        {masterRoles.map((r) => (
                          <option key={`dept-${r.id}`} value={r.name}>
                            {r.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : (
                      <optgroup label="Standard Roles">
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.label}>
                            {r.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {row.role &&
                    !masterRoles.some((r) => r.name === row.role) &&
                    !ROLES.some((r) => r.label === row.role) ? (
                      <option value={row.role}>{row.role}</option>
                    ) : null}
                  </select>
                </label>
              </div>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.primary}
                  onChange={(e) =>
                    setDepartments((rows) =>
                      rows.map((r, i) =>
                        i === index
                          ? { ...r, primary: e.target.checked }
                          : e.target.checked
                            ? { ...r, primary: false }
                            : r,
                      ),
                    )
                  }
                />
                Primary department
              </label>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-[var(--theme-primary)]"
            onClick={() =>
              setDepartments((rows) => [
                ...rows,
                { ...emptyDept(role), primary: false },
              ])
            }
          >
            Add department
          </button>

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="inline-flex h-10 items-center rounded-lg bg-[var(--theme-primary)] px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Update"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingId(null)
                setError("")
                setMessage("")
              }}
              className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-5 text-sm font-semibold dark:border-white/15"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
