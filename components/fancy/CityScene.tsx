import Image from "next/image"

type Props = {
  content: string
  className?: string
}

export default function CityScene({ content, className }: Props) {
  return (
    <div className={`center flex-col`}>
      <div
        className={
          className
            ? className
            : `relative size-48 [@media(max-height:442px)]:size-36 [@media(min-height:768px)]:size-72`
        }
      >
        <Image
          fill
          src="https://res.cloudinary.com/dwhlynqj3/image/upload/v1736629615/glucoguide/city.svg"
          alt="doctors_standing.svg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority
          className="contrast-75 mix-blend-luminosity opacity-60"
        />
      </div>
      <h1 className="leading-8 text-2xl lg:leading-[64px] lg:text-5xl bg-gradient-to-r font-bold from-blue-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400 bg-clip-text text-transparent">
        {content}
      </h1>
    </div>
  )
}
