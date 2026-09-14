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
  const floated = Boolean(label) && hasValue

  return (
    <div
      className={`form-input-shell group relative flex h-14 w-full min-w-0 items-center overflow-hidden px-4 ${
        hasError
          ? "!border-red-500 !shadow-[0_0_0_3px_rgba(239,68,68,0.12)] focus-within:!border-red-500 focus-within:!shadow-[0_0_0_3px_rgba(239,68,68,0.12)]"
          : ""
      } ${disabled || readOnly ? "opacity-70" : ""} ${className ?? ""}`}
    >
      {icon ? (
        <div
          className="mr-3 flex h-8 w-9 shrink-0 items-center justify-center border-r border-neutral-300 pr-3 text-neutral-600 dark:border-neutral-600 dark:text-neutral-300"
          aria-hidden
        >
          <Icon name={icon} className="size-5 opacity-90" />
        </div>
      ) : null}

      <div className="relative h-full min-w-0 flex-1">
        <input
          type={type ?? "text"}
          id={name}
          name={name}
          className={`form-input peer box-border h-full w-full min-w-0 border-none bg-transparent text-base font-semibold outline-none placeholder:text-transparent dark:placeholder:text-transparent ${
            label
              ? floated
                ? "pb-1.5 pt-5 leading-snug"
                : "leading-[3.5rem] focus:pb-1.5 focus:pt-5 focus:leading-snug"
              : "leading-[3.5rem]"
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
        {label ? (
          <label
            htmlFor={name}
            className={`pointer-events-none absolute left-0 max-w-full truncate font-semibold transition-all duration-200 ${
              floated
                ? "top-1.5 translate-y-0 text-xs text-neutral-500 dark:text-neutral-400"
                : "top-1/2 -translate-y-1/2 text-base font-medium text-neutral-600 dark:text-neutral-300 peer-focus:top-1.5 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-[var(--theme-primary)]"
            } peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs peer-[:not(:placeholder-shown)]:text-neutral-500 dark:peer-[:not(:placeholder-shown)]:text-neutral-400`}
          >
            {label}
          </label>
        ) : null}
      </div>
    </div>
  )
})

export default IconInput
