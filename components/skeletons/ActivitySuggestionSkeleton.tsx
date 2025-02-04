export default function ActivitySuggestionSkeleton() {
  return (
    <div
      role="status"
      className="mt-3 md:mt-4 w-full min-h-40 mb-3 lg:mb-0 grid grid-cols-3 gap-2 animate-pulse"
    >
      {[...Array(3)].map((_, idx) => (
        <div
          key={`recommendation_option_${idx}`}
          className={`w-full h-full rounded-2xl bg-gray-300/80 dark:bg-neutral-700/75`}
        ></div>
      ))}

      <span className="sr-only">Loading...</span>
    </div>
  )
}
