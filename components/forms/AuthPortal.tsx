"use client"

import { Suspense, useEffect, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { motion } from "framer-motion"
import AuthShell from "@/components/layout/AuthShell"
import RoleAuthForm, {
  type AuthAudience,
  type AuthMode,
} from "@/components/forms/RoleAuthForm"
import { cn } from "@/lib/utils"

type AuthPortalProps = {
  audience: AuthAudience
  initialMode?: AuthMode
}

function AuthPortalHeader({
  audience,
  mode,
  compact = false,
}: {
  audience: AuthAudience
  mode: AuthMode
  compact?: boolean
}) {
  const isRegister = mode === "register"

  const titleClass = compact
    ? "text-xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-white sm:text-2xl"
    : "mt-2 text-center text-2xl font-semibold tracking-[-0.04em] text-slate-900 dark:text-white sm:mt-3 sm:text-3xl md:text-4xl"

  const wrapClass = compact
    ? "mb-3 space-y-1 text-left sm:mb-4"
    : ""

  const eyebrow = (label: string) => (
    <p
      className={
        compact
          ? "text-xs font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-sky-400"
          : "text-center text-sm font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-sky-400"
      }
    >
      {label}
    </p>
  )

  const subtitle = (text: string) => (
    <p
      className={
        compact
          ? "max-w-2xl text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:text-sm"
          : "mx-auto mt-2 max-w-prose text-center text-xs leading-relaxed text-slate-600 dark:text-slate-400 sm:mt-3 sm:text-sm"
      }
    >
      {text}
    </p>
  )

  if (audience === "clinic") {
    return (
      <div className={wrapClass}>
        {eyebrow("For clinics")}
        <h1 className={titleClass}>
          {isRegister ? "Register your clinic" : "Clinic login"}
        </h1>
        {subtitle(
          isRegister
            ? "Create the clinic owner account. Add doctors later from the clinic dashboard — independent doctor registrations cannot join."
            : "Owners and admins only. Clinic-staff doctors sign in at Doctor Login.",
        )}
      </div>
    )
  }

  if (audience === "doctor") {
    return (
      <div className={wrapClass}>
        {eyebrow("For doctors")}
        <h1 className={titleClass}>
          {isRegister ? "Create doctor account" : "Doctor login"}
        </h1>
        {subtitle(
          isRegister
            ? "Independent solo practice — clinics cannot add this account later. Clinic staff are created from the clinic dashboard."
            : "For independent doctors and clinic-added staff. Clinic owners managing the practice use Clinic Login.",
        )}
      </div>
    )
  }

  if (audience === "admin") {
    return (
      <div className={wrapClass}>
        {eyebrow("Platform admin")}
        <h1 className={titleClass}>Admin login</h1>
        {subtitle(
          "Full control over patients, clinics, doctors, bookings, payments, and approvals.",
        )}
      </div>
    )
  }

  return (
    <div className={wrapClass}>
      {eyebrow("For patients")}
      <h1 className={titleClass}>
        {isRegister ? "Create patient account" : "Welcome back"}
      </h1>
      {subtitle(
        isRegister
          ? "Upload a government ID to autofill your details, then finish registration."
          : "Book doctors, manage appointments, and track your health.",
      )}
    </div>
  )
}

const DEMO_CREDENTIALS: Record<
  AuthAudience,
  { email: string; password: string; note?: string }[]
> = {
  clinic: [
    {
      email: "dr.demo@glucoguide.com",
      password: "Demo@12345",
      note: "Clinic owner",
    },
  ],
  doctor: [
    {
      email: "dr.solo@glucoguide.com",
      password: "Demo@12345",
      note: "Independent solo doctor",
    },
    {
      email: "dr.staff@glucoguide.com",
      password: "Demo@12345",
      note: "Clinic-added staff doctor",
    },
    {
      email: "dr.demo@glucoguide.com",
      password: "Demo@12345",
      note: "Clinic owner (also practices)",
    },
  ],
  patient: [
    {
      email: "patient1@example.com",
      password: "Demo@12345",
    },
  ],
  admin: [
    {
      email: "admin@glucoguide.com",
      password: "Demo@12345",
      note: "Platform administrator",
    },
  ],
}

function DemoCredentials({ audience }: { audience: AuthAudience }) {
  const rows = DEMO_CREDENTIALS[audience]
  return (
    <div className="mt-5 space-y-2 overflow-x-auto border-t border-sky-100 pt-4 text-left text-xs leading-relaxed dark:border-white/10">
      <p className="font-semibold uppercase tracking-[0.08em] text-slate-500">
        Demo accounts
      </p>
      <ul className="space-y-1.5">
        {rows.map((row) => (
          <li key={row.email} className="break-words">
            <span className="font-medium text-slate-800 dark:text-slate-200">{row.email}</span>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="font-medium text-slate-800 dark:text-slate-200">{row.password}</span>
            {row.note ? (
              <span className="text-slate-500"> — {row.note}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AuthPortalBody({
  audience,
  initialMode,
}: {
  audience: AuthAudience
  initialMode: AuthMode
}) {
  const searchParams = useSearchParams()
  const modeParam = searchParams.get("mode")
  const resolvedInitial: AuthMode =
    modeParam === "register" || modeParam === "login" ? modeParam : initialMode

  const [mode, setMode] = useState<AuthMode>(resolvedInitial)
  const isRegister = mode === "register"
  const compactLayout = isRegister

  useEffect(() => {
    if (modeParam === "register" || modeParam === "login") {
      setMode(modeParam)
    }
  }, [modeParam])

  const containerMax = isRegister ? "max-w-[1199px]" : "max-w-md"

  return (
    <motion.div
      layout
      transition={{ type: "spring", stiffness: 280, damping: 32 }}
      className={cn(
        "mx-auto w-full min-w-0 self-start px-0",
        containerMax,
        !isRegister && "max-w-md",
        compactLayout && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <AuthPortalHeader audience={audience} mode={mode} compact={compactLayout} />

      <div
        className={cn(
          "overflow-hidden rounded-2xl border border-sky-100 bg-white shadow-lg shadow-blue-600/5 transition-[padding] duration-300 dark:border-white/10 dark:bg-slate-900 dark:shadow-none",
          compactLayout
            ? "mt-2 flex min-h-0 flex-1 flex-col p-3 sm:p-4 lg:p-5"
            : "mt-4 p-4 sm:mt-6 sm:p-6 md:p-8",
        )}
      >
        <RoleAuthForm
          audience={audience}
          initialMode={resolvedInitial}
          onModeChange={setMode}
          compact={compactLayout}
        />

        {mode === "login" ? <DemoCredentials audience={audience} /> : null}
      </div>

      <p
        className={cn(
          "text-center text-sm text-slate-500 dark:text-slate-400",
          compactLayout ? "mt-3 shrink-0" : "mt-6",
        )}
      >
        <Link href="/login" className="font-semibold text-blue-600 hover:underline dark:text-sky-400">
          ← All login options
        </Link>
      </p>
    </motion.div>
  )
}

export default function AuthPortal({
  audience,
  initialMode = "login",
}: AuthPortalProps) {
  return (
    <AuthShell active="login">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-md self-start">
            <p className="text-center text-sm text-slate-500">Loading…</p>
          </div>
        }
      >
        <AuthPortalBody audience={audience} initialMode={initialMode} />
      </Suspense>
    </AuthShell>
  )
}
