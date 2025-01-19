import React from "react"

export default function BloodPressureSkeleton() {
  return (
    <React.Fragment>
      <div
        role="status"
        className="animate-pulse col-span-2 lg:order-5 lg:row-span-2 bg-gray-300/80 dark:bg-neutral-700/75 rounded-xl h-80 lg:min-h-[396px]"
      />
      <span className="sr-only">Loading...</span>
    </React.Fragment>
  )
}
