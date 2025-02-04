export default function MealsPageSkeleton() {
  return (
    <div role="status" className="mt-8 w-full flex flex-col animate-pulse">
      <div className="w-full mx-auto lg:mx-0 h-5 max-w-52 bg-gray-300/80 dark:bg-neutral-700/75" />
      <div className="mt-3 center gap-4 lg:mt-6 xl:justify-start xl:mt-4">
        {[...Array(4)].map((_, idx) => (
          <div
            key={`meal-category-skeleton-${idx}`}
            className="min-w-14 shadow-sm min-h-12 lg:min-w-36 lg:min-h-32 rounded-2xl bg-gray-300/80 dark:bg-neutral-700/75"
          />
        ))}
      </div>

      <div className="mt-8 xl:mt-9 w-full h-7 max-w-40 bg-gray-300/80 dark:bg-neutral-700/75" />
      <div className="mt-2 w-full h-8 max-w-64 bg-gray-300/80 dark:bg-neutral-700/75" />

      <div className="mt-4 grid grid-cols-1 xxs:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 3xl:grid-cols-5 gap-2 md:gap-2.5 lg:gap-3 2xl:gap-4">
        {[...Array(10)].map((_, idx) => (
          <div
            key={`meal-skeleton-${idx}`}
            className="min-w-14 min-h-48 lg:min-h-72 lg:min-w-36 rounded-2xl bg-gray-300/80 dark:bg-neutral-700/75"
          />
        ))}
      </div>

      <span className="sr-only">Loading...</span>
    </div>
  )
}
