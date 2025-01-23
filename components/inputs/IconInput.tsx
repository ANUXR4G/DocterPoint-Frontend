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
}: Props) {
  return (
    <div
      className={`flex items-center relative h-16 border border-neutral-400 dark:border-neutral-600 rounded-md px-5 group ${
        !!error && `outline outline-1 border-red-600 outline-red-600`
      } ${className && className}`}
    >
      {icon && (
        <div className="mt-1 w-10 after:absolute after:contents[''] after:h-full after:border-r after:opacity-80 after:border-neutral-600 after:top-0 after:left-14">
          <Icon name={icon} className="size-5 opacity-80" />
        </div>
      )}
      <div className="relative w-full mt-3">
        <input
          type={type}
          id={name}
          name={name}
          className={`peer text-sm h-full block w-full px-4 py-2 border-none rounded-md focus:outline-none ${
            inputClassName && inputClassName
          }`}
          spellCheck="false"
          placeholder=" "
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          autoComplete={type === "password" ? "new-password" : "off"}
        />
        <label
          htmlFor={name}
          className="hover:cursor-text absolute text-xs text-gray-500 transition-all duration-200 transform left-4 font-medium -top-2 peer-placeholder-shown:top-0.5 peer-placeholder-shown:font-semibold peer-placeholder-shown:text-sm peer-focus:-top-2 peer-focus:text-xs peer-focus:font-medium peer-focus:text-blue-500 dark:peer-focus:text-blue-300"
        >
          {label}
        </label>
      </div>
    </div>
  )
})

export default IconInput
