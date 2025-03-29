import { AppointmentAnalytics, DoctorAppointments } from "@/components"

export default function DoctorAppointmentPage() {
  return (
    <div className="max-w-[1536px] mx-auto">
      {/* Analysis Chart */}
      <AppointmentAnalytics />

      {/* Appointment History */}
      <DoctorAppointments />
    </div>
  )
}
