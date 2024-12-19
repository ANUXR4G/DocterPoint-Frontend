import React from "react"

type Props = {
  name: string
  value: string
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  active: boolean
  className?: string
  inputClass?: string
  labelClass?: string
}

export default function RadioInput({
  name,
  value,
  onChange,
  active,
  className,
  inputClass,
  labelClass,
}: Props) {
  return (
    <label
      htmlFor={`${name}__id__f`}
      className={`flex items-center ${labelClass} space-y-1`}
    >
      {" "}
      <input
        type="radio"
        id={`${name}__id__f`}
        name={name}
        value={value}
        className={`peer/active appearance-none ${inputClass}`}
        checked={active}
        onChange={onChange}
      />{" "}
      <span className="block size-3.5 mr-2 border-2 peer-checked/active:ring-1 peer-checked/active:ring-neutral-400 peer-checked/active:dark:ring-0 rounded-full peer-checked/active:bg-blue-500 cursor-pointer"></span>{" "}
      <span className="font-medium peer-checked/active:text-blue-500 cursor-pointer">
        {value}
      </span>{" "}
    </label>
  )
}
