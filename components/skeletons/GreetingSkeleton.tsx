import React from "react"

export default function GreetingSkeleton() {
  return (
    <div role="status" className="-mt-1 animate-pulse">
      <div className="h-6 bg-gray-300/80 rounded-sm dark:bg-neutral-700/75 max-w-40 lg:max-w-64 mb-2" />
      <div className="h-4 bg-gray-300/80 rounded-sm dark:bg-neutral-700/75 max-w-72 lg:max-w-sm" />

      <span className="sr-only">Loading...</span>
    </div>
  )
}
