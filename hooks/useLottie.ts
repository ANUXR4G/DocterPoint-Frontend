import { useEffect, useRef } from "react"

export function useLottie<T>(animationData: T) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const container = ref.current
    if (!container) return

    let cancelled = false
    let animation: { destroy: () => void } | undefined

    import("lottie-web").then(({ default: lottie }) => {
      if (cancelled || !ref.current) return

      ref.current.replaceChildren()
      animation = lottie.loadAnimation({
        container: ref.current,
        renderer: "svg",
        rendererSettings: {
          preserveAspectRatio: "xMinYMin slice",
        },
        loop: true,
        autoplay: true,
        animationData,
      })
    })

    return () => {
      cancelled = true
      animation?.destroy()
      container.replaceChildren()
    }
  }, [animationData])

  return { ref }
}
