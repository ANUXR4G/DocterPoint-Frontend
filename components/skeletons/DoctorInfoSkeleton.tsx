export default function DoctorInfoSkeleton() {
  return (
    <div
      role="status"
      className="animate-pulse mx-auto flex flex-col w-full max-w-4xl"
    >
      <div className="mt-5 center flex-col 2xl:mt-8 mx-auto gap-2">
        <div className="size-24 min-w-24 md:size-56 lg:size-80 md:min-w-56 lg:min-w-80 rounded-full md:rounded-lg bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="center mt-3 flex-col gap-1">
          <div className="w-32 h-4 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="w-56 h-4 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="w-32 h-4 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="w-24 h-4 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
        </div>
      </div>

      <div className="mx-auto mt-4 flex w-full h-28 max-w-96 gap-3">
        <div className="w-1/3 h-full bg-gray-300/80 dark:bg-neutral-700/75 rounded-lg" />
        <div className="w-2/3 size-full flex flex-col gap-2">
          <div className="size-full bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
          <div className="size-full bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-2">
        <div className="w-44 h-5 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="w-36 h-5 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="mt-1 w-full h-64 sm:h-[456px] bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
        <div className="ml-auto w-24 h-9 bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
