export default function HospitalInfoSkeleton() {
  return (
    <div role="status" className="animate-pulse">
      <div className="flex flex-col items-center text-center">
        <div className="w-[80%] h-28 md:h-16 max-w-3xl rounded-md bg-gray-300/80 dark:bg-neutral-700/75" />

        <div className="mt-5 size-56 min-w-56 md:size-80 md:min-w-80 relative rounded-2xl bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="mt-4 rounded-sm w-[88%] h-10 max-w-lg  bg-gray-300/80 dark:bg-neutral-700/75" />

        <div className="mt-3 rounded-sm w-[60%] max-w-sm h-5  bg-gray-300/80 dark:bg-neutral-700/75" />

        <div className="mt-2 rounded-sm w-[60%] max-w-sm h-5  bg-gray-300/80 dark:bg-neutral-700/75" />

        <div className="mt-3 rounded-sm w-44 max-w-sm h-5  bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="mt-1 rounded-sm w-44 max-w-sm h-5  bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="mt-1 rounded-sm w-44 max-w-sm h-5  bg-gray-300/80 dark:bg-neutral-700/75" />
        <div className="mt-1 rounded-sm w-44 max-w-sm h-5  bg-gray-300/80 dark:bg-neutral-700/75" />

        <div className="w-full mt-8 flex flex-col gap-2">
          <div className="mt-1 w-full h-64 sm:h-[456px] bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
          <div className="ml-auto w-24 h-9 bg-gray-300/80 dark:bg-neutral-700/75 rounded-md" />
        </div>
      </div>
    </div>
  )
}
