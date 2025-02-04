export default function HospitalSkeleton() {
  return (
    <div role="status" className="animate-pulse">
      <div className="w-full h-36 mx-auto max-w-[88%] lg:max-w-2xl rounded-lg bg-gray-300/80 dark:bg-neutral-700/75" />
      <div className="mt-7 w-full h-64 sm:h-[456px] bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
      <div className="ml-auto mt-2 w-24 h-9 bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />

      <div className="mt-7 w-full h-64 sm:h-96 bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />

      <span className="sr-only">Loading...</span>
    </div>
  )
}
