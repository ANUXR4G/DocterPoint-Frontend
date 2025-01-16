import { useEffect, useRef } from "react"

type IntersectionObserverHookArgs = {
  root: Element | null
  rootMargin?: string
  threshold?: number | number[]
  onIntersect: () => void
}

export function useObserver({
  root = null,
  rootMargin = "0px",
  threshold = 0.1,
  onIntersect,
}: IntersectionObserverHookArgs) {
  const observerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const node = observerRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onIntersect()
        }
      },
      { root, rootMargin, threshold }
    )

    observer.observe(node)

    return () => {
      if (node) observer.unobserve(node)
    }
  }, [root, rootMargin, threshold, onIntersect])

  return observerRef
}
