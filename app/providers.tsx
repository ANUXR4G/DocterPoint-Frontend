"use client"

import { createContext, useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "react-query"

export type ThemeOptions = "light" | "dark" | "system"

type AppState = {
  showMenu: boolean
  sidebarExpanded: boolean
  toggleMenu: () => void
  expandSidebar: () => void
  closeMenu: () => void
  theme: ThemeOptions | null
  changeTheme: (theme: ThemeOptions) => void
}

const initialState: AppState = {
  showMenu: false,
  sidebarExpanded: false,
  theme: null,
  toggleMenu: () => {},
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
  const [theme, setTheme] = useState<ThemeOptions | null>(null)
  const [showMenu, setShowMenu] = useState<boolean>(false)
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

  function changeTheme(theme: ThemeOptions) {
    // changes to dark mode if the current mode is light
    if (
      theme === "dark" ||
      (theme === "system" &&
        !("theme" in localStorage) &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    ) {
      document.documentElement.classList.add("dark")
      localStorage.setItem("theme", "dark")
    }

    // changes to light mode if the current mode is dark
    if (theme === "light") {
      document.documentElement.classList.remove("dark")
      localStorage.setItem("theme", "light")
    }

    if (theme === "system") {
      localStorage.removeItem("theme")
    }
  }

  useEffect(() => {
    const currentTheme = localStorage.getItem("theme")
    if (currentTheme === "light") {
      setTheme("light")
    } else if (currentTheme === "dark") {
      setTheme("dark")
    } else {
      setTheme("system")
    }
  }, [])

  useEffect(() => {
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
          sidebarExpanded,
          toggleMenu,
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
