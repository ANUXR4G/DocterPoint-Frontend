export default function ProfileSkeleton() {
  return (
    <div
      role="status"
      className="animate-pulse mx-auto flex flex-col w-full max-w-4xl"
    >
      <div className="mt-5 center flex-col 2xl:mt-8 mx-auto gap-2">
        <div className="size-24 min-w-24 2xl:size-32 2xl:min-w-32 rounded-full bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="center flex-col gap-1">
          <div className="w-20 h-3 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="w-32 h-3 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="w-16 h-7 rounded-full bg-gray-300/80 dark:bg-neutral-700/75" />
        </div>
      </div>
      <div className="p-2 w-full mt-3 flex flex-col gap-2">
        <div className="max-w-36 2xl:max-w-48 h-6 2xl:h-8 mt-2 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />

        {/* fields */}
        <div className="mt-3 grid grid-cols-2 gap-4 2xl:gap-y-3">
          {[...Array(8)].map((_, idx) => (
            <div key={`p-info-sk-f-${idx}`} className="flex flex-col gap-1">
              <div className="h-4 max-w-24 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
              <div className="h-8 2xl:h-9 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
            </div>
          ))}

          <div className="col-span-2">
            <div className="flex flex-col gap-1">
              <div className="h-4 max-w-20 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
              <div className="h-20 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
            </div>
          </div>
        </div>
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
