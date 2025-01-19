import React from "react"

export default function BloodGlucoseSkeleton() {
  return (
    <React.Fragment>
      <div
        role="status"
        className="animate-pulse col-span-2 lg:order-1 lg:row-span-2 bg-gray-300/80 dark:bg-neutral-700/75 rounded-xl min-h-80 lg:min-h-full"
      />
      <span className="sr-only">Loading...</span>
    </React.Fragment>
  )
}
