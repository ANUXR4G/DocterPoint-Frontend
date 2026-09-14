"use client"

import React from "react"
import Link from "next/link"
import { Carousel, Card } from "@/components/ui/apple-cards-carousel"

type TestimonialCard = {
  category: string
  title: string
  src: string
  quote: string
  author: string
  role: string
  href: string
  cta: string
}

const TESTIMONIALS: TestimonialCard[] = [
  {
    category: "Patients",
    title: "Booked without calling the desk",
    src: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?q=80&w=2400&auto=format&fit=crop",
    quote:
      "I picked a morning slot on the practice page and got a confirmation link. No hold music.",
    author: "Priya M.",
    role: "Patient, Bangalore",
    href: "/practices",
    cta: "Find care",
  },
  {
    category: "Clinics",
    title: "Queue finally matches the floor",
    src: "https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?q=80&w=2400&auto=format&fit=crop",
    quote:
      "We mark IN PROGRESS and COMPLETED from Today’s Queue. The calendar stays honest.",
    author: "Dr. Rohan K.",
    role: "City Care Clinic",
    href: "/login/doctor",
    cta: "Doctor login",
  },
  {
    category: "Patients",
    title: "My Bookings in one place",
    src: "https://images.unsplash.com/photo-1579684385127-1ef15d508118?q=80&w=2400&auto=format&fit=crop",
    quote:
      "Upcoming and past visits, cancel when I need to — signed in once on GlucoGuide.",
    author: "Ravi K.",
    role: "Patient",
    href: "/login/patient",
    cta: "Patient login",
  },
  {
    category: "Doctors",
    title: "Onboarding took one afternoon",
    src: "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?q=80&w=2400&auto=format&fit=crop",
    quote:
      "Practice profile, location, then schedules. Patients booked the same evening.",
    author: "Dr. Anjali Mehta",
    role: "Mehta Skin Clinic",
    href: "/login/clinic?mode=register",
    cta: "Register clinic",
  },
  {
    category: "Patients",
    title: "Token queues made sense",
    src: "https://images.unsplash.com/photo-1666214280557-f1b5022eb634?q=80&w=2400&auto=format&fit=crop",
    quote:
      "I took a token from the phone and walked in knowing my place in line.",
    author: "Sneha R.",
    role: "Patient, Hyderabad",
    href: "/practices",
    cta: "Browse practices",
  },
  {
    category: "Clinics",
    title: "Front desk on one screen",
    src: "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=2400&auto=format&fit=crop",
    quote:
      "Slots, tokens, and live status — we stopped juggling WhatsApp and paper.",
    author: "Clinic manager",
    role: "Multi-doctor practice",
    href: "/login/doctor",
    cta: "For clinics",
  },
]

function TestimonialContent({
  quote,
  author,
  role,
  href,
  cta,
}: Pick<TestimonialCard, "quote" | "author" | "role" | "href" | "cta">) {
  return (
    <div className="mb-4 rounded-3xl bg-[#f5f5f5] p-8 md:p-14 dark:bg-[#141414]">
      <p className="gg-muted mx-auto max-w-3xl text-base font-sans md:text-2xl">
        <span className="gg-ink font-bold">
          “{quote}”
        </span>
      </p>
      <p className="gg-muted mx-auto mt-6 max-w-3xl text-sm">
        — {author}
        <span className="gg-faint"> · {role}</span>
      </p>
      <div className="mx-auto mt-8 max-w-3xl">
        <Link
          href={href}
          className="inline-flex rounded-[10px] bg-neutral-900 px-[15px] py-[10px] text-[14px] font-medium tracking-[-0.14px] text-white transition hover:bg-[#0099ff] dark:bg-white dark:text-black dark:hover:bg-[#0099ff] dark:hover:text-white"
        >
          {cta}
        </Link>
      </div>
    </div>
  )
}

export default function HomeTestimonials() {
  const cards = TESTIMONIALS.map((item, index) => (
    <Card
      key={item.src + item.title}
      card={{
        src: item.src,
        title: item.title,
        category: item.category,
        content: (
          <TestimonialContent
            quote={item.quote}
            author={item.author}
            role={item.role}
            href={item.href}
            cta={item.cta}
          />
        ),
      }}
      index={index}
    />
  ))

  return (
    <section className="w-full overflow-x-clip py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4">
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[#0f766e] dark:text-[#2dd4bf]">
          Stories
        </p>
        <h2 className="gg-ink mt-4 text-[clamp(1.75rem,4vw,3rem)] font-semibold tracking-[-0.045em]">
          Trusted by clinics and patients
        </h2>
        <p className="gg-muted mt-4 max-w-xl text-[15px] leading-[1.45] tracking-[-0.15px]">
          Real booking and queue workflows — from both sides of GlucoGuide.
        </p>
      </div>
      <Carousel items={cards} />
    </section>
  )
}
