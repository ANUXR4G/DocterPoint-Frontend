"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminSection from "@/components/admin/AdminSection"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminTable from "@/components/admin/AdminTable"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import { AdminBadge, statusTone } from "@/components/admin/AdminBadge"
import { waStatusLabel } from "@/components/admin/AdminViewAllLink"
import { useMetaEmbeddedSignup } from "@/hooks/useMetaEmbeddedSignup"
import {
  adminService,
  type WhatsAppPendingSignups,
  type WhatsAppRegistry,
} from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

/**
 * DoubleTick-style partner dashboard:
 * - One Meta App + Embedded Signup for N clinic numbers
 * - Registry of all WABAs / Phone Number IDs
 * - Invite clinics + ops can Connect with Meta for a clinic
 */
export default function WhatsAppSignupPage() {
  const [registry, setRegistry] = useState<WhatsAppRegistry | null>(null)
  const [pending, setPending] = useState<WhatsAppPendingSignups | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] = useState("CONNECTED")
  const [message, setMessage] = useState("")
  const [messageTone, setMessageTone] = useState<"success" | "error">("success")
  const [selectedPracticeId, setSelectedPracticeId] = useState("")
  const [phone, setPhone] = useState("")
  const [busy, setBusy] = useState(false)
  const { launchEmbeddedSignup } = useMetaEmbeddedSignup()

  const load = useCallback(async () => {
    setLoading(true)
    const [reg, pend] = await Promise.all([
      adminService.whatsappRegistry({
        status: statusFilter || undefined,
        q: q.trim() || undefined,
      }),
      adminService.whatsappPendingSignups(),
    ])
    if (reg.status === "successful" && reg.data) setRegistry(reg.data)
    if (pend.status === "successful" && pend.data) setPending(pend.data)
    setLoading(false)
  }, [q, statusFilter])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load())

  const signup = registry?.signup ?? pending?.signup
  const pendingClinics = pending?.clinics ?? []

  const practiceOptions = useMemo(() => {
    const fromPending = pendingClinics.map((c) => ({
      id: c.id,
      name: `${c.name} (needs signup)`,
      phone: c.phone ?? "",
    }))
    const fromRegistry = (registry?.numbers ?? [])
      .filter((n) => n.practice)
      .map((n) => ({
        id: n.practice!.id,
        name: n.practice!.name,
        phone: n.phoneNumber,
      }))
    const map = new Map<string, { id: string; name: string; phone: string }>()
    for (const p of [...fromPending, ...fromRegistry]) map.set(p.id, p)
    return [...map.values()]
  }, [pendingClinics, registry?.numbers])

  function notify(ok: boolean, text: string) {
    setMessageTone(ok ? "success" : "error")
    setMessage(text)
  }

  async function copyInvite(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      notify(true, "Invite message copied.")
    } catch {
      notify(false, "Could not copy — select the text manually.")
    }
  }

  async function connectWithMeta() {
    if (!selectedPracticeId) {
      notify(false, "Select a clinic first.")
      return
    }
    if (!phone.trim()) {
      notify(false, "Enter the clinic WhatsApp mobile number.")
      return
    }
    if (!signup?.embeddedSignupEnabled || !signup.appId || !signup.configId) {
      notify(
        false,
        "Embedded Signup not configured. Set META_APP_ID + META_EMBEDDED_SIGNUP_CONFIG_ID.",
      )
      return
    }

    setBusy(true)
    try {
      const result = await launchEmbeddedSignup({
        appId: signup.appId,
        configId: signup.configId,
        apiVersion: signup.apiVersion,
        coexistenceFlow: signup.coexistenceFlow,
      })
      const res = await adminService.whatsappConnectPractice(selectedPracticeId, {
        phoneNumber: phone.trim(),
        wabaPhoneNumberId: result.phoneNumberId,
        wabaId: result.wabaId,
        oauthCode: result.oauthCode,
      })
      setBusy(false)
      if (res.status === "successful" || res.status === "created") {
        notify(
          true,
          "Number connected and LIVE — templates auto-approved.",
        )
        setPhone("")
        await load()
        return
      }
      notify(false, res.message || "Connect failed.")
    } catch (err) {
      setBusy(false)
      notify(false, err instanceof Error ? err.message : "Meta signup failed.")
    }
  }

  async function refreshAll() {
    setBusy(true)
    const res = await adminService.whatsappRefreshAll()
    setBusy(false)
    notify(
      res.status === "successful",
      res.status === "successful"
        ? `Refreshed ${(res.data as { refreshed?: number })?.refreshed ?? 0} lines from Meta.`
        : res.message || "Refresh failed.",
    )
    if (res.status === "successful") await load()
  }

  async function refreshOne(id: string) {
    const res = await adminService.whatsappRefreshNumber(id)
    notify(
      res.status === "successful",
      res.status === "successful"
        ? "Template status updated from Meta."
        : res.message || "Refresh failed.",
    )
    if (res.status === "successful") await load()
  }

  const checklist = signup?.checklist ?? {}

  return (
    <AdminShell>
      <AdminPageHeader
        title="WhatsApp signup"
        subtitle="DoubleTick-style: onboard N clinic numbers under one Meta app via Embedded Signup. Same booking bot for every line."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/whatsapp"
              className="inline-flex min-h-10 items-center rounded-lg border border-neutral-300 px-3 text-sm font-semibold text-neutral-800 dark:border-neutral-600 dark:text-neutral-100"
            >
              Pool ops →
            </Link>
            <AdminButton
              size="sm"
              disabled={busy}
              onClick={() => void refreshAll()}
            >
              Refresh all from Meta
            </AdminButton>
          </div>
        }
      />

      {message ? (
        <AdminAlert tone={messageTone} className="mb-4">
          {message}
        </AdminAlert>
      ) : null}

      {/* Platform readiness — like DoubleTick setup banner */}
      <AdminSection
        title="Platform (one Meta app → N numbers)"
        description="Embedded Signup creates a WABA + Phone Number ID per clinic. GlucoGuide routes by Phone Number ID on a single webhook."
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <InsightStatCard
            title="Connected lines"
            value={registry?.summary.connected ?? 0}
            subtitle="All active / provisioning"
            href="/admin/whatsapp/signup"
            icon="phone"
            tone="blue"
          />
          <InsightStatCard
            title="LIVE"
            value={registry?.summary.live ?? 0}
            subtitle="Bot + templates ready"
            href="/admin/whatsapp/signup"
            icon="heart"
            tone="green"
          />
          <InsightStatCard
            title="Provisioning"
            value={registry?.summary.provisioning ?? 0}
            subtitle="Connected · not LIVE yet"
            href="/admin/whatsapp/signup"
            icon="bell"
            tone="amber"
          />
          <InsightStatCard
            title="Awaiting signup"
            value={pending?.total ?? 0}
            subtitle="Subscribed · no line"
            href="/admin/whatsapp/signup"
            icon="inbox"
            tone="rose"
          />
        </div>

        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            signup?.platformReady
              ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
              : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
          }`}
        >
          <p className="font-semibold">
            {signup?.platformReady
              ? "Embedded Signup ready — clinics can Connect with Meta"
              : "Finish Meta setup before onboarding clinics"}
          </p>
          <ul className="mt-2 grid gap-1 text-xs sm:grid-cols-2">
            {(
              [
                ["metaAppId", "META_APP_ID"],
                ["embeddedSignupConfigId", "META_EMBEDDED_SIGNUP_CONFIG_ID"],
                ["systemUserToken", "WHATSAPP_ACCESS_TOKEN"],
                ["webhookVerifyToken", "WHATSAPP_VERIFY_TOKEN"],
                ["appSecret", "WHATSAPP_APP_SECRET"],
              ] as const
            ).map(([key, label]) => (
              <li key={key}>
                {checklist[key] ? "✓" : "○"} {label}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[11px] opacity-80">
            Webhook: {signup?.webhookPath ?? "/api/v1/procto/whatsapp/webhook"}
          </p>
        </div>
      </AdminSection>

      {/* Add number — Embedded Signup for a clinic */}
      <AdminSection
        title="Add WhatsApp number"
        description="Same flow as DoubleTick: Meta Embedded Signup returns WABA ID + Phone Number ID, then GlucoGuide provisions UTILITY templates."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Clinic</span>
            <select
              className="form-input mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-sm"
              value={selectedPracticeId}
              onChange={(e) => {
                setSelectedPracticeId(e.target.value)
                const match = practiceOptions.find((p) => p.id === e.target.value)
                if (match?.phone) setPhone(match.phone.replace(/\D/g, "").slice(-10))
              }}
              disabled={busy}
            >
              <option value="">Select clinic…</option>
              {practiceOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Clinic WhatsApp mobile</span>
            <input
              className="form-input mt-1 min-h-11 w-full rounded-lg px-3 py-2 text-sm"
              placeholder="10-digit Indian mobile"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <AdminButton
            disabled={busy || !signup?.embeddedSignupEnabled}
            onClick={() => void connectWithMeta()}
          >
            {busy ? "Connecting…" : "Connect with Meta"}
          </AdminButton>
          <p className="self-center text-xs text-neutral-500">
            Or send clinic owners to Billing → Connect with Meta (self-serve).
          </p>
        </div>
      </AdminSection>

      {/* Pending invites */}
      {pendingClinics.length > 0 ? (
        <AdminSection
          title="Clinics waiting to connect"
          count={pending?.total}
          description="Subscribed clinics with no WhatsApp line — copy invite or connect above."
        >
          <AdminTable
            loading={loading}
            rows={pendingClinics}
            emptyMessage="No clinics waiting"
            columns={[
              {
                key: "clinic",
                header: "Clinic",
                cell: (c) => (
                  <div>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs text-neutral-500">
                      {c.planName ?? "—"} · {c.subscriptionStatus ?? "—"}
                    </p>
                  </div>
                ),
              },
              {
                key: "owners",
                header: "Owners",
                cell: (c) => (
                  <span className="text-xs text-neutral-600 dark:text-neutral-300">
                    {c.owners
                      .map((o) => o.email || o.phone || o.name)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </span>
                ),
              },
              {
                key: "invite",
                header: "Invite",
                cell: (c) => (
                  <AdminButton
                    size="sm"
                    onClick={() => void copyInvite(c.inviteMessage)}
                  >
                    Copy invite
                  </AdminButton>
                ),
              },
              {
                key: "select",
                header: "",
                cell: (c) => (
                  <AdminButton
                    size="sm"
                    onClick={() => {
                      setSelectedPracticeId(c.id)
                      if (c.phone)
                        setPhone(c.phone.replace(/\D/g, "").slice(-10))
                    }}
                  >
                    Select
                  </AdminButton>
                ),
              },
            ]}
          />
        </AdminSection>
      ) : null}

      {/* Registry table */}
      <AdminSection
        title="Number registry"
        count={registry?.total}
        description="All lines under your Meta app — filter like DoubleTick’s number list."
      >
        <div className="mb-3 flex flex-wrap gap-2">
          <input
            className="form-input min-h-10 flex-1 rounded-lg px-3 py-2 text-sm sm:max-w-xs"
            placeholder="Search phone, clinic, WABA…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select
            className="form-input min-h-10 rounded-lg px-3 py-2 text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="CONNECTED">Connected</option>
            <option value="LIVE">LIVE</option>
            <option value="TEMPLATES_PENDING">Templates pending</option>
            <option value="AVAILABLE">Pool available</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="">All</option>
          </select>
          <AdminButton size="sm" onClick={() => void load()}>
            Search
          </AdminButton>
        </div>

        <AdminTable
          loading={loading}
          rows={registry?.numbers ?? []}
          emptyMessage="No numbers yet"
          emptyDescription="Connect the first clinic with Meta Embedded Signup."
          columns={[
            {
              key: "phone",
              header: "Number",
              cell: (n) => (
                <div>
                  <p className="font-semibold tabular-nums">+91 {n.phoneNumber}</p>
                  {n.waMeLink ? (
                    <a
                      href={n.waMeLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-[#0099ff] underline"
                    >
                      wa.me
                    </a>
                  ) : null}
                </div>
              ),
            },
            {
              key: "clinic",
              header: "Clinic",
              cell: (n) => n.practice?.name ?? "— (pool)",
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
              key: "meta",
              header: "WABA / Phone ID",
              cell: (n) => (
                <span className="font-mono text-[11px] text-neutral-500">
                  {n.wabaId ? `WABA …${n.wabaId.slice(-8)}` : "—"}
                  <br />
                  {n.wabaPhoneNumberId
                    ? `PN …${n.wabaPhoneNumberId.slice(-8)}`
                    : ""}
                </span>
              ),
            },
            {
              key: "templates",
              header: "Templates",
              cell: (n) => (
                <span className="text-xs capitalize text-neutral-600 dark:text-neutral-300">
                  {n.templatesStatus?.replace(/_/g, " ") ?? "—"}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              cell: (n) =>
                n.practice && n.wabaId ? (
                  <AdminButton size="sm" onClick={() => void refreshOne(n.id)}>
                    Refresh
                  </AdminButton>
                ) : null,
            },
          ]}
        />
      </AdminSection>
    </AdminShell>
  )
}
