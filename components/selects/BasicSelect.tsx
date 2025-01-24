import { firey } from "@/utils"
import React from "react"

type Props = {
  name: string
  customName?: string
  values: string[]
  selected?: string
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void
  className?: string
  props?: React.SelectHTMLAttributes<HTMLSelectElement>
}

export default function BasicSelection({
  name,
  customName,
  className,
  values,
  selected,
  props,
  onChange,
}: Props) {
  const newName = customName ? firey.camelize(customName) : firey.camelize(name)
  return (
    <fieldset className={className}>
      <legend className="text-sm font-semibold opacity-90 mb-0.5">
        {name}
      </legend>
      <select
        onChange={onChange}
        value={selected}
        {...props}
        name={newName}
        className="py-1.5 px-1.5 pe-9 block w-full border border-neutral-300 dark:border-neutral-600 text-sm rounded-sm disabled:opacity-50 disabled:pointer-events-none dark:bg-neutral-700 text-neutral-600 dark:text-neutral-400 focus:outline-blue-400 focus:outline focus:ring-blue-400"
      >
        {values.map((item, idx) => (
          <option
            key={`selection-${newName.toLowerCase().trim()}-${idx}`}
            value={item}
            className="bg-neutral-100 dark:bg-neutral-800"
          >
            {item}
          </option>
        ))}
      </select>
    </fieldset>
  )
}
