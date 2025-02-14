"use client"

import { AnalyticMetrics, TypeAnalyticsParam } from "@/types"
import {
  Bar,
  BarChart,
  Legend,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"

type Props = {
  data: AnalyticMetrics[]
  active: TypeAnalyticsParam
}

function CustomTooltip({ active, payload, label, _type }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="max-w-60 bg-white dark:bg-neutral-200 py-4 px-6 text-sm font-medium rounded-xl text-neutral-600">
        <div className="flex items-center gap-1">
          <p className="opacity-80">{_type}</p>
          <p className="text-xl mb-1 font-bold">{label}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full size-3 bg-[#76e283]" />
          <p className="-mt-0.5">{`${payload[0].dataKey} : ${payload[0].value}`}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-full size-3 bg-[#40a6f5]" />
          <p className="-mt-0.5">{`${payload[1].dataKey} : ${payload[1].value}`}</p>
        </div>
      </div>
    )
  }

  return null
}

// Custom Legend Component
function CustomLegend(props: any) {
  const { payload } = props

  return (
    <div className="flex justify-center mt-2 gap-3">
      {payload.map((entry: any, index: any) => (
        <div key={`item-${index}`} className="flex items-center gap-1">
          <div className={`size-3 rounded-full bg-[${entry.color}]`} />
          <span className="-mt-0.5 text-neutral-400 font-medium text-sm">
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function GenderChart({ data, active }: Props) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{
          top: 40,
          bottom: 64,
        }}
      >
        <XAxis
          dataKey="name"
          tickFormatter={(month) => month.substring(0, 3)}
          tick={{ fill: "#7e7e7e" }}
          axisLine={{ stroke: "none" }}
          tickLine={{ stroke: "none" }}
        />
        <Tooltip
          content={<CustomTooltip _type={active} />}
          cursor={{ fill: "transparent" }}
        />
        <Legend content={<CustomLegend />} />
        <Bar
          dataKey="male"
          stackId="a"
          fill="#76e283"
          radius={6}
          activeBar={<Rectangle fill="#737373" />}
        />
        <Bar
          dataKey="female"
          stackId="a"
          fill="#40a6f5"
          radius={6}
          activeBar={<Rectangle fill="#737373" />}
        />
      </BarChart>
    </ResponsiveContainer>
  )
}
