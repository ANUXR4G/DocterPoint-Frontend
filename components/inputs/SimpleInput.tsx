import { firey } from "@/utils"
import { memo } from "react"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  name: string
  info?: string
  containerClassName?: string
}

const SimpleInput = memo(function MemoInput({
  name,
  value,
  info,
  type = "text",
  onChange,
  className,
  containerClassName,
  ...props
}: InputProps) {
  // console.log(`${name} is typing.`)

  return (
    <div className={`w-full ${containerClassName}`}>
      <label className="font-semibold text-xs xxs:text-sm opacity-90">
        {firey.camelToCapitalize(name)}
      </label>
      <input
        className={`w-full mt-0.5 rounded-sm indent-2 outline outline-1 outline-neutral-300 dark:outline-neutral-600 focus:outline-blue-400 text-sm text-neutral-600 dark:text-neutral-400 py-1.5 placeholder:text-neutral-500 placeholder:opacity-70 dark:placeholder:text-neutral-500 ${className}`}
        name={name}
        value={value}
        type={type}
        onChange={onChange}
        spellCheck="false"
        {...props}
      />
      {info && (
        <p className="text-nowrap text-xs mt-0.5 font-medium text-neutral-400">
          *{info}
        </p>
      )}
    </div>
  )
})

export default SimpleInput
