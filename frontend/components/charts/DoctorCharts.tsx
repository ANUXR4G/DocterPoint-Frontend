"use client"

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
  if (!metrics.length) {
    return (
      <p className="flex h-full items-center justify-center text-sm text-neutral-500">
        No appointment data for this period
      </p>
    )
  }
  const totals = metrics.map(
    (m) => m.male + m.female + (m.others ?? 0) + (m.unknown ?? 0),
  )
  const previous = metrics.map(
    (m) =>
      (m.compareMale ?? 0) +
      (m.compareFemale ?? 0) +
      (m.compareOthers ?? 0) +
      (m.compareUnknown ?? 0),
  )

  return (
    <Line
      data={{
        labels: metrics.map((m) =>
          active === "day" || active === "month"
            ? m.name
            : m.name.substring(0, 3),
        ),
        datasets: [
          {
            label: isYoy ? "This year" : "Appointments",
            data: totals,
            borderColor: "#22d3ee",
            backgroundColor: "rgba(34, 211, 238, 0.18)",
            fill: !isYoy,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: "#22d3ee",
          },
          ...(isYoy
            ? [
                {
                  label: "Last year",
                  data: previous,
                  borderColor: "#94a3b8",
                  backgroundColor: "transparent",
                  borderDash: [6, 4],
                  fill: false,
                  tension: 0.35,
                  pointRadius: 3,
                  pointBackgroundColor: "#94a3b8",
                },
              ]
            : []),
        ],
      }}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: isYoy,
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
