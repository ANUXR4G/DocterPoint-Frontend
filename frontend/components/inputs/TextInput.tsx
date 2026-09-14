import { firey } from "@/utils"
import React from "react"

type Props = {
  name: string
  value: string | number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBlur?: (e: React.FocusEvent<HTMLInputElement, Element>) => void
  placeHolder?: string
  customName?: string
  indent?: string
  type?: React.HTMLInputTypeAttribute
  valid?: boolean
}

export default function Input({
  name,
  value,
  onChange,
  onBlur,
  placeHolder,
  customName,
  indent,
  type = "text",
  valid,
}: Props) {
  const newName = customName ? firey.camelize(customName) : firey.camelize(name)
  return (
    <div className="flex flex-col">
      <label
        htmlFor={newName}
        className="text-sm font-semibold opacity-90 mb-0.5"
      >
        {name}
      </label>
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        id={newName}
        name={newName}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeHolder ? placeHolder : `Type ${name}`}
        spellCheck={false}
        className={`form-input text-sm font-medium border border-neutral-300 dark:border-neutral-600 ${
          valid && `outline outline-1 outline-offset-1 outline-red-600`
        } ${
          indent ? indent : `indent-1.5`
        } py-1.5 rounded-[4px] -ml-0.5`}
      />
    </div>
  )
}
