import React from "react"

export default function HealthInfoSkeleton() {
  return (
    <React.Fragment>
      <div
        role="status"
        className="animate-pulse row-span-2 lg:col-span-1 lg:order-2 lg:min-h-[600px] bg-gray-300/80 dark:bg-neutral-700/75 rounded-xl"
      />
      <span className="sr-only">Loading...</span>
    </React.Fragment>
  )
}
