"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import AdminPageHeader from "@/components/admin/AdminPageHeader"
import AdminShell from "@/components/admin/AdminShell"
import AdminSupportHelpDesk from "@/components/admin/AdminSupportHelpDesk"
import AdminSupportNotifications from "@/components/admin/AdminSupportNotifications"
import { adminService } from "@/lib/services/admin"

type Tab = "help" | "notifications"

function AdminSupportPageInner() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const userParam = searchParams.get("user")

  const [tab, setTab] = useState<Tab>("help")
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [unreadTotal, setUnreadTotal] = useState(0)

  const refreshUnread = useCallback(async () => {
    const res = await adminService.supportHelpThreads()
    if (res.status === "successful" && res.data) {
      setUnreadTotal(res.data.totalUnread ?? 0)
    }
  }, [])

  useEffect(() => {
    if (tabParam === "notifications") setTab("notifications")
    else setTab("help")
  }, [tabParam])

  useEffect(() => {
    if (userParam) setSelectedUserId(userParam)
  }, [userParam])

  useEffect(() => {
    void refreshUnread()
  }, [refreshUnread])

  return (
    <AdminShell wide>
      <AdminPageHeader
        eyebrow="Ops"
        title="Support"
        subtitle="Help desk messages from the in-app Help popup, plus platform notification delivery."
      />

      <div className="mb-4 flex flex-wrap gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-700">
        <button
          type="button"
          onClick={() => setTab("help")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "help"
              ? "bg-[var(--theme-primary)] text-white"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          Help desk
          {unreadTotal > 0 ? (
            <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {unreadTotal}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          onClick={() => setTab("notifications")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            tab === "notifications"
              ? "bg-[var(--theme-primary)] text-white"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          Notifications
        </button>
      </div>

      {tab === "help" ? (
        <AdminSupportHelpDesk
          selectedUserId={selectedUserId}
          onSelectUser={setSelectedUserId}
          onThreadsRefresh={refreshUnread}
        />
      ) : (
        <AdminSupportNotifications />
      )}
    </AdminShell>
  )
}

export default function AdminSupportPage() {
  return (
    <Suspense
      fallback={
        <AdminShell wide>
          <p className="text-sm text-neutral-500">Loading support…</p>
        </AdminShell>
      }
    >
      <AdminSupportPageInner />
    </Suspense>
  )
}
