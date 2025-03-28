import { DoctorAppointments } from "@/components"

type Props = {}

export default function DoctorAppointmentPage({}: Props) {
  return (
    <div className="max-w-[1536px] mx-auto">
      <h1 className="ml-2 text-start text-xl lg:text-3xl text-neutral-500 font-semibold">
        Appointment History
      </h1>
      <DoctorAppointments />
    </div>
  )
}
