"use client"

import { useEffect, useMemo, useState } from "react"

export const DEFAULT_TABLE_PAGE_SIZE = 10
export const TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

export type ClientPagination<T> = {
  page: number
  setPage: (page: number) => void
  pageSize: number
  setPageSize: (size: number) => void
  totalPages: number
  totalItems: number
  pageItems: T[]
  from: number
  to: number
  handlePreviousPage: () => void
  handleNextPage: () => void
  handlePageChange: (page: number) => void
}

/**
 * Client-side paging for filtered table rows.
 * Resets to page 1 when the filtered set shrinks below the current window
 * or when `resetKey` changes (search / tab filters).
 */
export function useClientPagination<T>(
  items: T[],
  opts?: { pageSize?: number; resetKey?: string | number },
): ClientPagination<T> {
  const initialSize = opts?.pageSize ?? DEFAULT_TABLE_PAGE_SIZE
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeState] = useState(initialSize)

  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize) || 1)

  useEffect(() => {
    setPage(1)
  }, [opts?.resetKey, pageSize])

  useEffect(() => {
    setPage((current) => Math.min(Math.max(1, current), totalPages))
  }, [totalPages])

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, page, pageSize])

  function setPageSize(size: number) {
    const next = Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_TABLE_PAGE_SIZE
    setPageSizeState(next)
  }

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    totalItems,
    pageItems,
    from: totalItems === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, totalItems),
    handlePreviousPage: () => setPage((p) => Math.max(1, p - 1)),
    handleNextPage: () => setPage((p) => Math.min(totalPages, p + 1)),
    handlePageChange: (next: number) =>
      setPage(Math.min(Math.max(1, next), totalPages)),
  }
}
