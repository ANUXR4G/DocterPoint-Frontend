"use client"

import { createContext, useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { QueryClient, QueryClientProvider } from "react-query"
import {
  applyThemeColor,
  DEFAULT_THEME_COLOR,
  isThemeColor,
  type ThemeColor,
} from "@/lib/themeColors"
import {
  applyTextSize,
  DEFAULT_TEXT_SIZE,
  isTextSize,
  type TextSize,
} from "@/lib/textSize"
import { DashboardBgProvider } from "@/hooks/useDashboardBg"
import { AppearanceSync } from "@/components/theme/AppearanceSync"

/** Defer assistant + speech stack off every public/auth route's critical path. */
const GlucoBot = dynamic(() => import("@/components/assistant/GlucoBot"), {
  ssr: false,
})

export type ThemeOptions = "light" | "dark" | "system"

type AppState = {
  showMenu: boolean
  showHelp: boolean
  sidebarExpanded: boolean
  toggleMenu: () => void
  toggleHelp: () => void
  expandSidebar: () => void
  closeMenu: () => void
  theme: ThemeOptions | null
  changeTheme: (theme: ThemeOptions) => void
  themeColor: ThemeColor
  changeThemeColor: (color: ThemeColor) => void
  textSize: TextSize
  changeTextSize: (size: TextSize) => void
}

const initialState: AppState = {
  showMenu: false,
  showHelp: false,
  sidebarExpanded: false,
  theme: "system",
  themeColor: DEFAULT_THEME_COLOR,
  textSize: DEFAULT_TEXT_SIZE,
  toggleMenu: () => {},
  toggleHelp: () => {},
  expandSidebar: () => {},
  closeMenu: () => {},
  changeTheme: () => {},
  changeThemeColor: () => {},
  changeTextSize: () => {},
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
  const [isHydrated, setIsHydrated] = useState(false)
  const [theme, setTheme] = useState<ThemeOptions>("system")
  const [themeColor, setThemeColor] = useState<ThemeColor>(DEFAULT_THEME_COLOR)
  const [textSize, setTextSize] = useState<TextSize>(DEFAULT_TEXT_SIZE)
  const [showMenu, setShowMenu] = useState<boolean>(false)
  const [showHelp, setShowHelp] = useState<boolean>(false)
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
  function toggleHelp() {
    setShowHelp((prev) => !prev)
  }

  // change theme
  function changeTheme(next: ThemeOptions) {
    if (next === "system") {
      localStorage.removeItem("theme")
    }

    setTheme(next)
  }

  function changeThemeColor(color: ThemeColor) {
    setThemeColor(color)
    localStorage.setItem("theme-color", color)
    applyThemeColor(color)
  }

  const changeTextSize = useCallback((size: TextSize) => {
    setTextSize(size)
    localStorage.setItem("text-size", size)
    applyTextSize(size)
  }, [])

  useEffect(() => {
    const storedTheme = (localStorage.getItem("theme") ||
      "system") as ThemeOptions
    const storedColor = localStorage.getItem("theme-color")
    const storedTextSize = localStorage.getItem("text-size")
    setTheme(storedTheme)
    if (isThemeColor(storedColor)) {
      setThemeColor(storedColor)
      applyThemeColor(storedColor)
    } else {
      applyThemeColor(DEFAULT_THEME_COLOR)
    }
    if (isTextSize(storedTextSize)) {
      setTextSize(storedTextSize)
      applyTextSize(storedTextSize)
    } else {
      applyTextSize(DEFAULT_TEXT_SIZE)
    }
    setIsHydrated(true) // Mark that hydration is complete
  }, [])

  useEffect(() => {
    if (!isHydrated) return
    const root = document.documentElement
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    function applyTheme(current: ThemeOptions) {
      const isDark =
        current === "dark" || (current === "system" && media.matches)
      root.classList.toggle("dark", isDark)
      root.style.colorScheme = isDark ? "dark" : "light"
    }

    applyTheme(theme)

    if (theme !== "system") {
      localStorage.setItem("theme", theme)
    }

    function onSystemChange() {
      if (theme === "system") applyTheme("system")
    }

    media.addEventListener("change", onSystemChange)
    return () => media.removeEventListener("change", onSystemChange)
  }, [theme, isHydrated])

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
          showHelp,
          sidebarExpanded,
          toggleMenu,
          toggleHelp,
          expandSidebar,
          closeMenu,
          changeTheme,
          theme,
          themeColor,
          changeThemeColor,
          textSize,
          changeTextSize,
        }}
      >
        <DashboardBgProvider>
          <AppearanceSync />
          {children}
          <GlucoBot />
        </DashboardBgProvider>
      </AppContext.Provider>
    </QueryClientProvider>
  )
}

export { Providers, queryClient }
