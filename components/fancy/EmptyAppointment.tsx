import Image from "next/image"

export default function EmptyAppointment() {
  return (
    <div className="center flex-col">
      <div className="relative size-48 mt-12 [@media(max-height:442px)]:size-36 [@media(max-height:442px)]:mt-0 [@media(min-height:768px)]:size-72 [@media(min-height:768px)]:mt-32">
        <Image
          fill
          src="https://res.cloudinary.com/dwhlynqj3/image/upload/v1736348091/glucoguide/info_tab_new.svg"
          alt="doctors_standing.svg"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          priority
        />
      </div>
      <h1 className="leading-8 text-2xl lg:leading-[64px] lg:text-5xl bg-gradient-to-r font-bold from-blue-500 to-cyan-500 dark:from-emerald-400 dark:to-cyan-400 bg-clip-text text-transparent">
        Start Booking Appointments
      </h1>
    </div>
  )
}
