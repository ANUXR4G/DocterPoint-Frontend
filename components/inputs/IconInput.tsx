import React from "react"
import Icon from "../icons"
import { IconNames } from "@/types"

type Props = {
  name: string
  value: string | number
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  icon?: IconNames
  type?: React.HTMLInputTypeAttribute
  label?: string
  onBlur?: (e: React.FocusEvent<HTMLInputElement, Element>) => void
  error?: string
  className?: string
  inputClassName?: string
  disabled?: boolean
  readOnly?: boolean
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  maxLength?: number
  autoComplete?: string
  placeholder?: string
}

const IconInput = React.memo(function IconInput({
  icon,
  type,
  label,
  error,
  onBlur,
  onChange,
  name,
  value,
  className,
  inputClassName,
  disabled,
  readOnly,
  inputMode,
  maxLength,
  autoComplete,
  placeholder = " ",
}: Props) {
  const hasValue = String(value ?? "").length > 0
  const hasError = Boolean(error)
  // Floating label needs a blank placeholder; real hint text would overlap the label.
  const inputPlaceholder = label ? " " : placeholder
  return (
    <div
      className={`form-input-shell flex w-full min-w-0 items-center relative min-h-[4.5rem] h-auto px-5 group ${
        hasError
          ? "!border-red-500 !shadow-[0_0_0_3px_rgba(239,68,68,0.12)] focus-within:!border-red-500 focus-within:!shadow-[0_0_0_3px_rgba(239,68,68,0.12)]"
          : ""
      } ${disabled || readOnly ? "opacity-70" : ""} ${className ?? ""}`}
    >
      {icon && (
        <div
          className="flex h-14 shrink-0 items-center justify-center w-10 pr-3 mr-3 border-r self-center text-neutral-600 dark:text-neutral-300 border-neutral-300 dark:border-neutral-600"
          aria-hidden
        >
          <Icon name={icon} className="size-5 opacity-90" />
        </div>
      )}
      <div className="relative h-14 w-full min-w-0 flex-1">
        <input
          type={type ?? "text"}
          id={name}
          name={name}
          className={`form-input peer block h-14 w-full min-w-0 rounded-md border-none bg-transparent pl-2.5 pr-1 text-base font-semibold leading-[3.5rem] focus:outline-none focus:pt-5 focus:pb-2 focus:leading-normal placeholder:text-transparent dark:placeholder:text-transparent ${
            hasValue ? "pt-5 pb-2 leading-normal" : ""
          }${inputClassName ? ` ${inputClassName}` : ""}`}
          spellCheck="false"
          placeholder={inputPlaceholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          disabled={disabled}
          readOnly={readOnly}
          inputMode={inputMode}
          maxLength={maxLength}
          autoComplete={
            autoComplete ?? (type === "password" ? "new-password" : "off")
          }
          aria-label={label || undefined}
        />
        <label
          htmlFor={name}
          className={`pointer-events-none absolute left-2.5 max-w-[calc(100%-0.75rem)] truncate font-semibold transition-all duration-200 text-neutral-500 dark:text-neutral-400 ${
            hasValue
              ? "top-2 translate-y-0 text-xs"
              : "top-1/2 -translate-y-1/2 text-base font-medium text-neutral-600 dark:text-neutral-300 peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-blue-600 dark:peer-focus:text-sky-400"
          } peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs`}
        >
          {label}
        </label>
      </div>
    </div>
  )
})

export default IconInput
