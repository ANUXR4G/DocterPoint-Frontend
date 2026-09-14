import type { Metadata } from "next"
import PublicShell from "@/components/layout/PublicShell"

export const metadata: Metadata = {
  title: "Terms — GlucoGuide",
}

export default function TermsPage() {
  return (
    <PublicShell>
      <article className="max-w-2xl min-w-0">
        <p className="text-sm font-medium text-slate-500">Legal</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
          Terms
        </h1>
        <p className="mt-6 text-base leading-relaxed text-slate-600 dark:text-slate-400">
          By using GlucoGuide you agree to use the service for legitimate care
          booking and practice management. Clinics are responsible for the
          accuracy of their schedules and patient communications.
        </p>
      </article>
    </PublicShell>
  )
}
