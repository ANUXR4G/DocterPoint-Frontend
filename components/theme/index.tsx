"use client"

import { useEffect, useState } from "react"
import { SystemMode } from "./SystemMode"
import { LigthMode } from "./LightMode"
import { DarkMode } from "./DarkMode"
import { useAppContext } from "@/hooks/useAppContext"
import { ThemeOptions } from "@/app/providers"

const themes = [
  { name: "system", component: <SystemMode /> },
  { name: "dark", component: <DarkMode /> },
  { name: "light", component: <LigthMode /> },
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
    <div className="-ml-1.5 mt-5 lg:mt-4 center md:justify-start flex-wrap gap-7 pb-8">
      {themes.map(({ name, component }, idx) => (
        <div key={`apperance-mode-${idx}`} className="flex flex-col">
          <div
            className={`cursor-pointer [&_svg]:rounded-xl outline-offset-4 rounded-xl border dark:border-transparent shadow-md flex flex-col ${
              !loading && currentTheme === name && `outline outline-indigo-600`
            }`}
            onClick={() => handleThemeChange(name as ThemeOptions)}
          >
            {component}
          </div>
          <span className={`font-bold text-center mt-2`}>{name}</span>
        </div>
      ))}
    </div>
  )
}
