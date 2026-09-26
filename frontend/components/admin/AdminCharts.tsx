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
  Tooltip,
  Legend,
  Filler,
} from "chart.js"
import { Bar, Doughnut, Line } from "react-chartjs-2"
import type { AdminAnalytics } from "@/lib/services/admin"
import { formatInr } from "@/components/admin/AdminMetricCard"
import { useAppContext } from "@/hooks/useAppContext"
import { getThemeColor } from "@/lib/themeColors"

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
)

const gridColor = "rgba(148, 163, 184, 0.15)"
const tickColor = "#64748b"

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: "bottom" as const,
      labels: { usePointStyle: true, color: tickColor, padding: 16 },
    },
  },
}

type Props = {
  analytics: AdminAnalytics
}

function useAccent() {
  const { themeColor } = useAppContext()
  return getThemeColor(themeColor).primary
}

function withSeriesFilter<T extends { label: string }>(
  datasets: T[],
  visible?: Set<string> | null,
): T[] {
  if (!visible || visible.size === 0) return datasets
  const filtered = datasets.filter((d) => visible.has(d.label))
  return filtered.length ? filtered : datasets
}

export function RevenueTrendChart({ analytics }: Props) {
  const accent = useAccent()
  return (
    <Line
      data={{
        labels: analytics.monthlyTrend.map((m) => m.label),
        datasets: [
          {
            label: "New subscription revenue",
            data: analytics.monthlyTrend.map((m) => m.revenue),
            borderColor: accent,
            backgroundColor: `${accent}1f`,
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: accent,
          },
        ],
      }}
      options={{
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${formatInr(Number(ctx.raw))}`,
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor } },
          y: {
            beginAtZero: true,
            ticks: {
              color: tickColor,
              callback: (v) => formatInr(Number(v)),
            },
            grid: { color: gridColor },
          },
        },
      }}
    />
  )
}

export function MonthComparisonChart({ analytics }: Props) {
  const accent = useAccent()
  const { comparison } = analytics
  return (
    <Bar
      data={{
        labels: ["Revenue", "Bookings"],
        datasets: [
          {
            label: "This month",
            data: [comparison.revenue.thisMonth, comparison.bookings.thisMonth],
            backgroundColor: accent,
            borderRadius: 8,
          },
          {
            label: "Last month",
            data: [comparison.revenue.lastMonth, comparison.bookings.lastMonth],
            backgroundColor: "#94a3b8",
            borderRadius: 8,
          },
        ],
      }}
      options={{
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const label = ctx.dataset.label ?? ""
                const raw = Number(ctx.raw)
                if (ctx.label === "Revenue") return ` ${label}: ${formatInr(raw)}`
                return ` ${label}: ${raw}`
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor } },
          y: {
            beginAtZero: true,
            ticks: { color: tickColor },
            grid: { color: gridColor },
          },
        },
      }}
    />
  )
}

export function BookingsTrendChart({
  analytics,
  visibleSeries,
}: Props & { visibleSeries?: Set<string> }) {
  return (
    <Bar
      data={{
        labels: analytics.monthlyTrend.map((m) => m.label),
        datasets: withSeriesFilter(
          [
            {
              label: "Bookings",
              data: analytics.monthlyTrend.map((m) => m.bookings),
              backgroundColor: "#10b981",
              borderRadius: 8,
            },
            {
              label: "New patients",
              data: analytics.monthlyTrend.map((m) => m.patients),
              backgroundColor: "#38bdf8",
              borderRadius: 8,
            },
          ],
          visibleSeries,
        ),
      }}
      options={{
        ...baseOptions,
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor } },
          y: {
            beginAtZero: true,
            ticks: { color: tickColor, precision: 0 },
            grid: { color: gridColor },
          },
        },
      }}
    />
  )
}

export function DailyBookingsChart({ analytics }: Props) {
  const rows = analytics.dailyBookings
  const maxDay = rows.length || 1
  const [range, setRange] = useState<{ start: number; end: number }>(() => ({
    start: 1,
    end: maxDay,
  }))

  useEffect(() => {
    setRange({ start: 1, end: Math.max(1, rows.length) })
  }, [analytics.dailyMonthLabel, rows.length])

  const start = Math.min(range.start, range.end)
  const end = Math.max(range.start, range.end)
  const visible = rows.filter((d) => d.day >= start && d.day <= end)

  const labels = visible.map((d) => {
    if (d.date) {
      const dt = new Date(`${d.date}T12:00:00`)
      if (!Number.isNaN(dt.getTime())) {
        return dt.toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
        })
      }
    }
    return String(d.day)
  })

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1">
        <Line
          data={{
            labels,
            datasets: [
              {
                label: "Completed",
                data: visible.map((d) => d.completed ?? 0),
                borderColor: "#10b981",
                backgroundColor: "rgba(16, 185, 129, 0.12)",
                tension: 0.35,
                pointRadius: 3,
                pointBackgroundColor: "#10b981",
                fill: false,
              },
              {
                label: "Cancelled",
                data: visible.map((d) => d.cancelled ?? 0),
                borderColor: "#ef4444",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                tension: 0.35,
                pointRadius: 3,
                pointBackgroundColor: "#ef4444",
                fill: false,
              },
              {
                label: "Rescheduled",
                data: visible.map((d) => d.rescheduled ?? 0),
                borderColor: "#f59e0b",
                backgroundColor: "rgba(245, 158, 11, 0.12)",
                tension: 0.35,
                pointRadius: 3,
                pointBackgroundColor: "#f59e0b",
                fill: false,
              },
            ],
          }}
          options={{
            ...baseOptions,
            plugins: {
              ...baseOptions.plugins,
              legend: {
                position: "bottom",
                labels: { usePointStyle: true, color: tickColor, padding: 14 },
              },
            },
            scales: {
              x: {
                grid: { display: false },
                ticks: { color: tickColor, maxTicksLimit: 10 },
                title: {
                  display: true,
                  text: "Date",
                  color: tickColor,
                },
              },
              y: {
                beginAtZero: true,
                ticks: { color: tickColor, precision: 0 },
                grid: { color: gridColor },
              },
            },
          }}
        />
      </div>

      <div className="shrink-0 space-y-2 border-t border-slate-200/80 pt-3 dark:border-white/10">
        <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Showing{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              day {start}
            </span>{" "}
            –{" "}
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              day {end}
            </span>
            {analytics.dailyMonthLabel
              ? ` · ${analytics.dailyMonthLabel}`
              : null}
          </span>
          <button
            type="button"
            className="rounded-md px-2 py-1 font-semibold text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
            onClick={() => setRange({ start: 1, end: maxDay })}
          >
            Reset
          </button>
        </div>
        <div className="relative h-8">
          <input
            type="range"
            min={1}
            max={maxDay}
            value={range.start}
            aria-label="Start day"
            className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-2 w-full -translate-y-1/2 appearance-none bg-transparent accent-blue-600 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-blue-600"
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
            min={1}
            max={maxDay}
            value={range.end}
            aria-label="End day"
            className="pointer-events-none absolute inset-x-0 top-1/2 z-20 h-2 w-full -translate-y-1/2 appearance-none bg-transparent accent-emerald-600 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-emerald-600 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-emerald-600"
            onChange={(e) => {
              const next = Number(e.target.value)
              setRange((r) => ({
                start: Math.min(r.start, next),
                end: next,
              }))
            }}
          />
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="absolute h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
              style={{
                left: `${((start - 1) / Math.max(maxDay - 1, 1)) * 100}%`,
                right: `${((maxDay - end) / Math.max(maxDay - 1, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="flex justify-between text-[10px] font-medium uppercase tracking-wide text-slate-400">
          <span>Day 1</span>
          <span>Day {maxDay}</span>
        </div>
      </div>
    </div>
  )
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "#10b981",
  TRIALING: "#38bdf8",
  PAST_DUE: "#f59e0b",
  GRACE: "#f97316",
  SUSPENDED: "#ef4444",
  CANCELLED: "#94a3b8",
}

export function SubscriptionDoughnutChart({
  analytics,
  visibleStatuses,
}: Props & { visibleStatuses?: Set<string> }) {
  const rows = analytics.subscriptionBreakdown.filter(
    (s) =>
      !visibleStatuses || visibleStatuses.size === 0 || visibleStatuses.has(s.status),
  )
  const labels = rows.map((s) => s.status)
  const data = rows.map((s) => s.count)
  const colors = labels.map((l) => STATUS_COLORS[l] ?? "#cbd5e1")

  return (
    <Doughnut
      data={{
        labels,
        datasets: [
          {
            data,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 6,
          },
        ],
      }}
      options={{
        ...baseOptions,
        cutout: "62%",
        plugins: {
          ...baseOptions.plugins,
          legend: { position: "right" as const, labels: { color: tickColor } },
        },
      }}
    />
  )
}

export function GrowthLineChart({
  analytics,
  visibleSeries,
}: Props & { visibleSeries?: Set<string> }) {
  const accent = useAccent()
  return (
    <Line
      data={{
        labels: analytics.monthlyTrend.map((m) => m.label),
        datasets: withSeriesFilter(
          [
            {
              label: "New clinics",
              data: analytics.monthlyTrend.map((m) => m.practices),
              borderColor: "#f59e0b",
              tension: 0.35,
            },
            {
              label: "New subscriptions",
              data: analytics.monthlyTrend.map((m) => m.newSubscriptions),
              borderColor: accent,
              tension: 0.35,
            },
          ],
          visibleSeries,
        ),
      }}
      options={{
        ...baseOptions,
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor } },
          y: {
            beginAtZero: true,
            ticks: { color: tickColor, precision: 0 },
            grid: { color: gridColor },
          },
        },
      }}
    />
  )
}
