export default function AppointmentSkeleton() {
  return (
    <div role="status" className="animate-pulse flex flex-col w-full">
      <div className="mt-5 h-9 w-36 rounded-md bg-gray-300/80 dark:bg-neutral-700/75 2xl:mt-8 ml-auto" />

      <div className="mt-5 h-7 w-56 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />

      {/* fields */}
      <div className="mt-3 flex flex-col gap-3">
        {[...Array(5)].map((_, idx) => (
          <div
            key={`appointment-info-sk-${idx}`}
            className="h-28 rounded-md sm:h-24 bg-gray-300/80 dark:bg-neutral-700/75"
          />
        ))}
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
