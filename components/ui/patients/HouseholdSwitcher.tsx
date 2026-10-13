"use client"

import { useEffect, useState } from "react"
import { proctoService } from "@/lib/services/procto"
import { cookies } from "@/utils/cookies"

type Person = {
  id: string
  name: string
  relationship: string | null
  kind: "self" | "child"
  withName: string | null
}

export default function HouseholdSwitcher() {
  const [people, setPeople] = useState<Person[]>([])
  const [currentId, setCurrentId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void proctoService.getHousehold().then((res) => {
      if (cancelled || res.status !== "successful" || !res.data) return
      const data = res.data as { people?: Person[]; currentId?: string }
      setPeople(Array.isArray(data.people) ? data.people : [])
      setCurrentId(data.currentId || "")
    })
    return () => {
      cancelled = true
    }
  }, [])

  const current = people.find((p) => p.id === currentId)
  if (people.length < 2 && !current?.withName) return null

  async function open(id: string) {
    if (id === currentId || busy) return
    setBusy(true)
    setError("")
    const res = await proctoService.switchHousehold(id)
    const token = String(res.access_token || res.token || "")
    if (res.status !== "successful" || !token) {
      setBusy(false)
      setError(res.message || "Could not open that profile.")
      return
    }
    cookies.setCookie("access_token", token, 60 * 60 * 24)
    if (res.refresh_token) {
      cookies.setCookie("refresh_token", String(res.refresh_token), 60 * 60 * 24 * 7)
    }
    window.location.reload()
  }

  return (
    <div className="relative mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        People on this number
      </p>
      {current?.kind === "child" && current.withName ? (
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Child · with {current.withName}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {people.map((p) => {
          const active = p.id === currentId
          const label = p.kind === "child" ? `${p.name} · child` : p.name
          return (
            <button
              key={p.id}
              type="button"
              disabled={busy || active}
              onClick={() => void open(p.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                active
                  ? "bg-blue-600 text-white"
                  : "border border-slate-200 text-slate-700 dark:border-white/15 dark:text-slate-200"
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  )
}
