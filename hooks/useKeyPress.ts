import { useEffect } from "react"

export function useKeyPress(key: string, handler: () => void) {
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === key) {
        e.preventDefault()
        handler()
      }
    }

    document.addEventListener("keydown", onKeyDown)

    return () => {
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [key, handler])
}
