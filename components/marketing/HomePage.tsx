"use client"

import Image from "next/image"
import Link from "next/link"
import { useState } from "react"
import {
  IconArrowRight,
  IconCalendar,
  IconChevronDown,
  IconHeartHandshake,
  IconNotes,
  IconPill,
  IconStethoscope,
  IconUser,
  IconVideo,
} from "@tabler/icons-react"
import { InsightStatCard } from "@/components/dashboard/InsightStatCard"
import SiteNavbar from "@/components/layout/SiteNavbar"
import TestimonialsMarquee from "@/components/marketing/TestimonialsMarquee"

const SERVICES = [
  {
    icon: IconVideo,
    title: "Online consultations",
    body: "Book video or in-clinic visits with verified doctors near you.",
    tone: "blue" as const,
  },
  {
    icon: IconCalendar,
    title: "Booking & appointments",
    body: "Pick a time slot or walk-in token — confirmations sent instantly.",
    tone: "green" as const,
  },
  {
    icon: IconNotes,
    title: "Visit records",
    body: "Keep appointment history and clinic notes in one patient profile.",
    tone: "rose" as const,
  },
  {
    icon: IconStethoscope,
    title: "Clinic directory",
    body: "Search by specialty, city, and fees before you book.",
    tone: "blue" as const,
  },
  {
    icon: IconPill,
    title: "Diabetes care",
    body: "Endocrinology and diabetes clinics with queue and slot booking.",
    tone: "blue" as const,
  },
] as const

const STEPS = [
  {
    n: 1,
    title: "Create your profile",
    body: "Sign up as a patient or register your clinic in minutes.",
  },
  {
    n: 2,
    title: "Choose your service",
    body: "Browse practices, compare fees, and pick slot or token booking.",
  },
  {
    n: 3,
    title: "Meet your doctor",
    body: "Get reminders, track visits, and manage bookings from one place.",
  },
] as const

const TESTIMONIALS = [
  {
    quote: "Booked a morning slot without calling the clinic. Confirmation arrived in seconds.",
    name: "Priya M.",
    role: "Patient",
    img: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=200&auto=format&fit=crop",
  },
  {
    quote: "Our queue finally matches the floor. Staff love the live status updates.",
    name: "Dr. Rohan K.",
    role: "Clinic owner",
    img: "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=200&auto=format&fit=crop",
  },
  {
    quote: "Token booking from my phone — I knew exactly when to walk in.",
    name: "Sneha R.",
    role: "Patient",
    img: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=200&auto=format&fit=crop",
  },
  {
    quote: "Upcoming and past visits in one place — I signed in once and never looked back.",
    name: "Ravi K.",
    role: "Patient",
    img: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop",
  },
  {
    quote: "I picked a slot on the practice page and got a confirmation link. No hold music.",
    name: "Anita D.",
    role: "Patient, Bangalore",
    img: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=200&auto=format&fit=crop",
  },
] as const

const SPECIALISTS = [
  {
    name: "Dr. Ananya Sharma",
    specialty: "Endocrinologist",
    bio: "Diabetes and thyroid care with same-day slot booking at City Care Clinic.",
    img: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=600&auto=format&fit=crop",
    href: "/practices",
  },
  {
    name: "Dr. Mark Lee",
    specialty: "General physician",
    bio: "Family medicine with token-based walk-in queues for busy clinics.",
    img: "https://images.unsplash.com/photo-1622253692010-333f2da6031d?q=80&w=600&auto=format&fit=crop",
    href: "/practices",
  },
] as const

const TONE_ICON_BG: Record<
  (typeof SERVICES)[number]["tone"],
  string
> = {
  blue: "bg-sky-100 text-blue-600",
  green: "bg-emerald-100 text-emerald-600",
  rose: "bg-rose-100 text-rose-600",
}

function BookingBar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`relative z-10 mx-auto w-full max-w-5xl px-4 sm:px-6 ${className}`}
    >
      <div className="dashboard-panel flex flex-col gap-3 !rounded-[20px] p-4 sm:flex-row sm:items-center sm:gap-2 sm:p-3">
        <label className="flex flex-1 flex-col gap-1 px-2">
          <span className="text-xs font-medium text-slate-500">Select doctor</span>
          <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-slate-700">
            <IconUser className="size-4 text-blue-500" />
            <span>Any specialist</span>
            <IconChevronDown className="ml-auto size-4 text-slate-400" />
          </div>
        </label>
        <label className="flex flex-1 flex-col gap-1 px-2">
          <span className="text-xs font-medium text-slate-500">Select service</span>
          <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-slate-700">
            <IconStethoscope className="size-4 text-blue-500" />
            <span>Clinic visit</span>
            <IconChevronDown className="ml-auto size-4 text-slate-400" />
          </div>
        </label>
        <label className="flex flex-1 flex-col gap-1 px-2">
          <span className="text-xs font-medium text-slate-500">Date</span>
          <div className="flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-slate-700">
            <IconCalendar className="size-4 text-blue-500" />
            <span>Pick a date</span>
            <IconChevronDown className="ml-auto size-4 text-slate-400" />
          </div>
        </label>
        <Link
          href="/practices"
          className="mt-1 inline-flex h-12 items-center justify-center rounded-full bg-blue-600 px-8 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 sm:mt-6 sm:h-11"
        >
          Book now
        </Link>
      </div>
    </div>
  )
}

function HelpDeskForm() {
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSent(true)
  }

  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="dashboard-hero mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            Reach our{" "}
            <span className="text-blue-600">Help Desk</span> for support
          </h2>
          <p className="mt-3 text-sm text-slate-600 sm:text-base">
            Questions about booking, clinic registration, or your account?
            We&apos;re here to help.
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="mx-auto mt-8 flex max-w-xl flex-col gap-3 sm:flex-row"
        >
          <input
            type="text"
            required
            placeholder="Your name"
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <input
            type="email"
            required
            placeholder="Email address"
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="submit"
            className="h-12 rounded-full bg-blue-600 px-6 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            {sent ? "Thanks!" : "Contact us"}
          </button>
        </form>
      </div>
    </section>
  )
}

function HomeFooter() {
  return (
    <footer className="border-t border-slate-100 bg-sky-50/50 py-14 dark:border-white/10 dark:bg-slate-900/40">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative flex size-8 items-center justify-center">
              <span className="absolute left-0.5 top-1 size-3 rounded-full bg-sky-400" />
              <span className="absolute bottom-1 right-0.5 size-3 rounded-full bg-blue-600" />
            </span>
            <span className="text-lg font-bold text-slate-900 dark:text-white">
              GlucoGuide
            </span>
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Your trusted partner in digital healthcare — find doctors, book visits,
            and run clinic queues in one place.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            Support
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>
              <Link href="/about" className="hover:text-blue-600">
                About
              </Link>
            </li>
            <li>
              <Link href="/practices" className="hover:text-blue-600">
                Find care
              </Link>
            </li>
            <li>
              <Link href="/login" className="hover:text-blue-600">
                Login
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            Services
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>
              <Link href="/practices" className="hover:text-blue-600">
                Book appointment
              </Link>
            </li>
            <li>
              <Link href="/login/clinic" className="hover:text-blue-600">
                Clinic portal
              </Link>
            </li>
            <li>
              <Link href="/login/doctor" className="hover:text-blue-600">
                Doctor portal
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
            Legal
          </h4>
          <ul className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <li>
              <Link href="/privacy" className="hover:text-blue-600">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:text-blue-600">
                Terms of use
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-6xl px-4 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} GlucoGuide. All rights reserved.
      </p>
    </footer>
  )
}

export default function HomePage() {
  return (
    <div className="dashboard-app min-h-[100dvh] overflow-x-clip antialiased">
      <div className="dashboard-app-canvas min-h-[100dvh]">
        <SiteNavbar ready active="home" />

        <div className="px-2 pb-4 sm:px-3 sm:pb-6 md:px-4 md:pb-8">
          <div className="dashboard-frame mx-auto w-full max-w-[1400px] overflow-hidden rounded-[28px] border border-slate-100/90 bg-white shadow-[0_24px_64px_-32px_rgba(37,99,235,0.22)] dark:border-white/10 dark:bg-slate-900">
            <main className="text-slate-900 dark:text-slate-100">
              {/* Hero — full viewport */}
              <section className="dashboard-hero relative flex h-screen min-h-[600px] flex-col overflow-hidden !rounded-none !border-0 !shadow-none pt-20 sm:pt-24">
                <div aria-hidden className="dashboard-hero-glow" />
                <div className="relative mx-auto flex flex-1 w-full max-w-6xl items-center px-4 sm:px-6 lg:px-8">
                  <div className="grid w-full items-center gap-8 lg:grid-cols-2 lg:gap-12">
                    <div>
                      <p className="text-sm font-medium text-slate-500">
                        Healthcare platform
                      </p>
                      <h1 className="mt-2 text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:text-5xl lg:text-[3.25rem]">
                        Your{" "}
                        <span className="text-blue-600 dark:text-sky-400">
                          trusted partner
                        </span>
                        <br />
                        in digital healthcare.
                      </h1>
                      <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-400">
                        GlucoGuide connects patients with clinics and doctors —
                        book slots or tokens online, manage your queue, and keep
                        every visit in sync.
                      </p>
                      <Link
                        href="/practices"
                        className="mt-8 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700"
                      >
                        Book an appointment
                        <IconArrowRight className="size-4" />
                      </Link>
                      <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="rounded-full border border-sky-100 bg-white px-3 py-1 shadow-sm dark:border-white/10 dark:bg-slate-800">
                          Web
                        </span>
                        <span className="rounded-full border border-sky-100 bg-white px-3 py-1 shadow-sm dark:border-white/10 dark:bg-slate-800">
                          Mobile app
                        </span>
                        <span className="rounded-full border border-sky-100 bg-white px-3 py-1 shadow-sm dark:border-white/10 dark:bg-slate-800">
                          WhatsApp ready
                        </span>
                      </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
                      <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-full border-8 border-white shadow-2xl shadow-blue-200/50 dark:border-slate-800 sm:max-w-[380px]">
                        <Image
                          src="https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?q=80&w=800&auto=format&fit=crop"
                          alt="Doctor"
                          fill
                          className="object-cover"
                          priority
                          sizes="(max-width: 768px) 340px, 380px"
                        />
                      </div>
                      <div className="absolute left-0 top-8 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-lg sm:left-4 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white">
                          2k+ active users
                        </p>
                        <p className="text-[11px] text-slate-500">
                          booking every month
                        </p>
                      </div>
                      <div className="absolute bottom-12 right-0 rounded-2xl border border-sky-100 bg-white px-4 py-3 shadow-lg sm:right-4 dark:border-white/10 dark:bg-slate-800">
                        <p className="text-xs font-semibold text-blue-600 dark:text-sky-400">
                          ★★★★★
                        </p>
                        <p className="text-[11px] text-slate-500">
                          5400+ happy patients
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <BookingBar className="shrink-0 pb-6 sm:pb-8" />
              </section>

              {/* Platform stats — dashboard insight cards */}
              <section className="border-t border-slate-100 px-4 py-10 dark:border-white/10 sm:px-6 lg:px-8">
                <div className="dashboard-grid-4 mx-auto max-w-6xl">
                  <InsightStatCard
                    title="Active bookings"
                    value="2k+"
                    subtitle="Patients booking every month"
                    href="/practices"
                    icon="calendar"
                    tone="blue"
                  />
                  <InsightStatCard
                    title="Clinics listed"
                    value="150+"
                    subtitle="Practices across India"
                    href="/practices"
                    icon="monitoring"
                    tone="rose"
                  />
                  <InsightStatCard
                    title="Positive feedback"
                    value="98%"
                    subtitle="Patient satisfaction rate"
                    href="/about"
                    icon="heart-w-pulse"
                    tone="green"
                  />
                  <InsightStatCard
                    title="Online booking"
                    value="24/7"
                    subtitle="Slots and tokens anytime"
                    href="/login/patient"
                    icon="energy"
                    tone="blue"
                  />
                </div>
              </section>

              {/* Services */}
              <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                <div className="mx-auto max-w-6xl">
                  <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                    Top <span className="text-blue-600">services</span> we offer
                  </h2>
                  <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-600 dark:text-slate-400">
                    Everything you need to find care, book visits, and stay
                    connected with your clinic.
                  </p>
                  <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                    {SERVICES.map(({ icon: Icon, title, body, tone }) => (
                      <div key={title} className="dashboard-insight-card group">
                        <div
                          className={`flex size-11 items-center justify-center rounded-2xl ${TONE_ICON_BG[tone]}`}
                        >
                          <Icon className="size-5" stroke={1.75} />
                        </div>
                        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                          Service
                        </p>
                        <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">
                          {title}
                        </h3>
                        <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                          {body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Story */}
              <section className="border-t border-slate-100 bg-sky-50/40 px-4 py-16 dark:border-white/10 dark:bg-slate-800/30 sm:px-6 sm:py-20 lg:px-8">
                <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
                  <div className="dashboard-panel relative aspect-[4/3] overflow-hidden !p-0">
                    <Image
                      src="https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1200&auto=format&fit=crop"
                      alt="Medical team"
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                    />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                      GlucoGuide&apos;s story:{" "}
                      <span className="text-blue-600">Get to know us</span>
                    </h2>
                    <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
                      We built GlucoGuide so patients can book clinic visits
                      without phone tag, and clinics can publish schedules, run
                      live queues, and grow their practice online.
                    </p>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
                      From solo doctors to multi-specialty clinics, one platform
                      handles slots, tokens, confirmations, and the front-desk
                      queue.
                    </p>
                    <Link
                      href="/about"
                      className="mt-6 inline-flex rounded-full bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
                    >
                      Learn more about us
                    </Link>
                  </div>
                </div>
              </section>

              {/* How it works */}
              <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                <div className="mx-auto max-w-6xl">
                  <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                    How <span className="text-blue-600">our platform</span> works
                  </h2>
                  <div className="mt-12 grid items-center gap-12 lg:grid-cols-2">
                    <ol className="space-y-6">
                      {STEPS.map((step) => (
                        <li
                          key={step.n}
                          className="dashboard-row flex !min-h-0 items-start gap-4 !py-4"
                        >
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                            {step.n}
                          </span>
                          <div>
                            <h3 className="font-bold text-slate-900 dark:text-white">
                              {step.title}
                            </h3>
                            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                              {step.body}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="relative">
                      <div className="dashboard-panel relative aspect-[4/5] overflow-hidden !p-0">
                        <Image
                          src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=800&auto=format&fit=crop"
                          alt="Doctor with patient"
                          fill
                          className="object-cover"
                          sizes="(max-width: 1024px) 100vw, 400px"
                        />
                      </div>
                      <div className="absolute -bottom-4 -left-4 rounded-2xl bg-blue-600 px-5 py-4 text-white shadow-lg">
                        <IconHeartHandshake className="size-8" />
                        <p className="mt-2 text-sm font-semibold">Best care with</p>
                        <p className="text-xs text-blue-100">
                          a team of specialists
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <TestimonialsMarquee items={TESTIMONIALS} />

              {/* Specialists */}
              <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
                <div className="mx-auto max-w-6xl">
                  <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
                    Masters of medicine:{" "}
                    <span className="text-blue-600">Meet our specialists</span>
                  </h2>
                  <div className="mt-10 grid gap-6 lg:grid-cols-2">
                    {SPECIALISTS.map((doc) => (
                      <div
                        key={doc.name}
                        className="flex flex-col overflow-hidden rounded-3xl bg-blue-600 text-white shadow-xl sm:flex-row"
                      >
                        <div className="relative h-48 w-full shrink-0 sm:h-auto sm:w-44">
                          <Image
                            src={doc.img}
                            alt={doc.name}
                            fill
                            className="object-cover"
                            sizes="176px"
                          />
                        </div>
                        <div className="flex flex-1 flex-col justify-center p-6">
                          <p className="text-xs font-medium uppercase tracking-wider text-blue-200">
                            {doc.specialty}
                          </p>
                          <h3 className="mt-1 text-xl font-bold">{doc.name}</h3>
                          <p className="mt-2 text-sm leading-relaxed text-blue-100">
                            {doc.bio}
                          </p>
                          <Link
                            href={doc.href}
                            className="mt-4 inline-flex w-fit rounded-full bg-white px-5 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                          >
                            Book appointment
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <HelpDeskForm />
            </main>

            <HomeFooter />
          </div>
        </div>
      </div>
    </div>
  )
}
