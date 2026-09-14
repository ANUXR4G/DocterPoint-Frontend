"use client"

import { useEffect, useState } from "react"
import { SystemMode } from "./SystemMode"
import { LigthMode } from "./LightMode"
import { DarkMode } from "./DarkMode"
import { useAppContext } from "@/hooks/useAppContext"
import { ThemeOptions } from "@/app/providers"
import { THEME_COLORS, type ThemeColor } from "@/lib/themeColors"
import { TEXT_SIZES, type TextSize } from "@/lib/textSize"
import { doctorServices } from "@/lib/services/doctor"
import { userService } from "@/lib/services/user"
import { cookies } from "@/utils/cookies"
import { useRole } from "@/hooks/useRole"
import { Check } from "lucide-react"

const themes = [
  { name: "system", component: <SystemMode /> },
  { name: "dark", component: <DarkMode /> },
  { name: "light", component: <LigthMode /> },
]

export default function ThemeUI() {
  const role = useRole()
  const [loading, setLoading] = useState(true)
  const { theme, changeTheme, themeColor, changeThemeColor, textSize, changeTextSize } =
    useAppContext()
  const [currentTheme, setCurrentTheme] = useState<ThemeOptions>(
    theme || "system",
  )

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  function handleThemeChange(mode: ThemeOptions) {
    changeTheme(mode)
    setCurrentTheme(mode)
  }

  function handleColorChange(color: ThemeColor) {
    changeThemeColor(color)
  }

  async function persistTextSize(next: TextSize) {
    setSaving(true)
    setError("")
    setMessage("")
    changeTextSize(next)
    try {
      const token = cookies.getCookie("access_token") || ""
      if (role === "doctor") {
        await doctorServices.updateThemePreferences(token, { textSize: next })
      } else if (role === "user") {
        await userService.updateThemePreferences(token, { textSize: next })
      } else {
        throw new Error("Sign in to save text size preference.")
      }
      setMessage("Text size saved to your account.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save text size.")
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (theme) setLoading(false)
  }, [theme])

  useEffect(() => {
    if (theme) setCurrentTheme(theme)
  }, [theme])

  return (
    <div className="mt-5 space-y-10 pb-8 lg:mt-4">
      <section>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">Mode</h3>
        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-white">
          Choose how the interface follows light or dark appearance.
        </p>
        <div className="mt-4 grid grid-cols-1 min-[360px]:grid-cols-3 gap-3 sm:gap-4">
          {themes.map(({ name, component }, idx) => (
            <div key={`apperance-mode-${idx}`} className="flex min-w-0 flex-col">
              <div
                className={`flex cursor-pointer flex-col overflow-hidden rounded-xl border shadow-md outline-offset-4 dark:border-transparent [&_svg]:h-auto [&_svg]:w-full [&_svg]:rounded-xl ${
                  !loading && currentTheme === name
                    ? "outline outline-2 outline-[var(--theme-primary)]"
                    : ""
                }`}
                onClick={() => handleThemeChange(name as ThemeOptions)}
              >
                {component}
              </div>
              <span className="mt-2 text-center text-base font-bold capitalize sm:text-lg">
                {name}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="text-base font-bold">Theme colour</h3>
        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-white">
          Pick an accent colour for buttons, links, and highlights.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {THEME_COLORS.map((color) => {
            const selected = themeColor === color.id
            return (
              <button
                key={color.id}
                type="button"
                title={color.label}
                aria-label={`${color.label} theme colour`}
                aria-pressed={selected}
                onClick={() => handleColorChange(color.id)}
                className={`group relative flex size-9 items-center justify-center rounded-full border-2 transition ${
                  selected
                    ? "border-neutral-900 dark:border-white"
                    : "border-transparent hover:scale-105"
                }`}
                style={{ backgroundColor: color.primary }}
              >
                {selected ? (
                  <Check
                    className="size-4 text-white drop-shadow"
                    strokeWidth={3}
                  />
                ) : null}
                <span className="sr-only">{color.label}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-sm font-bold capitalize text-[var(--theme-primary)]">
          {THEME_COLORS.find((c) => c.id === themeColor)?.label ?? "Blue"}
        </p>
      </section>

      <section>
        <h3 className="text-base font-bold">Text size</h3>
        <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-white">
          Choose how large interface text appears. Saved to your account.
        </p>
        <div
          className="mt-4 flex rounded-xl border border-neutral-200 p-1 dark:border-neutral-700"
          role="group"
          aria-label="Text size"
        >
          {TEXT_SIZES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={saving}
              onClick={() => void persistTextSize(opt.id)}
              className={`flex-1 rounded-lg px-3 py-2.5 text-base font-bold transition ${
                textSize === opt.id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-black"
                  : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
          Preview: The quick brown fox jumps over the lazy dog.
        </p>
      </section>

      {message ? (
        <p className="text-sm font-bold text-green-700 dark:text-green-300">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm font-bold text-red-600">{error}</p>
      ) : null}
    </div>
  )
}
