"use client"

import { useEffect, useState } from "react"
import { SystemMode } from "./SystemMode"
import { LigthMode } from "./LightMode"
import { DarkMode } from "./DarkMode"
import { useAppContext } from "@/hooks/useAppContext"
import { ThemeOptions } from "@/app/providers"

const themes = [
  { name: "light", component: <LigthMode /> },
  { name: "dark", component: <DarkMode /> },
  { name: "system", component: <SystemMode /> },
]

export default function ThemeUI() {
  const [loading, setLoading] = useState(true)
  const { theme, changeTheme } = useAppContext()
  const [currentTheme, setCurrentTheme] = useState<ThemeOptions>(
    theme || "system"
  )

  // handle changing the theme
  function handleThemeChange(mode: ThemeOptions) {
    changeTheme(mode)
    setCurrentTheme(mode)
  }

  useEffect(() => {
    if (theme) setLoading(false) // theme only run once at the inital render
  }, [theme])

  return (
    <div className="-ml-1.5 mt-5 lg:mt-4 center md:justify-start flex-wrap gap-8 lg:gap-7">
      {themes.map(({ name, component }, idx) => (
        <div
          key={`apperance-mode-${idx}`}
          className={`cursor-pointer [&_svg]:rounded-xl outline-offset-4 rounded-xl border dark:border-transparent shadow-md ${
            !loading && currentTheme === name && `outline outline-indigo-600`
          }`}
          onClick={() => handleThemeChange(name as ThemeOptions)}
        >
          {component}
        </div>
      ))}
    </div>
  )
}
