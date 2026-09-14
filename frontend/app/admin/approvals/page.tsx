"use client"

import { useCallback, useEffect, useState } from "react"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminSection from "@/components/admin/AdminSection"
import AdminAlert from "@/components/admin/AdminAlert"
import AdminButton from "@/components/admin/AdminButton"
import AdminViewAllLink from "@/components/admin/AdminViewAllLink"
import {
  AdminBadge,
  AdminListCard,
  statusTone,
} from "@/components/admin/AdminBadge"
import { adminService } from "@/lib/services/admin"
import { useAdminOpsRefresh } from "@/hooks/useAdminOpsRefresh"

const PREVIEW_LIMIT = 2

type ApprovalsData = {
  reviews: Array<{
    id: string
    authorName: string
    rating: number
    body?: string | null
    practice?: { name: string; slug: string } | null
  }>
  templates: Array<{
    id: string
    name: string
    status: string
    category: string
    practice?: { name: string; slug: string } | null
  }>
  escalations: Array<{
    id: string
    patientPhone: string
    status: string
    practice?: { name: string; slug: string } | null
  }>
  numbers: Array<{
    id: string
    phoneNumber: string
    status: string
    practice?: { name: string; slug: string } | null
  }>
}

export default function AdminApprovalsPage() {
  const [data, setData] = useState<ApprovalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const res = await adminService.approvals()
    if (res.status === "successful" && res.data) {
      setData(res.data as ApprovalsData)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useAdminOpsRefresh(() => void load())

  async function approveReview(id: string) {
    const res = await adminService.approveReview(id)
    setMessage(
      res.status === "successful" ? "Review published." : res.message || "Failed.",
    )
    if (res.status === "successful") await load()
  }

  async function approveTemplate(id: string) {
    const res = await adminService.approveTemplate(id)
    setMessage(
      res.status === "successful"
        ? "Template approved."
        : res.message || "Failed.",
    )
    if (res.status === "successful") await load()
  }

  async function resolveEscalation(id: string) {
    const res = await adminService.resolveEscalation(id, "bot_active")
    setMessage(
      res.status === "successful"
        ? "Escalation resolved — returned to bot."
        : res.message || "Failed.",
    )
    if (res.status === "successful") await load()
  }

  if (loading) {
    return (
      <AdminShell>
        <AdminPageHeader title="Approvals" subtitle="Loading queue…" />
        <div className="dashboard-grid-2 animate-pulse">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="min-h-[12rem] rounded-[20px] bg-slate-100 dark:bg-slate-800"
            />
          ))}
        </div>
      </AdminShell>
    )
  }

  const reviewCount = data?.reviews.length ?? 0
  const templateCount = data?.templates.length ?? 0
  const escalationCount = data?.escalations.length ?? 0
  const numberCount = data?.numbers.length ?? 0

  return (
    <AdminShell wide>
      <AdminPageHeader
        title="Approvals"
        subtitle="Reviews, WhatsApp templates, escalations, and number provisioning."
      />

      {message ? <AdminAlert tone="success">{message}</AdminAlert> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection
          title="Pending reviews"
          count={reviewCount}
          action={<AdminViewAllLink href="/admin/approvals/reviews" />}
        >
          {!reviewCount ? (
            <p className="text-sm text-slate-500">No reviews awaiting approval.</p>
          ) : (
            <div className="space-y-3">
              {data!.reviews.slice(0, PREVIEW_LIMIT).map((r) => (
                <AdminListCard
                  key={r.id}
                  title={r.authorName}
                  meta={`${r.practice?.name ?? "Unknown clinic"} · ${r.rating}★`}
                  body={r.body}
                  actions={
                    <AdminButton size="sm" onClick={() => void approveReview(r.id)}>
                      Publish
                    </AdminButton>
                  }
                />
              ))}
              {reviewCount > PREVIEW_LIMIT ? (
                <p className="text-center text-xs text-slate-500">
                  +{reviewCount - PREVIEW_LIMIT} more — use View all
                </p>
              ) : null}
            </div>
          )}
        </AdminSection>

        <AdminSection
          title="Message templates"
          count={templateCount}
          action={<AdminViewAllLink href="/admin/approvals/templates" />}
        >
          {!templateCount ? (
            <p className="text-sm text-slate-500">No pending templates.</p>
          ) : (
            <div className="space-y-3">
              {data!.templates.slice(0, PREVIEW_LIMIT).map((t) => (
                <AdminListCard
                  key={t.id}
                  title={t.name}
                  meta={`${t.category} · ${t.practice?.name || "Platform"}`}
                  body={
                    <AdminBadge tone={statusTone(t.status)}>{t.status}</AdminBadge>
                  }
                  actions={
                    <AdminButton size="sm" onClick={() => void approveTemplate(t.id)}>
                      Approve
                    </AdminButton>
                  }
                />
              ))}
              {templateCount > PREVIEW_LIMIT ? (
                <p className="text-center text-xs text-slate-500">
                  +{templateCount - PREVIEW_LIMIT} more — use View all
                </p>
              ) : null}
            </div>
          )}
        </AdminSection>

        <AdminSection
          title="WhatsApp escalations"
          count={escalationCount}
          action={<AdminViewAllLink href="/admin/approvals/escalations" />}
        >
          {!escalationCount ? (
            <p className="text-sm text-slate-500">Queue is clear.</p>
          ) : (
            <div className="space-y-3">
              {data!.escalations.slice(0, PREVIEW_LIMIT).map((e) => (
                <AdminListCard
                  key={e.id}
                  title={e.patientPhone}
                  meta={e.practice?.name}
                  body={<AdminBadge tone="amber">{e.status}</AdminBadge>}
                  actions={
                    <AdminButton
                      size="sm"
                      onClick={() => void resolveEscalation(e.id)}
                    >
                      Return to bot
                    </AdminButton>
                  }
                />
              ))}
              {escalationCount > PREVIEW_LIMIT ? (
                <p className="text-center text-xs text-slate-500">
                  +{escalationCount - PREVIEW_LIMIT} more — use View all
                </p>
              ) : null}
            </div>
          )}
        </AdminSection>

        <AdminSection
          title="Numbers awaiting go-live"
          count={numberCount}
          action={<AdminViewAllLink href="/admin/approvals/numbers" />}
        >
          {!numberCount ? (
            <p className="text-sm text-slate-500">No numbers in verification.</p>
          ) : (
            <div className="space-y-3">
              {data!.numbers.slice(0, PREVIEW_LIMIT).map((n) => (
                <AdminListCard
                  key={n.id}
                  title={<span className="tabular-nums">{n.phoneNumber}</span>}
                  meta={n.practice?.name || "Unassigned"}
                  body={
                    <AdminBadge tone={statusTone(n.status)}>{n.status}</AdminBadge>
                  }
                />
              ))}
              {numberCount > PREVIEW_LIMIT ? (
                <p className="text-center text-xs text-slate-500">
                  +{numberCount - PREVIEW_LIMIT} more — use View all
                </p>
              ) : null}
            </div>
          )}
        </AdminSection>
      </div>
    </AdminShell>
  )
}
