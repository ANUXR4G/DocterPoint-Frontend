export default function GreetingSkeleton() {
  return (
    <div
      role="status"
      className="animate-pulse flex flex-col w-full max-w-3xl 2xl:max-w-4xl"
    >
      <div className="mt-5 2xl:mt-8 mx-auto">
        <div className="size-24 min-w-24 2xl:size-32 2xl:min-w-32 rounded-full bg-gray-300/80 dark:bg-neutral-700/75" />
      </div>
      <div className="p-2 w-full mt-3 flex flex-col gap-2">
        <div className="max-w-36 2xl:max-w-48 h-6 2xl:h-8 mt-2 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />

        {/* fields */}
        <div className="mt-3 grid grid-cols-2 gap-4 2xl:gap-y-5">
          {[...Array(6)].map((_, idx) => (
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

        {/* buttons */}
        <div className={`ml-auto flex gap-2 pb-4 mt-32`}>
          <div className="h-8 2xl:h-9 w-20 2xl:w-24 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
          <div className="h-8 2xl:h-9 w-20 2xl:w-24 rounded-sm bg-gray-300/80 dark:bg-neutral-700/75" />
        </div>
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
