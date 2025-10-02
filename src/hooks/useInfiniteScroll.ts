import { useEffect, useRef, useCallback, useState } from 'react'

interface UseInfiniteScrollOptions {
  threshold?: number // Distance from bottom to trigger load (in pixels)
  rootMargin?: string // IntersectionObserver rootMargin
}

interface UseInfiniteScrollReturn {
  hasMore: boolean
  isLoading: boolean
  page: number
  setHasMore: (hasMore: boolean) => void
  setIsLoading: (isLoading: boolean) => void
  setPage: (page: number) => void
  resetPagination: () => void
  observerTarget: React.RefObject<HTMLDivElement>
}

/**
 * Custom hook for implementing infinite scroll pagination
 *
 * @example
 * const { observerTarget, hasMore, isLoading, page, setHasMore, setIsLoading, setPage, resetPagination } = useInfiniteScroll({
 *   threshold: 100,
 *   onLoadMore: async (page) => {
 *     const data = await fetchData(page)
 *     if (data.length === 0) setHasMore(false)
 *     return data
 *   }
 * })
 */
export function useInfiniteScroll(_options: UseInfiniteScrollOptions = {}): UseInfiniteScrollReturn {
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [page, setPage] = useState(1)
  const observerTarget = useRef<HTMLDivElement>(null)

  const resetPagination = useCallback(() => {
    setPage(1)
    setHasMore(true)
    setIsLoading(false)
  }, [])

  return {
    hasMore,
    isLoading,
    page,
    setHasMore,
    setIsLoading,
    setPage,
    resetPagination,
    observerTarget
  }
}

/**
 * Hook for detecting when element is near viewport bottom
 */
export function useScrollTrigger(
  targetRef: React.RefObject<HTMLDivElement>,
  callback: () => void,
  options: { threshold?: number; enabled?: boolean } = {}
) {
  const { threshold = 100, enabled = true } = options

  useEffect(() => {
    if (!enabled || !targetRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0]
        if (first.isIntersecting) {
          callback()
        }
      },
      {
        threshold: 0.1,
        rootMargin: `0px 0px ${threshold}px 0px`
      }
    )

    const currentTarget = targetRef.current
    observer.observe(currentTarget)

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget)
      }
    }
  }, [targetRef, callback, threshold, enabled])
}
