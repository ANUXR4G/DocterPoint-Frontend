type Props = {
  values: any
  name: string
  disableIds?: number[]
  customFields?: ((value: any) => JSX.Element)[]
  bodyClassName?: string
}

export default function Table({
  values,
  name,
  bodyClassName,
  disableIds = [],
  customFields = [],
}: Props) {
  if (
    (disableIds && disableIds.length) !== (customFields && customFields.length)
  ) {
    throw new Error(`Provide same length of disable ids and custom renders.`)
  }

  const tableFields = Object.keys(values[0] || [])

  return (
    <div className="rounded-2xl overflow-x-auto custom-scroll [&::-webkit-scrollbar]:h-2">
      <table className="w-full min-w-[768px] text-gray-500 dark:text-neutral-300">
        {/* Table heads */}
        <thead className="bg-zinc-200/50 dark:bg-neutral-500/50">
          <tr>
            {tableFields.map((field, idx) => (
              <th
                key={`${name}-h-${idx}`}
                className="px-2 py-2.5 capitalize text-xs font-medium"
              >
                {field.split("_").join(" ")}
              </th>
            ))}
          </tr>
        </thead>

        {/* Table body */}
        <tbody className={`divide-y divide-gray-200`}>
          {values.map((item: any, idx: number) => (
            <tr key={`${name}-b-${idx}`}>
              {Object.values(item).map((val: any, i) => (
                <td
                  key={`${name}-b-${idx}-${i}`}
                  className={`p-2 text-sm text-center font-medium ${bodyClassName}`}
                >
                  {/* Render custom component if provided */}
                  {disableIds.includes(i)
                    ? customFields[disableIds.indexOf(i)](val)
                    : val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
