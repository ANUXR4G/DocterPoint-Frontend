"use client"

import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { format, isValid, parse } from "date-fns"
import {
  IconActivity,
  IconDroplet,
  IconHeartbeat,
  IconMail,
  IconMapPin,
  IconPhone,
  IconSettings,
  IconUser,
} from "@tabler/icons-react"

import { firey } from "@/utils"
import { TPatient } from "@/types"

import { useApi } from "@/hooks/useApi"

import { resolveUploadUrl } from "@/lib/uploads"
import { patientService } from "@/lib/services/patient"
import { CHRONIC_CONDITIONS_LABEL } from "@/lib/dummy/lifestyles"
import {
  calculateProfileCompleteness,
  completenessToneClasses,
} from "@/lib/profileCompleteness"
import ProfileCompletenessChart from "@/components/dashboard/ProfileCompletenessChart"
import {
  fetchUserProfile,
  USER_PROFILE_QUERY_KEY,
} from "@/lib/queries/profile"

import { ProfileEditModal, ProfileSkeleton } from "@/components"

function display(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return null
  return String(value)
}

function formatDob(raw?: string | null) {
  if (!raw) return null
  try {
    const parsed = parse(raw, "MM/dd/yyyy", new Date())
    if (isValid(parsed)) return format(parsed, "dd MMM yyyy")
  } catch {
    /* fall through */
  }
  const asDate = new Date(raw)
  if (isValid(asDate)) return format(asDate, "dd MMM yyyy")
  return raw
}

function avatarSrc(profile: TPatient) {
  if (profile.imgSrc) return resolveUploadUrl(profile.imgSrc)
  const gender = (profile.gender || "male").toLowerCase()
  const key = gender === "female" ? "female" : "male"
  return `https://res.cloudinary.com/firey/image/upload/v1708816390/iub/${key}_12.jpg`
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}: {
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string; stroke?: number }>
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="dashboard-panel">
      <div className="mb-4 flex min-h-12 flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-blue-600 dark:bg-blue-500/15 dark:text-sky-400">
            <Icon className="size-[18px]" stroke={1.75} />
          </span>
          <div>
            <h2 className="dashboard-section-title">{title}</h2>
            {subtitle ? (
              <p className="dashboard-section-sub">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function DetailRow({
  label,
  value,
  icon: Icon,
  className = "",
}: {
  label: string
  value: string | null
  icon?: React.ComponentType<{ className?: string; stroke?: number }>
  className?: string
}) {
  const shown = value ?? "Not provided"
  const empty = !value

  return (
    <div
      className={`flex gap-3 rounded-xl border border-slate-100 bg-sky-50/40 px-3.5 py-3 dark:border-white/10 dark:bg-white/5 ${className}`}
    >
      {Icon ? (
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-sky-400">
          <Icon className="size-4" stroke={1.75} />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-600 dark:text-slate-400">
          {label}
        </p>
        <p
          className={`mt-0.5 break-words text-sm font-medium leading-snug ${
            empty
              ? "text-slate-400 dark:text-slate-500"
              : "text-slate-900 dark:text-white"
          }`}
        >
          {shown}
        </p>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const { data: profile, isLoading, isFetching } = useApi(
    USER_PROFILE_QUERY_KEY,
    async (_, token) => fetchUserProfile(token),
    {
      select: (data) => firey.convertKeysToCamelCase(data) as TPatient,
    },
  )

  const { data: healthRecord } = useApi(
    [`patients:monitorings:${profile?.id}`],
    (_, token) => patientService.getPatientHealthRecord(token),
    {
      enabled: !!profile?.id,
    },
  )

  const isMedicalEmpty = healthRecord && Array.isArray(healthRecord)
  const medical = !isMedicalEmpty ? healthRecord : null

  const profilePending = !hydrated || isLoading || (isFetching && !profile)

  if (profilePending) return <ProfileSkeleton />

  if (!profile) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-panel text-center">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Profile unavailable
          </h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            We couldn&apos;t load your profile. Try signing in again.
          </p>
          <Link
            href="/login/patient"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Sign in
          </Link>
        </div>
      </div>
    )
  }

  const chronicConditions =
    medical?.previous_diabetes_records &&
    medical.previous_diabetes_records.length > 0
      ? firey.makeString(medical.previous_diabetes_records)
      : null

  const missingBasics = !profile.profession || !profile.contactNumber
  const completion = calculateProfileCompleteness(profile, medical)
  const completionTone = completenessToneClasses(completion.percent)

  return (
    <div className="dashboard-page">
      <header className="dashboard-hero">
        <div aria-hidden className="dashboard-hero-glow" />

        <div className="relative flex min-h-[7.5rem] flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-4 sm:gap-5">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-full ring-4 ring-white shadow-lg shadow-blue-200/40 dark:ring-white/15 sm:size-24">
              <Image
                fill
                src={avatarSrc(profile)}
                sizes="96px"
                alt={profile.name || "Profile photo"}
                className="object-cover"
                priority
              />
            </div>
            <div className="min-w-0">
              <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">
                Your profile
              </p>
              <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl">
                {profile.name || "Patient"}
              </h1>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600 dark:text-slate-400">
                {[profile.profession, profile.address]
                  .filter(Boolean)
                  .join(" · ") ||
                  "Add profession and address to complete your profile"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
            <ProfileEditModal />
            <Link
              href="/settings"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
            >
              <IconSettings className="size-4" stroke={1.75} />
              Settings
            </Link>
          </div>
        </div>

        {missingBasics ? (
          <p className="relative mt-5 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-slate-200">
            Some details are missing. Use <strong>Edit profile</strong> to add
            your profession and contact number.
          </p>
        ) : null}
      </header>

      <section
        className={`dashboard-panel ring-1 ${completionTone.ring} ${completionTone.border}`}
      >
        <ProfileCompletenessChart
          percent={completion.percent}
          filled={completion.filled}
          total={completion.total}
          missing={completion.missing}
        />
      </section>

      {/* Quick stats */}
      <div className="dashboard-grid-4">
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
            <IconPhone className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
            Emergency contact
          </p>
          <p className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white">
            {display(profile.emergencyNumber) ?? "—"}
          </p>
        </div>
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
            <IconDroplet className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
            Blood group
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {display(medical?.blood_group) ?? "—"}
          </p>
        </div>
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300">
            <IconActivity className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
            Weight
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {medical?.weight != null ? `${medical.weight} lb` : "—"}
          </p>
        </div>
        <div className="dashboard-insight-card">
          <span className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            <IconHeartbeat className="size-5" stroke={1.75} />
          </span>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-400">
            Height
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
            {medical?.height != null ? `${medical.height} ft` : "—"}
          </p>
        </div>
      </div>

      <div className="dashboard-grid-2 items-start">
        <SectionCard
          title="Basic information"
          subtitle="How clinics and the app identify you"
          icon={IconUser}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow label="Full name" value={display(profile.name)} icon={IconUser} />
            <DetailRow
              label="Date of birth"
              value={formatDob(profile.dateOfBirth)}
              icon={IconUser}
            />
            <DetailRow label="Gender" value={display(profile.gender)} />
            <DetailRow label="Profession" value={display(profile.profession)} />
            <DetailRow
              label="Contact number"
              value={display(profile.contactNumber)}
              icon={IconPhone}
            />
            <DetailRow
              label="Emergency contact"
              value={display(profile.emergencyNumber)}
              icon={IconPhone}
            />
            <DetailRow
              label="Email"
              value={display(profile.email)}
              icon={IconMail}
              className="sm:col-span-2"
            />
            <DetailRow
              label="Address"
              value={display(profile.address)}
              icon={IconMapPin}
              className="sm:col-span-2"
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Medical history"
          subtitle="Used for visit context and care planning"
          icon={IconHeartbeat}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailRow
              label="Weight"
              value={medical?.weight != null ? `${medical.weight} lb` : null}
              icon={IconActivity}
            />
            <DetailRow
              label="Height"
              value={medical?.height != null ? `${medical.height} ft` : null}
              icon={IconActivity}
            />
            <DetailRow
              label="Blood group"
              value={display(medical?.blood_group)}
              icon={IconDroplet}
            />
            <DetailRow
              label="Smoking status"
              value={display(medical?.smoking_status)}
            />
            <DetailRow
              label="Physical activity"
              value={display(medical?.physical_activity)}
              className="sm:col-span-2"
            />
            <DetailRow
              label={CHRONIC_CONDITIONS_LABEL}
              value={chronicConditions}
              icon={IconHeartbeat}
              className="sm:col-span-2"
            />
          </div>

          {!medical ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-center text-sm text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              No medical record yet. Use Edit profile to add health details.
            </p>
          ) : null}
        </SectionCard>
      </div>
    </div>
  )
}
