"use client"

import { useEffect, useState } from "react"

import { Icon } from "@/components"
import { useAppContext } from "@/hooks/useAppContext"

export default function ThemeSwitch() {
  const { changeTheme, theme } = useAppContext()
  const [checked, setChecked] = useState<boolean>(false)

  // handle changing theme on input change
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const isDarkSelected = e.target.checked
    setChecked(e.target.checked)
    if (isDarkSelected) {
      changeTheme("dark")
    } else {
      changeTheme("light")
    }
  }

  // update the switch state
  useEffect(() => {
    const root = document.documentElement
    setChecked(!!root.classList.contains("dark"))
  }, [])

  return (
    <div className="py-1 px-2 rounded-md flex items-center gap-2 hover:bg-zinc-200/70 dark:hover:bg-neutral-700/60 hover:cursor-pointer group">
      <div className="w-16 relative">
        <input
          type="checkbox"
          id="theme-switch"
          className="appearance-none hover:cursor-pointer w-full disabled:pointer-events-none border border-gray-300 dark:border-neutral-500 h-8 px-1 rounded-full before:inline-block before:size-6 before:mt-1 before:bg-white before:translate-x-0 checked:before:translate-x-[125%] before:rounded-full before:shadow before:transform before:ring-0 before:transition before:ease-in-out before:duration-200 dark:before:bg-neutral-200 dark:checked:before:bg-neutral-200"
          onChange={handleChange}
          checked={checked}
        />
        <label htmlFor="theme-switch" className="sr-only">
          theme
        </label>
        <div className="absolute top-1/2 -translate-y-1/2 -bottom-0.5 left-2 pointer-events-none ">
          <Icon className="size-4 mt-[1px]" name="sun" />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 -bottom-0.5 right-2 pointer-events-none ">
          <Icon className="size-4 mt-[1px]" name="moon" />
        </div>
      </div>
      <span className="-mt-0.5 text-sm font-semibold opacity-80 group-hover:opacity-100">
        Theme
      </span>
    </div>
  )
}
