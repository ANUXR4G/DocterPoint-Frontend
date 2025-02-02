"use client"

import { createContext, useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "react-query"

export type ThemeOptions = "light" | "dark" | "system"

type AppState = {
  showMenu: boolean
  showChat: boolean
  sidebarExpanded: boolean
  toggleMenu: () => void
  toggleChat: () => void
  expandSidebar: () => void
  closeMenu: () => void
  theme: ThemeOptions | null
  changeTheme: (theme: ThemeOptions) => void
}

const initialState: AppState = {
  showMenu: false,
  showChat: false,
  sidebarExpanded: false,
  theme: "system",
  toggleMenu: () => {},
  toggleChat: () => {},
  expandSidebar: () => {},
  closeMenu: () => {},
  changeTheme: () => {},
}

// create a new context for the counter
export const AppContext = createContext(initialState)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // ignore stale
      refetchOnWindowFocus: false,
    },
  },
})

function Providers({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeOptions>("system")
  const [showMenu, setShowMenu] = useState<boolean>(false)
  const [showChat, setShowChat] = useState<boolean>(false)
  const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(false)

  // open sidebar
  function toggleMenu() {
    setShowMenu((prev) => !prev)
  }

  // expand sidebar
  function expandSidebar() {
    setSidebarExpanded((prev) => !prev)
  }

  // close menu
  function closeMenu() {
    setShowMenu(false)
  }

  // show help modal
  function toggleChat() {
    setShowChat((prev) => !prev)
  }

  // change theme
  function changeTheme(theme: ThemeOptions) {
    if (theme === "system") {
      localStorage.removeItem("theme")
    }

    setTheme(theme)
  }

  useEffect(() => {
    const storedTheme = (localStorage.getItem("theme") ||
      "system") as ThemeOptions
    setTheme(storedTheme)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const root = document.documentElement
    const systemPrefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches

    const isDark = theme === "dark" || (theme === "system" && systemPrefersDark)

    if (isDark) {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }

    if (theme !== "system") {
      localStorage.setItem("theme", theme)
    }
  }, [theme])

  useEffect(() => {
    if (typeof window === "undefined") return

    function setVH() {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty("--vh", `${vh}px`)
    }

    setVH()
    window.addEventListener("resize", setVH)

    return () => window.removeEventListener("resize", setVH)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider
        value={{
          showMenu,
          showChat,
          sidebarExpanded,
          toggleMenu,
          toggleChat,
          expandSidebar,
          closeMenu,
          changeTheme,
          theme,
        }}
      >
        {children}
      </AppContext.Provider>
    </QueryClientProvider>
  )
}

export { Providers, queryClient }
