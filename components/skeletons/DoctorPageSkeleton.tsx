export default function DoctorPageSkeleton() {
  return (
    <div role="status" className="animate-pulse">
      <div className="w-full bg-gray-300/80 dark:bg-neutral-700/75 max-w-[80%] md:max-w-xl h-16 rounded-md" />

      <div className="mt-12 grid grid-cols-1 xxs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 3xl:grid-cols-5 gap-2 md:gap-3 md:gap-y-4">
        {[...Array(20)].map((_, idx) => (
          <div
            key={`doctor-skeleton-${idx}`}
            className="h-72 xxs:h-44 xs:h-64 lg:h-72 xl:h-80 rounded-md bg-gray-300/80 dark:bg-neutral-700/75 size-full"
          />
        ))}
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
