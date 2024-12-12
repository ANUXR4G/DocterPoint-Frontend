type Props = {
  totalPages: number
  currentPage: number
  onPageChange: (page: number) => void
  handlePreviousPage: () => void
  handleNextPage: () => void
  pageCount?: number // number of pages to show at a time
}

export default function Pagination({
  totalPages,
  currentPage,
  onPageChange,
  handlePreviousPage,
  handleNextPage,
  pageCount = 5,
}: Props) {
  const startPage = Math.max(currentPage - Math.floor(pageCount / 2), 1)
  const endPage = Math.min(startPage + pageCount - 1, totalPages)
  const pages = []

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i)
  }

  return (
    <div className="mt-10 text-sm flex mx-auto border border-neutral-400/80 dark:border-neutral-600 w-fit divide-x divide-neutral-400/80 dark:divide-neutral-600 rounded-md">
      <button
        onClick={handlePreviousPage}
        className={`px-4 py-2 ${
          currentPage > 1
            ? "hover:bg-neutral-300 dark:hover:bg-neutral-800 rounded-tl-md rounded-bl-md"
            : "cursor-not-allowed opacity-50"
        }`}
      >
        Previous
      </button>
      {pages.map((page) => (
        <button
          onClick={() => onPageChange(page)}
          key={`pagination_page_${page}`}
          className={`px-4 py-2 ${
            currentPage === page
              ? "bg-blue-600 dark:bg-blue-700 text-white"
              : "hover:bg-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {page}
        </button>
      ))}
      <button
        onClick={handleNextPage}
        className={`px-4 py-2 ${
          currentPage < totalPages
            ? "hover:bg-neutral-300 dark:hover:bg-neutral-800 rounded-tr-md rounded-br-md"
            : "cursor-not-allowed opacity-50"
        }`}
      >
        Next
      </button>
    </div>
  )
}
