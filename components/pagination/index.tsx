"use client"

type Props = {
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
  handlePreviousPage: () => void
  handleNextPage: () => void
  /** Max numbered buttons to show at once. */
  pageCount?: number
  className?: string
}

function pageWindow(
  currentPage: number,
  totalPages: number,
  pageCount: number,
): number[] {
  if (totalPages <= 0) return []
  const size = Math.max(1, Math.min(pageCount, totalPages))
  let start = Math.max(1, currentPage - Math.floor(size / 2))
  let end = start + size - 1
  if (end > totalPages) {
    end = totalPages
    start = Math.max(1, end - size + 1)
  }
  const pages: number[] = []
  for (let i = start; i <= end; i++) pages.push(i)
  return pages
}

export default function Pagination({
  totalPages,
  currentPage,
  onPageChange,
  handlePreviousPage,
  handleNextPage,
  pageCount = 5,
  className = "mt-4",
}: Props) {
  if (totalPages <= 1) return null

  const pages = pageWindow(currentPage, totalPages, pageCount)
  const canPrev = currentPage > 1
  const canNext = currentPage < totalPages

  const btnBase =
    "inline-flex h-9 min-w-9 shrink-0 items-center justify-center px-3 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900"

  return (
    <nav
      aria-label="Pagination"
      className={`${className} inline-flex w-fit max-w-full items-center overflow-hidden rounded-lg border border-neutral-300 bg-white text-neutral-800 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100`}
    >
      <button
        type="button"
        onClick={handlePreviousPage}
        disabled={!canPrev}
        aria-label="Previous page"
        className={`${btnBase} border-r border-neutral-300 dark:border-neutral-600 ${
          canPrev
            ? "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            : "cursor-not-allowed opacity-40"
        }`}
      >
        Previous
      </button>
      {pages.map((page) => {
        const active = currentPage === page
        return (
          <button
            type="button"
            key={`pagination_page_${page}`}
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={active ? "page" : undefined}
            className={`${btnBase} border-r border-neutral-300 dark:border-neutral-600 ${
              active
                ? "bg-[var(--theme-primary)] text-[var(--theme-primary-foreground,#fff)]"
                : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
          >
            {page}
          </button>
        )
      })}
      <button
        type="button"
        onClick={handleNextPage}
        disabled={!canNext}
        aria-label="Next page"
        className={`${btnBase} ${
          canNext
            ? "hover:bg-neutral-100 dark:hover:bg-neutral-800"
            : "cursor-not-allowed opacity-40"
        }`}
      >
        Next
      </button>
    </nav>
  )
}
