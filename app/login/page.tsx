import Link from "next/link"
import AuthShell from "@/components/layout/AuthShell"

export default function LoginHubPage() {
  return (
    <AuthShell active="login">
      <div className="mx-auto w-full min-w-0 max-w-lg self-start text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-blue-600 dark:text-sky-400">
          Account
        </p>
        <h1 className="mt-3 text-[clamp(2rem,8vw,3rem)] font-semibold tracking-[-0.04em] text-slate-900 dark:text-white sm:text-5xl">
          Welcome back
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-slate-600 dark:text-slate-400">
          Patient, clinic, doctor, and admin portals are separate — pick the one that
          matches how you use GlucoGuide.
        </p>

        <div className="mt-10 space-y-4 text-left">
          <Link
            href="/login/patient"
            className="block rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-blue-600/5 transition hover:border-blue-200 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/80"
          >
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              Patient login
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Book doctors, view appointments, and manage health records.
            </p>
            <p className="mt-3 border-t border-sky-100 pt-3 text-xs text-slate-500 dark:border-white/10">
              Demo:{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                patient1@example.com
              </span>{" "}
              / Demo@12345
            </p>
          </Link>

          <Link
            href="/login/clinic"
            className="block rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-blue-600/5 transition hover:border-blue-200 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/80"
          >
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              Clinic login
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Register or run a practice — schedules, directory, and queue
              settings.
            </p>
            <p className="mt-3 border-t border-sky-100 pt-3 text-xs text-slate-500 dark:border-white/10">
              Demo:{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                dr.demo@glucoguide.com
              </span>{" "}
              / Demo@12345
            </p>
          </Link>

          <Link
            href="/login/doctor"
            className="block rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-blue-600/5 transition hover:border-blue-200 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/80"
          >
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              Doctor login
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Day-to-day queue, calendar, and patient bookings for providers.
            </p>
            <p className="mt-3 border-t border-sky-100 pt-3 text-xs text-slate-500 dark:border-white/10">
              Demo:{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                dr.demo@glucoguide.com
              </span>{" "}
              / Demo@12345
            </p>
          </Link>

          <Link
            href="/login/admin"
            className="block rounded-2xl border border-sky-100 bg-white p-6 shadow-md shadow-blue-600/5 transition hover:border-blue-200 hover:shadow-lg dark:border-white/10 dark:bg-slate-900/80"
          >
            <p className="text-lg font-semibold text-slate-900 dark:text-white">
              Admin login
            </p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Platform control — patients, clinics, doctors, payments, and approvals.
            </p>
            <p className="mt-3 border-t border-sky-100 pt-3 text-xs text-slate-500 dark:border-white/10">
              Demo:{" "}
              <span className="font-medium text-slate-800 dark:text-slate-200">
                admin@glucoguide.com
              </span>{" "}
              / Demo@12345
            </p>
          </Link>
        </div>
      </div>
    </AuthShell>
  )
}
