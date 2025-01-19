export default function PendingAppointments() {
  return (
    <div role="status" className="mt-5 flex flex-col gap-4 px-2 animate-pulse">
      {[...Array(4)].map((_, idx) => (
        <div key={`pending-appointment-${idx}`} className="space-y-1.5">
          <div className="h-6 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60 max-w-64 mb-2" />
          <div className="h-4 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60" />
          <div className="h-4 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60" />
          <div className="h-4 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60 max-w-52" />
          <div className="h-4 bg-gray-300/80 rounded-sm dark:bg-neutral-700/60 max-w-40" />
        </div>
      ))}

      <span className="sr-only">Loading...</span>
    </div>
  )
}
