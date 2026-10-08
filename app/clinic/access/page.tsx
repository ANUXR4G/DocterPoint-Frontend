"use client"

import { useMemo, useState } from "react"
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

function roleLabel(role: string) {
  if (role === "PRACTICE_OWNER") return "Clinic owner"
  return ROLES.find((r) => r.value === role)?.label || role.replace(/_/g, " ")
}

function emptyDept(role: string): DeptRow {
  return {
    department: DEPARTMENTS[0],
    subDepartment: SUB_DEPARTMENTS[0],
    role: roleLabel(role === "PRACTICE_OWNER" ? "DOCTOR" : role),
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
    setResourceType(access.resourceType || roleLabel(m.role))
    setLicenseNo(m.user?.doctor?.licenseNo || "")
    setLicenseExpiry(access.licenseExpiry || "")
    setLicenseProvider(access.licenseProvider || "")
    setPassword("")
    setConfirmPassword("")
    setRestricted(Boolean(access.restricted))
    setDeviceIds(access.deviceIds || [])
    setDepartments(
      access.departments?.length
        ? access.departments
        : [emptyDept(m.role)],
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
    setRole("NURSE")
    setResourceType("Nurse")
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
    return {
      resourceType,
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
    if (editingId === "new") {
      if (password.trim().length < 6) {
        setError("Password must be at least 6 characters.")
        return
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match.")
        return
      }
      if (role === "DOCTOR" && !specialtyIds.length) {
        setError("Select a specialty.")
        return
      }
    }
    if (
      editingId &&
      editingId !== "new" &&
      role === "DOCTOR" &&
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
          role === "DOCTOR"
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
                role,
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
        if (createdId && role === "DOCTOR") {
          await proctoService.updateRoleAccess(practiceId, createdId, {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phone,
            licenseNo,
            access: accessBody(),
          })
        }
        setMessage("Role access saved.")
      } else if (editingId) {
        const specialtiesChanged = !sameIds(specialtyIds, loadedSpecialtyIds)
        const res = await proctoService.updateRoleAccess(practiceId, editingId, {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          role: role === "PRACTICE_OWNER" ? undefined : role,
          licenseNo,
          access: accessBody(),
          ...(specialtiesChanged || (role === "DOCTOR" && !hasDoctorProfile)
            ? { specialtyIds }
            : {}),
        })
        if (res.status !== "successful") {
          setError(res.message || "Could not update role access.")
          setBusy(false)
          return
        }
        setMessage("Role access updated.")
      }
      await refresh()
    } catch {
      setError("Could not save role access.")
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
        <p className="text-sm text-slate-500">Loading role access…</p>
      </div>
    )
  }

  if (!isClinicAdmin) {
    return (
      <div className="dashboard-page-wide">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Only the clinic owner or a clinic admin can change role access.
        </p>
      </div>
    )
  }

  return (
    <div className="dashboard-page-wide">
      <div className="mb-4 flex items-start justify-between gap-3">
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
                : "Role access"}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            <Link href="/clinic/dashboard" className="hover:underline">
              Dashboard
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
          <button
            type="button"
            onClick={openNew}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--theme-primary)] px-4 text-sm font-semibold text-white"
          >
            Add user
          </button>
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
                  <td className="px-4 py-3">{roleLabel(m.role)}</td>
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
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">
                Select Role *
              </span>
              {role === "PRACTICE_OWNER" ? (
                <input className={field} value="Clinic owner" disabled />
              ) : (
                <select
                  className={field}
                  value={role}
                  onChange={(e) => {
                    setRole(e.target.value)
                    const label = roleLabel(e.target.value)
                    setResourceType(label)
                    setDepartments((rows) =>
                      rows.map((row, i) =>
                        i === 0 ? { ...row, role: label } : row,
                      ),
                    )
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              )}
            </label>
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
                    {ROLES.map((r) => (
                      <option key={r.value}>{r.label}</option>
                    ))}
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
