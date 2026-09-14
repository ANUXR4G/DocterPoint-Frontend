import type { Metadata } from "next"
import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"

export const metadata: Metadata = {
  title: "About — GlucoGuide",
  description: "What GlucoGuide is and who it's for.",
}

export default function AboutPage() {
  return (
    <PublicShell active="about">
      <div className="max-w-2xl min-w-0">
        <p className="text-sm font-medium text-slate-500">About</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Clinic booking{" "}
          <span className="text-blue-600 dark:text-sky-400">without the clutter</span>
        </h1>
        <p className="mt-6 text-base leading-relaxed text-slate-600 dark:text-slate-400">
          Patients find doctors and book visits. Clinics run queues, schedules,
          and appointments from one account. Built for diabetes and primary-care
          workflows in India.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Link
            href="/practices"
            className="inline-flex h-11 items-center justify-center rounded-full bg-blue-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700"
          >
            Browse clinics
          </Link>
          <Link
            href="/login/clinic"
            className="inline-flex h-11 items-center justify-center rounded-full border border-slate-200 bg-white px-6 text-sm font-semibold text-slate-900 transition hover:border-blue-300 dark:border-white/15 dark:bg-white/5 dark:text-white"
          >
            For clinics
          </Link>
        </div>
      </div>
    </PublicShell>
  )
}
