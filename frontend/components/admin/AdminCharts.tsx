"use client"

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
  return (
    <Line
      data={{
        labels: analytics.dailyBookings.map((d) => String(d.day)),
        datasets: [
          {
            label: "Bookings",
            data: analytics.dailyBookings.map((d) => d.count),
            borderColor: "#8b5cf6",
            backgroundColor: "rgba(139, 92, 246, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 2,
          },
        ],
      }}
      options={{
        ...baseOptions,
        plugins: {
          ...baseOptions.plugins,
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor, maxTicksLimit: 10 },
            title: { display: true, text: "Day of month", color: tickColor },
          },
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
