import { useEffect } from "react"

export function useKeyPress(key: string, handler: () => void) {
  useEffect(() => {
    function keyUpHandler(e: globalThis.KeyboardEvent) {
      if (e.key === key) {
        e.preventDefault()
        handler && handler()
      }
    }

    document.addEventListener("keyup", keyUpHandler)

    return () => {
      document.removeEventListener("keyup", keyUpHandler)
    }
  }, [key, handler])
}
