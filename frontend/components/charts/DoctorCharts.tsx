"use client"

import { useEffect, useState } from "react"
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import { Bar, Doughnut, Line } from "react-chartjs-2"
import type { AnalyticMetrics, TypeAnalyticsParam } from "@/types"

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
)

const PERIOD_TITLES: Record<TypeAnalyticsParam, string> = {
  day: "Today by hour",
  week: "This week by day",
  month: "This month by day",
  year: "This year by month",
  yoy: "This year vs last year",
}

export const ANALYTICS_PERIOD_OPTIONS: {
  value: TypeAnalyticsParam
  label: string
}[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "year", label: "Yearly" },
  { value: "yoy", label: "This vs last year" },
]

export function AnalyticsPeriodFilter({
  value,
  onChange,
}: {
  value: TypeAnalyticsParam
  onChange: (v: TypeAnalyticsParam) => void
}) {
  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="group"
      aria-label="Analytics period"
    >
      {ANALYTICS_PERIOD_OPTIONS.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
              active
                ? "bg-cyan-600 text-white border-cyan-600"
                : "bg-white dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-gray-200 dark:border-neutral-600 hover:bg-gray-50 dark:hover:bg-neutral-700"
            }`}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

type GenderBarProps = {
  data: AnalyticMetrics[]
  active: TypeAnalyticsParam
}

export function PatientGenderBarChart({ data, active }: GenderBarProps) {
  const isYoy = active === "yoy"
  const metrics = data.length ? data : []

  if (!metrics.length) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-neutral-500">
        No patient data for this period
      </p>
    )
  }

  if (isYoy) {
    const thisYear = metrics.map(
      (m) => m.male + m.female + (m.others ?? 0) + (m.unknown ?? 0),
    )
    const lastYear = metrics.map(
      (m) =>
        (m.compareMale ?? 0) +
        (m.compareFemale ?? 0) +
        (m.compareOthers ?? 0) +
        (m.compareUnknown ?? 0),
    )
    return (
      <Bar
        data={{
          labels: metrics.map((m) => m.name.substring(0, 3)),
          datasets: [
            {
              label: "This year",
              data: thisYear,
              backgroundColor: "#22d3ee",
              borderRadius: 6,
            },
            {
              label: "Last year",
              data: lastYear,
              backgroundColor: "#94a3b8",
              borderRadius: 6,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, color: "#7e7e7e" },
            },
            title: {
              display: true,
              text: PERIOD_TITLES.yoy,
              color: "#737373",
              font: { size: 13, weight: 600 },
            },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: "#7e7e7e" },
            },
            y: {
              beginAtZero: true,
              ticks: { color: "#7e7e7e", precision: 0 },
              grid: { color: "rgba(120,120,120,0.12)" },
            },
          },
        }}
      />
    )
  }

  return (
    <Bar
      data={{
        labels: metrics.map((m) =>
          active === "day" || active === "month"
            ? m.name
            : m.name.substring(0, 3),
        ),
        datasets: [
          {
            label: "Male",
            data: metrics.map((m) => m.male),
            backgroundColor: "#76e283",
            borderRadius: 6,
            stack: "gender",
          },
          {
            label: "Female",
            data: metrics.map((m) => m.female),
            backgroundColor: "#40a6f5",
            borderRadius: 6,
            stack: "gender",
          },
          {
            label: "Others",
            data: metrics.map((m) => m.others ?? 0),
            backgroundColor: "#a78bfa",
            borderRadius: 6,
            stack: "gender",
          },
          {
            label: "Not set",
            data: metrics.map((m) => m.unknown ?? 0),
            backgroundColor: "#94a3b8",
            borderRadius: 6,
            stack: "gender",
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, color: "#7e7e7e" },
          },
          title: {
            display: true,
            text: PERIOD_TITLES[active],
            color: "#737373",
            font: { size: 13, weight: 600 },
          },
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: "#7e7e7e", maxTicksLimit: 12 },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { color: "#7e7e7e", precision: 0 },
            grid: { color: "rgba(120,120,120,0.12)" },
          },
        },
      }}
    />
  )
}

export function AppointmentTrendLineChart({
  data,
  active = "week",
}: {
  data: AnalyticMetrics[]
  active?: TypeAnalyticsParam
}) {
  const isYoy = active === "yoy"
  const metrics = data.length ? data : []
  const maxIdx = Math.max(metrics.length - 1, 0)
  const [range, setRange] = useState({ start: 0, end: maxIdx })

  useEffect(() => {
    setRange({ start: 0, end: Math.max(metrics.length - 1, 0) })
  }, [active, metrics.length])

  if (!metrics.length) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-neutral-500">
        No appointment data for this period
      </p>
    )
  }

  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  const visible = metrics.slice(start, end + 1)

  const labels = visible.map((m) =>
    active === "day" || active === "month" ? m.name : m.name.substring(0, 3),
  )

  const completed = visible.map((m) => m.completed ?? 0)
  const cancelled = visible.map((m) => m.cancelled ?? 0)
  const rescheduled = visible.map((m) => m.rescheduled ?? 0)

  const yoyCompleted = visible.map((m) => m.compareCompleted ?? 0)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1">
        <Line
          data={{
            labels,
            datasets: isYoy
              ? [
                  {
                    label: "Completed (this year)",
                    data: completed,
                    borderColor: "#10b981",
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: "#10b981",
                    fill: false,
                  },
                  {
                    label: "Completed (last year)",
                    data: yoyCompleted,
                    borderColor: "#94a3b8",
                    borderDash: [6, 4],
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: "#94a3b8",
                    fill: false,
                  },
                  {
                    label: "Cancelled",
                    data: cancelled,
                    borderColor: "#ef4444",
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 2,
                    pointBackgroundColor: "#ef4444",
                    fill: false,
                  },
                  {
                    label: "Rescheduled",
                    data: rescheduled,
                    borderColor: "#f59e0b",
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 2,
                    pointBackgroundColor: "#f59e0b",
                    fill: false,
                  },
                ]
              : [
                  {
                    label: "Completed",
                    data: completed,
                    borderColor: "#10b981",
                    backgroundColor: "rgba(16, 185, 129, 0.08)",
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: "#10b981",
                    fill: false,
                  },
                  {
                    label: "Cancelled",
                    data: cancelled,
                    borderColor: "#ef4444",
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: "#ef4444",
                    fill: false,
                  },
                  {
                    label: "Rescheduled",
                    data: rescheduled,
                    borderColor: "#f59e0b",
                    backgroundColor: "transparent",
                    tension: 0.35,
                    pointRadius: 3,
                    pointBackgroundColor: "#f59e0b",
                    fill: false,
                  },
                ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: true,
                position: "bottom",
                labels: { usePointStyle: true, color: "#7e7e7e", padding: 12 },
              },
              title: {
                display: true,
                text: `${PERIOD_TITLES[active]} · status`,
                color: "#737373",
                font: { size: 13, weight: 600 },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: "#7e7e7e", maxTicksLimit: 12 },
              },
              y: {
                beginAtZero: true,
                ticks: { color: "#7e7e7e", precision: 0 },
                grid: { color: "rgba(120,120,120,0.12)" },
              },
            },
          }}
        />
      </div>

      {metrics.length > 1 ? (
        <div className="shrink-0 space-y-1.5 border-t border-neutral-200/80 pt-2 dark:border-neutral-700">
          <div className="flex items-center justify-between gap-2 text-[11px] text-neutral-500">
            <span>
              <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                {visible[0]?.name}
              </span>
              {" – "}
              <span className="font-semibold text-neutral-700 dark:text-neutral-200">
                {visible[visible.length - 1]?.name}
              </span>
            </span>
            <button
              type="button"
              className="rounded px-1.5 py-0.5 font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-950/40"
              onClick={() => setRange({ start: 0, end: maxIdx })}
            >
              Reset
            </button>
          </div>
          <div className="relative h-7">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-neutral-200 dark:bg-neutral-700">
              <div
                className="absolute h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-400 to-rose-500"
                style={{
                  left: `${(start / Math.max(maxIdx, 1)) * 100}%`,
                  right: `${((maxIdx - end) / Math.max(maxIdx, 1)) * 100}%`,
                }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={maxIdx}
              value={range.start}
              aria-label="Chart start"
              className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-2 w-full -translate-y-1/2 appearance-none bg-transparent accent-emerald-600 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-600 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-600"
              onChange={(e) => {
                const next = Number(e.target.value)
                setRange((r) => ({
                  start: next,
                  end: Math.max(next, r.end),
                }))
              }}
            />
            <input
              type="range"
              min={0}
              max={maxIdx}
              value={range.end}
              aria-label="Chart end"
              className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-2 w-full -translate-y-1/2 appearance-none bg-transparent accent-rose-500 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-rose-500 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-rose-500"
              onChange={(e) => {
                const next = Number(e.target.value)
                setRange((r) => ({
                  start: Math.min(r.start, next),
                  end: next,
                }))
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function GenderDoughnutChart({
  male,
  female,
  others = 0,
  unknown = 0,
  compareMale,
  compareFemale,
  compareOthers = 0,
  compareUnknown = 0,
  mode = "gender",
}: {
  male: number
  female: number
  others?: number
  unknown?: number
  compareMale?: number
  compareFemale?: number
  compareOthers?: number
  compareUnknown?: number
  mode?: "gender" | "yoy"
}) {
  if (mode === "yoy") {
    const thisYear = male + female + others + unknown
    const lastYear =
      (compareMale ?? 0) +
      (compareFemale ?? 0) +
      compareOthers +
      compareUnknown
    const empty = thisYear === 0 && lastYear === 0
    return (
      <Doughnut
        data={{
          labels: ["This year", "Last year"],
          datasets: [
            {
              data: empty ? [1, 1] : [thisYear, lastYear],
              backgroundColor: empty
                ? ["#d4d4d4", "#a3a3a3"]
                : ["#22d3ee", "#94a3b8"],
              borderWidth: 0,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          cutout: "62%",
          plugins: {
            legend: {
              position: "bottom",
              labels: { usePointStyle: true, color: "#7e7e7e" },
            },
            title: {
              display: true,
              text: empty ? "No YoY data yet" : "This vs last year",
              color: "#737373",
              font: { size: 13, weight: 600 },
            },
          },
        }}
      />
    )
  }

  const empty = male === 0 && female === 0 && others === 0 && unknown === 0
  return (
    <Doughnut
      data={{
        labels: ["Male", "Female", "Others", "Not set"],
        datasets: [
          {
            data: empty ? [1, 1, 1, 1] : [male, female, others, unknown],
            backgroundColor: empty
              ? ["#d4d4d4", "#a3a3a3", "#e5e5e5", "#cfcfcf"]
              : ["#76e283", "#40a6f5", "#a78bfa", "#94a3b8"],
            borderWidth: 0,
          },
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        cutout: "62%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { usePointStyle: true, color: "#7e7e7e" },
          },
          title: {
            display: true,
            text: empty ? "No gender split yet" : "Gender mix",
            color: "#737373",
            font: { size: 13, weight: 600 },
          },
        },
      }}
    />
  )
}
