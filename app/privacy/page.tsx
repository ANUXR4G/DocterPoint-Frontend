import type { Metadata } from "next"
import Link from "next/link"
import PublicShell from "@/components/layout/PublicShell"

export const metadata: Metadata = {
  title: "Privacy — GlucoGuide",
}

export default function PrivacyPage() {
  return (
    <PublicShell>
      <article className="max-w-2xl min-w-0 space-y-8">
        <div>
          <p className="text-sm font-medium text-slate-500">Legal</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Privacy
          </h1>
          <p className="mt-6 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            GlucoGuide processes personal data to help you book clinic
            visits. We follow India&apos;s Digital Personal Data Protection
            (DPDP) principles: purpose limitation, consent, and retention
            control. We do not sell personal health information.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            What we collect
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            <li>
              Account details — name, email, and password (or sign-in provider)
              when you register.
            </li>
            <li>
              Phone number — used for booking confirmation, reminders, and
              account contact.
            </li>
            <li>
              Appointment data — clinic, doctor, date/time or token, visit reason
              you provide, and booking status.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            WhatsApp use
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            Clinic WhatsApp lines are for booking coordination only (confirmations,
            reminders, reschedule prompts). We do not use WhatsApp to store or
            exchange clinical notes, prescriptions, or medical records.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Consent
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            When you book, we ask you to consent to storing your name and phone
            for that booking. You can withdraw consent or request changes by
            contacting us. Account holders control profile data from their
            dashboard where available.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Retention &amp; deletion
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            We keep booking and account data only as long as needed to provide
            the service and meet legal obligations. To export or delete your
            personal data, contact support at{" "}
            <a
              className="font-semibold text-blue-600 hover:underline dark:text-sky-400"
              href="mailto:privacy@glucoguide.com"
            >
              privacy@glucoguide.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            Not a telemedicine product
          </h2>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            GlucoGuide is a clinic booking and operations tool. It does
            not provide remote diagnosis, treatment, or telemedicine
            consultations. Care happens at the clinic with your provider.
          </p>
        </section>

        <p className="text-sm text-slate-500">
          Related:{" "}
          <Link
            href="/practices"
            className="font-semibold text-blue-600 hover:underline dark:text-sky-400"
          >
            Find a clinic
          </Link>
        </p>
      </article>
    </PublicShell>
  )
}
