"use client"

import { useProfile } from "@/hooks/useProfile"

export default function LandingGreeting() {
  const { data } = useProfile()

  if (!data || !data.name) return <div />

  return (
    <div>
      <h2 className="text-xl font-bold">Hey, {data.name.split(" ")[0]}</h2>
      <span className="text-sm font-semibold opacity-90">
        How are you feeling today?
      </span>
    </div>
  )
}
