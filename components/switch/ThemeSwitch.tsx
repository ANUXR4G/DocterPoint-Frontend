"use client"

import { useEffect, useState } from "react"

import { Icon } from "@/components"
import { useAppContext } from "@/hooks/useAppContext"

export default function ThemeSwitch() {
  const { changeTheme, theme } = useAppContext()
  const [checked, setChecked] = useState<boolean>(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const isDarkSelected = e.target.checked
    setChecked(isDarkSelected)
    changeTheme(isDarkSelected ? "dark" : "light")
  }

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const isDark =
      theme === "dark" ||
      ((theme === "system" || !theme) && media.matches)
    setChecked(isDark)
  }, [theme])

  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:cursor-pointer hover:bg-zinc-200/70 group dark:hover:bg-neutral-700/60">
      <div className="relative w-16">
        <input
          type="checkbox"
          id="theme-switch"
          className="h-8 w-full appearance-none rounded-full border border-gray-300 px-1 hover:cursor-pointer disabled:pointer-events-none before:mt-1 before:inline-block before:size-6 before:translate-x-0 before:rounded-full before:bg-white before:shadow before:ring-0 before:transition before:duration-200 before:ease-in-out checked:before:translate-x-[125%] dark:border-neutral-500 dark:before:bg-neutral-200 dark:checked:before:bg-neutral-200"
          onChange={handleChange}
          checked={checked}
        />
        <label htmlFor="theme-switch" className="sr-only">
          theme
        </label>
        <div className="pointer-events-none absolute -bottom-0.5 left-2 top-1/2 -translate-y-1/2">
          <Icon className="mt-[1px] size-4" name="sun" />
        </div>
        <div className="pointer-events-none absolute -bottom-0.5 right-2 top-1/2 -translate-y-1/2">
          <Icon className="mt-[1px] size-4" name="moon" />
        </div>
      </div>
      <span className="-mt-0.5 text-sm font-semibold text-neutral-700 opacity-80 group-hover:opacity-100 dark:text-neutral-200">
        Theme
      </span>
    </div>
  )
}
