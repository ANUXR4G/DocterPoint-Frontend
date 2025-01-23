import { Checkbox } from ".."
import { firey } from "@/utils"

type Props = {
  values: string[]
  title?: string
  active?: string
  options?: string[]
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void
  containerClassName?: string
  innerClassName?: string
}

export default function MultiOptions({
  title,
  active,
  values,
  options,
  onChange,
  containerClassName,
  innerClassName,
}: Props) {
  return (
    <fieldset className={containerClassName}>
      {title && (
        <legend className="text-sm font-semibold opacity-90">
          {firey.camelToCapitalize(title)}
        </legend>
      )}

      <div className={`flex flex-wrap mt-2 gap-2 ${innerClassName}`}>
        {values.map((value, idx) => (
          <Checkbox
            key={`${firey.camelize(title || "multi-options-")}-${idx}`}
            name={firey.camelize(value)}
            value={value}
            active={active ? active === value : !!options?.includes(value)}
            onChange={onChange}
          />
        ))}
      </div>
    </fieldset>
  )
}
