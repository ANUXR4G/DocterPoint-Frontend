import React from "react"
import Icon from "../icons"

type Props = {
  className?: string
}

export default function SimpleSpinner({ className }: Props) {
  return (
    <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 ${className}`}>
      <Icon
        name="spinning-loader"
        className="fill-[--primary-black] dark:fill-[--primary-white]"
      />
    </div>
  )
}
