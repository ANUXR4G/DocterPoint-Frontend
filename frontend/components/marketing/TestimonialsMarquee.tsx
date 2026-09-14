"use client"

import Image from "next/image"

export type TestimonialItem = {
  quote: string
  name: string
  role: string
  img: string
}

function TestimonialCard({ quote, name, role, img }: TestimonialItem) {
  return (
    <article className="dashboard-insight-card w-[min(100vw-2rem,22rem)] shrink-0 sm:w-[24rem]">
      <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        &ldquo;{quote}&rdquo;
      </p>
      <div className="mt-4 flex items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full">
          <Image
            src={img}
            alt=""
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
            {name}
          </p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {role}
          </p>
        </div>
      </div>
    </article>
  )
}

type Props = {
  items: readonly TestimonialItem[]
}

export default function TestimonialsMarquee({ items }: Props) {
  const track = [...items, ...items]

  return (
    <section className="border-t border-slate-100 bg-sky-50/40 py-16 dark:border-white/10 dark:bg-slate-800/30 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          Patient testimonials
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-600 dark:text-slate-400">
          Hear from those we&apos;ve cared for
        </p>
      </div>

      <div className="relative mt-10 overflow-hidden">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-sky-50 via-sky-50/80 to-transparent sm:w-20 dark:from-slate-800/90 dark:via-slate-800/50"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-sky-50 via-sky-50/80 to-transparent sm:w-20 dark:from-slate-800/90 dark:via-slate-800/50"
          aria-hidden
        />

        <div className="flex w-max gap-4 px-4 animate-testimonials-marquee hover:[animation-play-state:paused] motion-reduce:hidden">
          {track.map((t, index) => (
            <TestimonialCard key={`${t.name}-${index}`} {...t} />
          ))}
        </div>

        <div className="hidden flex-wrap justify-center gap-4 px-4 motion-reduce:flex">
          {items.map((t) => (
            <TestimonialCard key={t.name} {...t} />
          ))}
        </div>
      </div>
    </section>
  )
}
