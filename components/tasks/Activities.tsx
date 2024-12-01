"use client"

import React from "react"
import { useActivities } from "@/hooks/useActivities"
import { RECOMMENDATIONS } from "@/lib/dummy/recommendations"
import Tasks from "./Tasks"

export default function Activities() {
  // get all the recommedations/tasks/medications for today
  const { data } = useActivities(RECOMMENDATIONS)

  const activities = Object.keys(data).map((key) =>
    data[key].map((item: any) => {
      return {
        // set type based on the required field
        type: item.duration ? "exercise" : item.amount ? "medication" : "meal",
        name: item.name ? item.name : item.time,
        time: key,
        // make it optional based on it's existence
        ...(item.duration && { duration: item.duration }),
      }
    })
  )

  return (
    <div className="mt-3 flex flex-col gap-3">
      {activities.map((item, idx) => (
        <Tasks key={`activities-pending-today-${idx}`} data={item} />
      ))}
    </div>
  )
}
