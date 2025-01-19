import React from "react"

export default function PendingActivities() {
  return (
    <div role="status" className="mt-5 flex flex-col gap-5 px-2 animate-pulse">
      {[...Array(5)].map((_, idx) => (
        <div key={`pending-activity-skeleton-${idx}`} className="space-y-1.5">
          <div className="h-3.5 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60 max-w-48" />
          <div className="h-3.5 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60 max-w-32" />
          <div className="h-3.5 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60 max-w-56" />
        </div>
      ))}

      <span className="sr-only">Loading...</span>
    </div>
  )
}
