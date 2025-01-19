import React from "react"

export default function ConsultBannerSkeleton() {
  return (
    <React.Fragment>
      <div
        role="status"
        className="animate-pulse lg:col-span-1 lg:row-span-2 lg:order-4 min-h-64 bg-gray-300/80 dark:bg-neutral-700/75 rounded-xl"
      />
      <span className="sr-only">Loading...</span>
    </React.Fragment>
  )
}
