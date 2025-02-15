export default function DoctorDashboardSkeleton() {
  return (
    <div role="status" className="max-w-[1536px] mx-auto animate-pulse">
      <div className="ml-1 mb-3 w-64 h-12 lg:h-16 rounded-sm lg:rounded-md bg-gray-300/80 dark:bg-neutral-700/75" />
      <div className="grid grid-cols-4 lg:mt-3 gap-3">
        <div className="hidden lg:block rounded-[26px] col-span-4 lg:order-2 lg:col-span-1 lg:row-span-2 bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="min-h-40 w-full col-span-4 lg:order-1 lg:col-span-3 flex gap-2 md:gap-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={`analytics-skeleton-${i}`}
              className="size-full rounded-[26px] bg-gray-300/80 min-h-40 dark:bg-neutral-700/75"
            />
          ))}
        </div>
        <div className="h-80 rounded-[26px] sm:h-[336px] w-full lg:order-3 col-span-4 lg:col-span-3 bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="w-full mt-4 lg:order-4 col-span-4">
          <div className="ml-1 mb-3 w-64 h-12 lg:h-14 rounded-sm lg:rounded-md bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="rounded-[26px] min-h-64 bg-gray-300/80 dark:bg-neutral-700/75" />
        </div>
        <div className="w-full mt-4 lg:order-5 col-span-4">
          <div className="ml-1 mb-3 w-64 h-12 lg:h-14 rounded-sm lg:rounded-md bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="rounded-[26px] min-h-64 bg-gray-300/80 dark:bg-neutral-700/75" />
        </div>
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
