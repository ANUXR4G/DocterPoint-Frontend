"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

type Props = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  className?: string
  name?: string
}

/** Password box with an eye button. Use a second one labeled Confirm password when a password is being set. */
export default function PasswordField({
  value,
  onChange,
  placeholder = "Password",
  autoComplete = "new-password",
  className = "",
  name,
}: Props) {
  const [show, setShow] = useState(false)

  return (
    <div className="relative">
      <input
        name={name}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-white"
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow((v) => !v)}
      >
        {show ? (
          <EyeOff className="size-4" aria-hidden />
        ) : (
          <Eye className="size-4" aria-hidden />
        )}
      </button>
    </div>
  )
}
