"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminSection from "@/components/admin/AdminSection"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminTable from "@/components/admin/AdminTable"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import {
  nextWaNumberStatus,
  waStatusLabel,
} from "@/components/admin/AdminViewAllLink"
import {
  adminFetch,
  adminService,
  type AdminWhatsAppOverview,
} from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

export default function AdminWhatsAppPage() {
  const [overview, setOverview] = useState<AdminWhatsAppOverview | null>(null)
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")
  const [loading, setLoading] = useState(true)
  const [newPhone, setNewPhone] = useState("")
  const [newMetaPhoneId, setNewMetaPhoneId] = useState("")
  const [assignPracticeId, setAssignPracticeId] = useState("")
  const [assignPhone, setAssignPhone] = useState("")
  const [suspendPracticeId, setSuspendPracticeId] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminService.whatsappOverview()
    if (res.status === "successful" && res.data) {
      setOverview(res.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load())

  const activeRows =
    overview?.activeNumbers.map((n) => ({ ...n, id: n.id })) ?? []
  const availableRows =
    overview?.availableNumbers.map((n) => ({ ...n, id: n.id })) ?? []
  const unsubscribedRows =
    overview?.subscribedWithoutLine.map((p) => ({ ...p, id: p.id })) ?? []
  const provisioningRows =
    overview?.provisioningNumbers.map((n) => ({ ...n, id: n.id })) ?? []
  const suspendedRows =
    overview?.suspendedNumbers?.map((n) => ({ ...n, id: n.id })) ?? []

  const assignOptions = (overview?.subscribedWithoutLine ?? []).map((p) => ({
    id: p.id,
    name: `${p.name} (no line)`,
  }))

  function notify(ok: boolean, text: string) {
    setMessageTone(ok ? "success" : "error")
    setMessage(text)
  }

  async function advanceProvisioning(id: string, currentStatus: string) {
    const next = nextWaNumberStatus(currentStatus)
    if (!next) return
    const res = await adminService.advanceNumberStatus(id, next)
    notify(
      res.status === "successful",
      res.status === "successful"
        ? `Advanced to ${waStatusLabel(next)}.`
        : res.message || "Status update failed.",
    )
    if (res.status === "successful") await load()
  }

  async function releaseSuspended(id: string) {
    const res = await adminService.advanceNumberStatus(id, "AVAILABLE")
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Number released back to the available pool."
        : res.message || "Release failed.",
    )
    if (res.status === "successful") await load()
  }

  async function addNumber(e: React.FormEvent) {
    e.preventDefault()
    if (!newPhone.trim()) return
    const res = await adminFetch("/numbers", {
      method: "POST",
      body: JSON.stringify({
        phoneNumber: newPhone.trim(),
        ...(newMetaPhoneId.trim()
          ? { wabaPhoneNumberId: newMetaPhoneId.trim() }
          : {}),
      }),
    })
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Number added to pool. Each Meta Phone Number ID can belong to only one clinic."
        : res.message || "Failed.",
    )
    if (res.status === "successful") {
      setNewPhone("")
      setNewMetaPhoneId("")
      await load()
    }
  }

  async function assignNumber(e: React.FormEvent) {
    e.preventDefault()
    if (!assignPracticeId.trim()) return
    const res = await adminFetch("/numbers/assign", {
      method: "POST",
      body: JSON.stringify({
        practiceId: assignPracticeId.trim(),
        ...(assignPhone.trim() ? { phoneNumber: assignPhone.trim() } : {}),
      }),
    })
    notify(
      res.status === "successful",
      res.status === "successful" ? "Number assigned." : res.message || "Failed.",
    )
    if (res.status === "successful") {
      setAssignPracticeId("")
      setAssignPhone("")
      await load()
    }
  }

  async function quickAssign(practiceId: string) {
    setAssignPracticeId(practiceId)
    const res = await adminFetch("/numbers/assign", {
      method: "POST",
      body: JSON.stringify({ practiceId }),
    })
    notify(
      res.status === "successful",
      res.status === "successful" ? "Number assigned from pool." : res.message || "Failed.",
    )
    if (res.status === "successful") await load()
  }

  async function suspendLine(e: React.FormEvent) {
    e.preventDefault()
    if (!suspendPracticeId.trim()) return
    const res = await adminFetch("/numbers/suspend", {
      method: "POST",
      body: JSON.stringify({ practiceId: suspendPracticeId.trim() }),
    })
    notify(
      res.status === "successful",
      res.status === "successful" ? "Line suspended." : res.message || "Failed.",
    )
    if (res.status === "successful") {
      setSuspendPracticeId("")
      await load()
    }
  }

  async function notifyGoLive(practiceId: string) {
    const res = await adminService.notifyGoLive(practiceId)
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Go-live notification prepared."
        : res.message || "Go-live notify failed.",
    )
  }

  async function syncMetaTemplates() {
    const res = await adminService.syncMetaTemplates()
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Meta UTILITY templates synced from catalog."
        : res.message || "Template sync failed.",
    )
  }

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="WhatsApp ops"
        subtitle="Pool assign for pilot numbers. For N clinic signups (Embedded Signup), use WhatsApp signup."
        actions={
          <div className="flex flex-wrap gap-2">
            <AdminButton
              variant="secondary"
              onClick={() => void syncMetaTemplates()}
            >
              Sync Meta templates
            </AdminButton>
            <Link
              href="/admin/whatsapp/signup"
              className="rounded-xl border border-[#25D366]/40 bg-[#25D366]/10 px-4 py-2.5 text-sm font-semibold text-emerald-800 dark:text-emerald-200"
            >
              N-number signup →
            </Link>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
            >
              Refresh
            </button>
          </div>
        }
      />

      {message ? <AdminAlert tone={messageTone}>{message}</AdminAlert> : null}

      {loading ? (
        <div className="dashboard-grid-4 animate-pulse">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="min-h-[9rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : overview ? (
        <div className="dashboard-grid-4">
          <InsightStatCard
            href="/admin/whatsapp"
            title="Active lines"
            value={overview.counts.active}
            subtitle="LIVE on a subscribed clinic"
            icon="heart"
            tone="green"
          />
          <InsightStatCard
            href="/admin/whatsapp"
            title="Available pool"
            value={overview.counts.available}
            subtitle="Not assigned to any clinic"
            icon="phone"
            tone="blue"
          />
          <InsightStatCard
            href="/admin/approvals/numbers"
            title="Provisioning"
            value={overview.counts.provisioning}
            subtitle="Assigned but not LIVE yet"
            icon="bell"
            tone="amber"
          />
          <InsightStatCard
            href="/admin/whatsapp"
            title="Needs a line"
            value={overview.counts.subscribedWithoutLine}
            subtitle="Subscribed — no WhatsApp number"
            icon="inbox"
            tone="rose"
          />
        </div>
      ) : null}

      <AdminSection
        title="Active lines"
        count={overview?.counts.active}
        description="LIVE WhatsApp numbers currently serving subscribed clinics"
      >
        <AdminTable
          loading={loading}
          rows={activeRows}
          emptyMessage="No active lines"
          emptyDescription="Assign a number from the pool to a subscribed clinic."
          columns={[
            {
              key: "phone",
              header: "Number",
              cell: (n) => (
                <div>
                  <p className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {n.phoneNumber}
                  </p>
                  {n.displayName ? (
                    <p className="text-xs text-slate-500">{n.displayName}</p>
                  ) : null}
                </div>
              ),
            },
            {
              key: "clinic",
              header: "Clinic",
              cell: (n) =>
                n.practice ? (
                  <div>
                    <p className="font-medium">{n.practice.name}</p>
                    <p className="text-xs text-slate-500">/{n.practice.slug}</p>
                  </div>
                ) : (
                  <span className="text-slate-400">Unlinked</span>
                ),
            },
            {
              key: "meta",
              header: "Meta Phone ID",
              cell: (n) => (
                <span className="font-mono text-xs text-slate-500">
                  {n.wabaPhoneNumberId
                    ? String(n.wabaPhoneNumberId)
                    : "— set per clinic"}
                </span>
              ),
            },
            {
              key: "plan",
              header: "Subscription",
              cell: (n) =>
                n.practice?.subscription ? (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {n.practice.subscription.planName}
                    </p>
                    <AdminBadge tone={statusTone(n.practice.subscription.status)}>
                      {n.practice.subscription.status}
                    </AdminBadge>
                  </div>
                ) : (
                  <AdminBadge tone="amber">No subscription</AdminBadge>
                ),
            },
            {
              key: "status",
              header: "Line status",
              cell: (n) => (
                <AdminBadge tone="green">{waStatusLabel(n.status)}</AdminBadge>
              ),
            },
            {
              key: "live",
              header: "Live since",
              cell: (n) =>
                n.activatedAt
                  ? new Date(n.activatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—",
            },
            {
              key: "actions",
              header: "Actions",
              cell: (n) =>
                n.practice?.id ? (
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    onClick={() => void notifyGoLive(n.practice!.id)}
                  >
                    Notify go-live
                  </AdminButton>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
          ]}
        />
      </AdminSection>

      <div className="dashboard-grid-2">
        <AdminSection
          title="Available pool"
          count={overview?.counts.available}
          description="Numbers in the pool — not taken by any clinic yet"
        >
          <AdminTable
            loading={loading}
            rows={availableRows}
            emptyMessage="Pool is empty"
            emptyDescription="Add numbers below to grow the pool."
            columns={[
              {
                key: "phone",
                header: "Number",
                cell: (n) => (
                  <span className="font-semibold tabular-nums">{n.phoneNumber}</span>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (n) => (
                  <AdminBadge tone="blue">{waStatusLabel(n.status)}</AdminBadge>
                ),
              },
              {
                key: "added",
                header: "Added",
                cell: (n) =>
                  new Date(n.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  }),
              },
            ]}
          />
        </AdminSection>

        <AdminSection
          title="Subscribed — no line yet"
          count={overview?.counts.subscribedWithoutLine}
          description="Clinics with an active subscription but no WhatsApp number assigned"
        >
          <AdminTable
            loading={loading}
            rows={unsubscribedRows}
            emptyMessage="All subscribed clinics have a line"
            emptyDescription="Every paying clinic has been assigned a WhatsApp number."
            columns={[
              {
                key: "clinic",
                header: "Clinic",
                cell: (p) => (
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {p.name}
                    </p>
                    <p className="text-xs text-slate-500">/{p.slug}</p>
                  </div>
                ),
              },
              {
                key: "plan",
                header: "Plan",
                cell: (p) => (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      {p.subscription?.planName ?? "—"}
                    </p>
                    {p.subscription ? (
                      <AdminBadge tone={statusTone(p.subscription.status)}>
                        {p.subscription.status}
                      </AdminBadge>
                    ) : null}
                  </div>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                cell: (p) => (
                  <AdminButton size="sm" onClick={() => void quickAssign(p.id)}>
                    Assign from pool
                  </AdminButton>
                ),
              },
            ]}
          />
        </AdminSection>
      </div>

      {provisioningRows.length > 0 ? (
        <AdminSection
          title="Provisioning"
          count={overview?.counts.provisioning}
          description="Assigned numbers still going through verification — advance stages here or under Approvals → Numbers."
        >
          <AdminTable
            loading={loading}
            rows={provisioningRows}
            columns={[
              {
                key: "phone",
                header: "Number",
                cell: (n) => (
                  <span className="font-semibold tabular-nums">{n.phoneNumber}</span>
                ),
              },
              {
                key: "clinic",
                header: "Clinic",
                cell: (n) => n.practice?.name ?? "—",
              },
              {
                key: "status",
                header: "Stage",
                cell: (n) => (
                  <AdminBadge tone={statusTone(n.status)}>
                    {waStatusLabel(n.status)}
                  </AdminBadge>
                ),
              },
              {
                key: "waba",
                header: "WABA / Phone ID",
                cell: (n) => (
                  <span className="font-mono text-xs text-neutral-500">
                    {n.wabaId ? `WABA ${String(n.wabaId).slice(0, 12)}…` : "—"}
                    {n.wabaPhoneNumberId
                      ? ` · PN ${String(n.wabaPhoneNumberId).slice(0, 8)}…`
                      : ""}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                cell: (n) => {
                  const next = nextWaNumberStatus(n.status)
                  return next ? (
                    <AdminButton
                      size="sm"
                      onClick={() => void advanceProvisioning(n.id, n.status)}
                    >
                      Advance → {waStatusLabel(next)}
                    </AdminButton>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )
                },
              },
            ]}
          />
        </AdminSection>
      ) : null}

      {suspendedRows.length > 0 ? (
        <AdminSection
          title="Suspended lines"
          count={overview?.counts.suspended}
          description="Suspended WhatsApp lines — release back to the pool to reassign."
        >
          <AdminTable
            loading={loading}
            rows={suspendedRows}
            columns={[
              {
                key: "phone",
                header: "Number",
                cell: (n) => (
                  <span className="font-semibold tabular-nums">{n.phoneNumber}</span>
                ),
              },
              {
                key: "clinic",
                header: "Clinic",
                cell: (n) => n.practice?.name ?? "—",
              },
              {
                key: "status",
                header: "Status",
                cell: (n) => (
                  <AdminBadge tone={statusTone(n.status)}>
                    {waStatusLabel(n.status)}
                  </AdminBadge>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                cell: (n) => (
                  <AdminButton
                    size="sm"
                    variant="secondary"
                    onClick={() => void releaseSuspended(n.id)}
                  >
                    Release to pool
                  </AdminButton>
                ),
              },
            ]}
          />
        </AdminSection>
      ) : null}

      <div className="dashboard-grid-2">
        <AdminSection title="Add to pool" compact>
          <p className="mb-3 text-xs text-slate-500">
            Each clinic needs its own Meta Phone Number ID. Do not reuse the
            platform env ID across lines.
          </p>
          <form onSubmit={addNumber} className="flex flex-col gap-3">
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="+91 display number…"
              className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-white/15 dark:bg-white/5"
            />
            <input
              value={newMetaPhoneId}
              onChange={(e) => setNewMetaPhoneId(e.target.value)}
              placeholder="Meta Phone Number ID (from WhatsApp Manager)"
              className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white px-4 text-sm shadow-sm dark:border-white/15 dark:bg-white/5"
            />
            <AdminButton type="submit">Add number</AdminButton>
          </form>
        </AdminSection>

        <AdminSection title="Assign to practice" compact>
          <form onSubmit={assignNumber} className="space-y-3">
            <select
              value={assignPracticeId}
              onChange={(e) => setAssignPracticeId(e.target.value)}
              className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
            >
              <option value="">Select practice…</option>
              {assignOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              value={assignPhone}
              onChange={(e) => setAssignPhone(e.target.value)}
              placeholder="Phone (optional — auto-pick from pool)"
              className="form-input min-h-11 w-full rounded-xl border-slate-200 bg-white px-4 text-sm dark:border-white/15 dark:bg-white/5"
            />
            <AdminButton type="submit">Assign</AdminButton>
          </form>
        </AdminSection>
      </div>

      <AdminSection title="Suspend practice line" compact>
        <form
          onSubmit={suspendLine}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <label className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">
            Practice
            <select
              value={suspendPracticeId}
              onChange={(e) => setSuspendPracticeId(e.target.value)}
              className="form-input mt-2 min-h-11 w-full rounded-xl border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/15 dark:bg-white/5"
            >
              <option value="">Select practice…</option>
              {activeRows
                .filter((n) => n.practice)
                .map((n) => (
                  <option key={n.practice!.id} value={n.practice!.id}>
                    {n.practice!.name}
                  </option>
                ))}
            </select>
          </label>
          <AdminButton variant="danger" type="submit">
            Suspend line
          </AdminButton>
        </form>
      </AdminSection>
    </AdminShell>
  )
}
