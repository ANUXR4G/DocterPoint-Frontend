"use client"

import Pagination from "@/components/pagination"
import {
  TABLE_PAGE_SIZE_OPTIONS,
  type ClientPagination,
} from "@/hooks/useClientPagination"

type Props<T> = {
  pagination: ClientPagination<T>
  /** Hide when there is only one page and few rows. Default true. */
  hideWhenSinglePage?: boolean
  className?: string
  label?: string
}

export default function TablePagination<T>({
  pagination,
  hideWhenSinglePage = true,
  className = "",
  label = "rows",
}: Props<T>) {
  const {
    page,
    totalPages,
    totalItems,
    from,
    to,
    pageSize,
    setPageSize,
    handlePreviousPage,
    handleNextPage,
    handlePageChange,
  } = pagination

  if (totalItems === 0) return null
  if (hideWhenSinglePage && totalPages <= 1 && totalItems <= pageSize) {
    return (
      <div
        className={`flex flex-wrap items-center justify-between gap-3 px-1 py-2 text-xs text-neutral-600 dark:text-neutral-300 ${className}`}
      >
        <p>
          Showing {totalItems} {label}
        </p>
        <label className="inline-flex items-center gap-2">
          <span className="opacity-70">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-900"
          >
            {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1 py-2 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-600 dark:text-neutral-300">
        <p>
          Showing {from}–{to} of {totalItems} {label}
        </p>
        <label className="inline-flex items-center gap-2">
          <span className="opacity-70">Per page</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-900"
          >
            {TABLE_PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      {totalPages > 1 ? (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          onPageChange={handlePageChange}
          handlePreviousPage={handlePreviousPage}
          handleNextPage={handleNextPage}
          className="mt-0"
        />
      ) : null}
    </div>
  )
}
